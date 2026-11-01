// Read-only validation of the icon deliverables; never modifies image pixels or SVGs.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../assets/icons/', import.meta.url));
const plan = JSON.parse(await readFile(resolve(root, 'raster-plan.json'), 'utf8'));
assert.equal(plan.assets.length, 24, '24 planned raster assets');
assert.equal(new Set(plan.assets.map(asset => asset.file)).size, 24, '24 unique raster paths');
assert.equal(new Set(plan.assets.map(asset => asset.id)).size, 24, '24 unique raster identities');
assert.equal(plan.assets.filter(asset => asset.category === 'business').length, 16, '16 business assets');
assert.equal(plan.assets.filter(asset => asset.category === 'status').length, 8, '8 status assets');
const partial = process.argv.includes('--partial');
const report = { raster: [], vectorCount: 0, missing: [], warnings: [] };

function pngInfo(buffer) {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  assert(width > 0 && width <= 4096 && height > 0 && height <= 4096, 'bounded image dimensions');
  assert.equal(width, height, 'square canvas');
  assert.equal(buffer[24], 8, '8-bit PNG');
  assert.equal(buffer[25], 6, 'RGBA PNG with real alpha');
  assert.equal(buffer[26], 0, 'standard PNG compression');
  assert.equal(buffer[27], 0, 'standard PNG filtering');
  assert.equal(buffer[28], 0, 'non-interlaced PNG');
  const chunks = [];
  let ended = false;
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    assert(offset + length + 12 <= buffer.length, 'complete PNG chunk');
    if (buffer.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (buffer.toString('ascii', offset + 4, offset + 8) === 'IEND') { assert.equal(length, 0); ended = true; }
    offset += length + 12;
  }
  assert(ended, 'PNG IEND present');
  const stride = width * 4;
  const raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
  assert.equal(raw.length, (stride + 1) * height, 'complete PNG rows');
  let previous = Buffer.alloc(stride), minAlpha = 255, maxAlpha = 0, visible = 0;
  let left = width, top = height, right = -1, bottom = -1;
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const offset = y * (stride + 1), filter = raw[offset], row = Buffer.alloc(stride);
    assert(filter <= 4, 'supported PNG filter');
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4] : 0, b = previous[i], c = i >= 4 ? previous[i - 4] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
      row[i] = (raw[offset + 1 + i] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const alpha = row[x * 4 + 3]; minAlpha = Math.min(minAlpha, alpha); maxAlpha = Math.max(maxAlpha, alpha);
      if (alpha > 16) { visible++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    previous = row;
  }
  assert.equal(minAlpha, 0, 'transparent pixels exist');
  assert.equal(maxAlpha, 255, 'opaque object pixels exist');
  assert(visible > width * height * 0.02, 'non-empty object');
  assert(left > 0 && top > 0 && right < width - 1 && bottom < height - 1, 'object not clipped at canvas edge');
  return { width, height, minAlpha, maxAlpha, visibleRatio: +(visible / (width * height)).toFixed(4), bounds: [left, top, right, bottom], minMarginRatio: +(Math.min(left, top, width - 1 - right, height - 1 - bottom) / width).toFixed(4) };
}

for (const asset of plan.assets) {
  const path = resolve(root, asset.file);
  assert(['business', 'status'].includes(asset.category) && asset.file === `${asset.category}/${asset.id}.png`, 'raster category/path match');
  assert(!relative(root, path).startsWith('..'), 'asset path stays in icons folder');
  let bytes;
  try { bytes = await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; report.missing.push(asset.file); continue; }
  const info = pngInfo(bytes);
  if (info.minMarginRatio < 0.1) report.warnings.push(`${asset.file}: less than 10% visible margin; visually review`);
  report.raster.push({ file: asset.file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ...info });
}
for (const file of await readdir(resolve(root, 'navigation'))) {
  if (!file.endsWith('.svg')) continue;
  const svg = await readFile(resolve(root, 'navigation', file), 'utf8');
  assert(svg.includes('viewBox="0 0 24 24"') && svg.includes('stroke="currentColor"') && svg.includes('stroke-width="1.8"'), `${file}: common SVG geometry`);
  assert(!/<(?:script|image|foreignObject|text|filter)\b|\bon\w+\s*=|\bhref\s*=/i.test(svg), `${file}: no active/external content`);
  report.vectorCount++;
}
assert.equal(report.vectorCount, 58, '56 semantic SVGs + 2 selected variants');
if (!partial) {
  assert.equal(report.missing.length, 0, `missing PNGs: ${report.missing.join(', ')}`);
  assert.equal(report.raster.length, 24, 'all 24 PNGs validated');
}
if (process.argv.includes('--report')) await writeFile(resolve(root, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ png: report.raster.length, svg: report.vectorCount, missing: report.missing.length, warnings: report.warnings }, null, 2));
