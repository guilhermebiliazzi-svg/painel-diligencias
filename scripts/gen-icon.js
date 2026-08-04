// Gera os ícones do app (monograma VJ - Ville Jardins) a partir de um SVG.
// Rende para app/icon.png, app/apple-icon.png e public/icon-192|512.png.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// SVG base 512x512. Azul da marca com leve gradiente, "VJ" branco e
// um traço vermelho (RE/MAX) na base como assinatura.
function svg({ rounded }) {
  const r = rounded ? 96 : 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0A4FC0"/>
      <stop offset="1" stop-color="#00286B"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="${r}" ry="${r}" fill="url(#bg)"/>
  <text x="256" y="296" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-weight="700"
        font-size="248" fill="#FFFFFF" letter-spacing="-8">VJ</text>
  <rect x="176" y="360" width="160" height="16" rx="8" fill="#DC1C2E"/>
</svg>`;
}

async function render(svgStr, size, outPath) {
  await sharp(Buffer.from(svgStr))
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log('->', outPath, size + 'px');
}

(async () => {
  const app = path.join(__dirname, '..', 'app');
  const pub = path.join(__dirname, '..', 'public');
  // Android/PWA: cantos arredondados ficam por conta do launcher, use quadrado full-bleed.
  await render(svg({ rounded: false }), 512, path.join(app, 'icon.png'));
  await render(svg({ rounded: false }), 512, path.join(pub, 'icon-512.png'));
  await render(svg({ rounded: false }), 192, path.join(pub, 'icon-192.png'));
  // iOS não arredonda transparência; usa fundo cheio e o próprio SO arredonda.
  await render(svg({ rounded: false }), 180, path.join(app, 'apple-icon.png'));
  // maskable (safe zone) — mesmo desenho já tem margem suficiente.
  await render(svg({ rounded: false }), 512, path.join(pub, 'icon-maskable-512.png'));
})();
