// Скачивает фото упражнений free-exercise-db и сжимает в WebP для public/ex/<id>/<n>.webp
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve("public/ex");
const list = JSON.parse(await fs.readFile("tools/exdb/exercises.json", "utf8"));
const jobs = list.flatMap((e) => e.images.map((img, n) => ({ id: e.id, img, n })));
let done = 0, failed = 0;

async function run({ id, img, n }) {
  const out = path.join(root, id, `${n}.webp`);
  try {
    await fs.access(out);
    done++;
    return;
  } catch {}
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${img}`);
      if (!res.ok) throw new Error(String(res.status));
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.mkdir(path.dirname(out), { recursive: true });
      await sharp(buf).resize({ width: 560, withoutEnlargement: true }).webp({ quality: 68 }).toFile(out);
      done++;
      return;
    } catch (e) {
      if (attempt === 2) {
        failed++;
        console.error("fail", img, String(e));
      }
    }
  }
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: 16 }, async () => {
    while (queue.length) await run(queue.shift());
  }),
);
console.log({ total: jobs.length, done, failed });
