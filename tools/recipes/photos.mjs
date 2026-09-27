// Фото для рецептов: Pexels + русская Википедия.
//   node tools/recipes/photos.mjs candidates   — собрать кандидатов и листы для выбора (в SHEETS_DIR)
//   node tools/recipes/photos.mjs apply        — скачать выбранные (photo_choice.json) в public/recipes/img
// Ключ Pexels — в .env.local (PEXELS=...), в репозиторий не попадает.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const HERE = path.join(ROOT, "tools/recipes");
const UA = "EmliRecipes/1.0 (dimaqwertyor@gmail.com)";
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const PEXELS = env.match(/^PEXELS=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
const SHEETS = process.env.SHEETS_DIR ?? path.join(HERE, ".sheets");
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const recipes = readJson(path.join(ROOT, "public/recipes.json"), []);
const queries = readJson(path.join(HERE, "photo_queries.json"), {});
const candFile = path.join(HERE, "photo_candidates.json");

async function pexels(q, n = 8) {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${n}&orientation=landscape`, {
    headers: { Authorization: PEXELS },
  });
  if (res.status === 429) throw new Error("pexels rate limit");
  if (!res.ok) return [];
  const data = await res.json();
  return (data.photos ?? []).map((p) => ({
    source: "pexels",
    thumb: p.src.medium,
    full: p.src.large,
    author: p.photographer,
    link: p.url,
    alt: p.alt ?? "",
  }));
}

async function wikiImages(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const u =
      "https://ru.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail|name&pithumbsize=960&redirects=1&titles=" +
      encodeURIComponent(chunk.join("|"));
    const r = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
    const redirect = new Map([...(r.query.normalized ?? []), ...(r.query.redirects ?? [])].map((x) => [x.to, x.from]));
    for (const p of Object.values(r.query.pages)) {
      if (!p.thumbnail) continue;
      let t = p.title;
      while (redirect.has(t)) t = redirect.get(t);
      out[t] = { file: p.pageimage, url: p.thumbnail.source };
    }
  }
  // Автор и лицензия файла — для подписи
  const files = Object.values(out).map((x) => "File:" + x.file);
  const meta = {};
  for (let i = 0; i < files.length; i += 40) {
    const u =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&titles=" +
      encodeURIComponent(files.slice(i, i + 40).join("|"));
    const r = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
    for (const p of Object.values(r.query?.pages ?? {})) {
      const m = p.imageinfo?.[0]?.extmetadata ?? {};
      const strip = (s) => (s ?? "").replace(/<[^>]+>/g, "").trim();
      meta[p.title.replace(/^File:/, "")] = {
        author: strip(m.Artist?.value).slice(0, 80) || "Wikimedia Commons",
        license: strip(m.LicenseShortName?.value),
        link: p.imageinfo?.[0]?.descriptionurl,
      };
    }
  }
  for (const [t, x] of Object.entries(out)) Object.assign(x, meta[x.file.replace(/_/g, " ")] ?? meta[x.file] ?? {});
  return out;
}

async function load(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function candidates() {
  if (!PEXELS) throw new Error("нет PEXELS в .env.local");
  const cand = readJson(candFile, {});
  const wikiTitles = [...new Set(Object.values(queries).map((q) => q.wiki).filter(Boolean))];
  const wiki = await wikiImages(wikiTitles);
  console.log("википедия:", Object.keys(wiki).length, "из", wikiTitles.length);
  let calls = 0;
  for (const r of recipes) {
    const q = queries[r.id];
    if (!q) continue;
    const list = [];
    const w = q.wiki && wiki[q.wiki];
    if (w) list.push({ source: "wiki", thumb: w.url, full: w.url, author: w.author, license: w.license, link: w.link, alt: q.wiki });
    let px = cand[r.id]?.filter((c) => c.source === "pexels");
    if (!px?.length) {
      px = await pexels(q.en[0], 8);
      calls++;
      if (px.length < 4 && q.en[1]) {
        px = [...px, ...(await pexels(q.en[1], 6))];
        calls++;
      }
      await sleep(300);
    }
    const seen = new Set();
    cand[r.id] = [...list, ...px].filter((c) => !seen.has(c.thumb) && seen.add(c.thumb)).slice(0, 9);
    fs.writeFileSync(candFile, JSON.stringify(cand, null, 1));
  }
  console.log("запросов к Pexels:", calls);
  await sheets(cand);
}

/** Листы 3×3 с номерами — чтобы выбрать фото глазами */
async function sheets(cand) {
  fs.mkdirSync(SHEETS, { recursive: true });
  const W = 320, H = 240;
  for (const r of recipes) {
    const list = cand[r.id] ?? [];
    const tiles = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const img = await sharp(await load(list[i].thumb)).resize(W, H, { fit: "cover" }).toBuffer();
        const label = Buffer.from(
          `<svg width="${W}" height="${H}"><rect x="6" y="6" width="44" height="34" rx="8" fill="#000" fill-opacity="0.75"/><text x="28" y="31" font-size="24" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">${i + 1}</text>${list[i].source === "wiki" ? `<text x="${W - 8}" y="${H - 10}" font-size="16" font-family="Arial" fill="#fff" text-anchor="end" stroke="#000" stroke-width="3" paint-order="stroke">wiki</text>` : ""}</svg>`,
        );
        tiles.push({ input: await sharp(img).composite([{ input: label }]).toBuffer(), left: (i % 3) * W, top: Math.floor(i / 3) * H });
      } catch {
        /* не скачалось — пропускаем */
      }
    }
    if (!tiles.length) continue;
    const rows = Math.ceil(list.length / 3);
    await sharp({ create: { width: W * 3, height: H * rows, channels: 3, background: "#111" } })
      .composite(tiles)
      .jpeg({ quality: 70 })
      .toFile(path.join(SHEETS, `${r.id}.jpg`));
  }
  console.log("листы →", SHEETS);
}

async function apply() {
  const cand = readJson(candFile, {});
  // Выбор может лежать в нескольких файлах: photo_choice.json, photo_choice_1.json, …
  const choice = Object.assign(
    {},
    ...fs
      .readdirSync(HERE)
      .filter((f) => /^photo_choice(_\d+)?\.json$/.test(f))
      .sort()
      .map((f) => readJson(path.join(HERE, f), {})),
  );
  const credits = readJson(path.join(HERE, "photos.json"), {});
  const out = path.join(ROOT, "public/recipes/img");
  fs.mkdirSync(out, { recursive: true });
  for (const r of recipes) {
    const n = choice[r.id];
    const c = n ? cand[r.id]?.[n - 1] : null;
    if (!c) {
      delete credits[r.id];
      continue;
    }
    if (credits[r.id]?.full === c.full && fs.existsSync(path.join(out, `${r.id}.webp`))) continue;
    const buf = await load(c.full);
    await sharp(buf).resize(900, 675, { fit: "cover" }).webp({ quality: 72 }).toFile(path.join(out, `${r.id}.webp`));
    await sharp(buf).resize(360, 270, { fit: "cover" }).webp({ quality: 68 }).toFile(path.join(out, `${r.id}-s.webp`));
    credits[r.id] = { source: c.source, author: c.author, license: c.license ?? null, link: c.link, full: c.full };
    await sleep(150);
  }
  fs.writeFileSync(path.join(HERE, "photos.json"), JSON.stringify(credits, null, 1));
  console.log("фото:", Object.keys(credits).length, "из", recipes.length);
}

const cmd = process.argv[2];
if (cmd === "candidates") await candidates();
else if (cmd === "sheets") await sheets(readJson(candFile, {}));
else if (cmd === "apply") await apply();
else console.log("candidates | sheets | apply");
