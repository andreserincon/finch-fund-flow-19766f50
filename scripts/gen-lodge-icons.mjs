/**
 * One-off generator for the PWA app icons: a golden lodge sunburst on a
 * near-black field. Rasterizes an inline SVG (the RaysMark sunburst) to the
 * four PNG sizes the manifest references. Run with: node scripts/gen-lodge-icons.mjs
 * sharp is installed transiently (npm i sharp --no-save) and not added to deps.
 */
import sharp from 'sharp';
import path from 'node:path';

const BG = '#0B0B0D';      // matches manifest theme/background
const GOLD = '#C9A24B';    // the lodge emblem gold (LodgeMarks)

/** Build the sunburst SVG at a given pixel size. `safe` keeps it inside the
 *  maskable safe zone (central 80%); otherwise it fills more of the canvas. */
function sunburstSvg(size, safe) {
  const c = size / 2;
  const maxR = c * (safe ? 0.74 : 0.9);
  const inR = maxR * 0.18;
  const count = 48;
  const unit = size / 220;
  let rays = '';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const isLong = i % 2 === 0;
    const rOut = isLong ? maxR : maxR * 0.6;
    const x1 = (c + Math.cos(a) * inR).toFixed(2);
    const y1 = (c + Math.sin(a) * inR).toFixed(2);
    const x2 = (c + Math.cos(a) * rOut).toFixed(2);
    const y2 = (c + Math.sin(a) * rOut).toFixed(2);
    const sw = (isLong ? 2.4 : 1.6) * unit;
    const op = isLong ? 0.96 : 0.6;
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${GOLD}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round" opacity="${op}"/>`;
  }
  const disc = `<circle cx="${c}" cy="${c}" r="${(inR * 0.85).toFixed(2)}" fill="${GOLD}"/>`;
  const ring = `<circle cx="${c}" cy="${c}" r="${(inR * 1.25).toFixed(2)}" fill="none" stroke="${GOLD}" stroke-width="${(1.2 * unit).toFixed(2)}" opacity="0.5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${(size * 0.06).toFixed(0)}" fill="${BG}"/>${rays}${ring}${disc}</svg>`;
}

const out = (p) => path.resolve(process.cwd(), 'public', p);
const jobs = [
  ['pwa-192x192.png', 192, true],
  ['pwa-512x512.png', 512, true],
  ['pwa-maskable-192x192.png', 192, true],
  ['pwa-maskable-512x512.png', 512, true],
];

for (const [file, size, safe] of jobs) {
  await sharp(Buffer.from(sunburstSvg(size, safe))).png().toFile(out(file));
  console.log('wrote', file);
}
console.log('done');
