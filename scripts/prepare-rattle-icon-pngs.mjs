// Conservative matte cleanup. Keep generated originals; never reshape or crop objects.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const root = new URL('../assets/icons/', import.meta.url);
const plan = JSON.parse(await readFile(new URL('raster-plan.json', root), 'utf8'));
const records = [];
for (const asset of plan.assets) {
  const final = new URL(asset.file, root), original = new URL(`originals/${asset.file}`, root);
  await mkdir(new URL('.', original), { recursive: true });
  let bytes;
  try { bytes = await readFile(original); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    bytes = await readFile(final);
    await writeFile(original, bytes, { flag: 'wx' });
  }
  const png = PNG.sync.read(bytes);
  let cleared = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] <= 2) {
      if (png.data[i + 3] > 0) cleared++;
      png.data.fill(0, i, i + 4);
    }
  }
  const output = PNG.sync.write(png);
  await writeFile(final, output);
  records.push({ file: asset.file, width: png.width, height: png.height, clearedNearlyTransparentPixels: cleared,
    original: `originals/${asset.file}`, originalSha256: createHash('sha256').update(bytes).digest('hex'),
    finalSha256: createHash('sha256').update(output).digest('hex') });
}
await writeFile(new URL('processing.json', root), JSON.stringify({
  method: 'Only alpha 0..2/255 pixels cleared to transparent black. Alpha 3..255 and object geometry unchanged. No resize, crop, erosion or color changes.',
  maxPerChannelCompositeDifference: 2, records
}, null, 2) + '\n');
console.log(`Prepared ${records.length} PNGs; generated originals preserved.`);
