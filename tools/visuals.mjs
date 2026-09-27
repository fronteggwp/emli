// Картинки из assets/visual-concepts → лёгкие WebP в public/visuals: node tools/visuals.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const SRC = path.join(ROOT, "assets/visual-concepts");
const OUT = path.join(ROOT, "public/visuals");

const jobs = [
  ["icons", (img) => img.resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82, alphaQuality: 90 })],
  ["covers", (img) => img.resize(1000, null, { withoutEnlargement: true }).webp({ quality: 74 })],
  ["backgrounds", (img) => img.resize(760, null, { withoutEnlargement: true }).webp({ quality: 72 })],
];

let total = 0;
for (const [dir, fn] of jobs) {
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  for (const f of fs.readdirSync(path.join(SRC, dir)).filter((x) => x.endsWith(".png"))) {
    const out = path.join(OUT, dir, f.replace(/\.png$/, ".webp"));
    await fn(sharp(path.join(SRC, dir, f))).toFile(out);
    total += fs.statSync(out).size;
  }
}
console.log("готово, всего", Math.round(total / 1024), "КБ");
