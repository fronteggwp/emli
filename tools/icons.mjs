// Иконки приложения для главного экрана из логотипа: node tools/icons.mjs
import fs from "node:fs";
import sharp from "sharp";

const C = 2 * Math.PI * 22;
const logo = (scale, dx, dy) => `
  <g transform="translate(${dx} ${dy}) scale(${scale})">
    <circle cx="32" cy="32" r="22" fill="none" stroke="url(#g)" stroke-width="11" stroke-linecap="round"
      stroke-dasharray="${(C * 0.78).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 32 32)"/>
    <circle cx="18" cy="15" r="5.5" fill="#ff7a5c"/>
  </g>`;

function svg(size, pad) {
  const inner = size * (1 - pad * 2);
  const scale = inner / 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c8cff"/><stop offset="55%" stop-color="#b388ff"/><stop offset="100%" stop-color="#ff7a5c"/>
    </linearGradient>
    <radialGradient id="bg" cx="50%" cy="0%" r="100%">
      <stop offset="0%" stop-color="#1d1a33"/><stop offset="100%" stop-color="#0b0b0e"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${logo(scale, size * pad, size * pad)}
</svg>`;
}

const out = new URL("../public/icons/", import.meta.url);
fs.mkdirSync(out, { recursive: true });
const jobs = [
  ["icon-192.png", 192, 0.2],
  ["icon-512.png", 512, 0.2],
  ["maskable-512.png", 512, 0.28],
  ["apple-touch-icon.png", 180, 0.2],
];
for (const [name, size, pad] of jobs) {
  await sharp(Buffer.from(svg(size, pad))).png().toFile(new URL(name, out).pathname.replace(/^\/([A-Z]:)/, "$1"));
  console.log("→", name);
}
