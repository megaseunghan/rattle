// design-system: DESIGN.md — 256px runtime derivatives, high-resolution sources preserved.
// Requires pngjs from the existing local dependency tree.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const { PNG } = createRequire(import.meta.url)('pngjs');
const root = new URL('../assets/icons/', import.meta.url);
const plan = JSON.parse(await readFile(new URL('raster-plan.json', root), 'utf8'));
let sourceBytes = 0, runtimeBytes = 0;
for (const asset of plan.assets) {
  const bytes = await readFile(new URL(asset.file, root));
  const source = PNG.sync.read(bytes), target = new PNG({ width: 256, height: 256 });
  const scaleX = source.width / 256, scaleY = source.height / 256;
  // Area average in premultiplied alpha prevents dark/white halos around the silhouette.
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const left = x * scaleX, right = (x + 1) * scaleX, top = y * scaleY, bottom = (y + 1) * scaleY;
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (let sy = Math.floor(top); sy < Math.min(source.height, Math.ceil(bottom)); sy++) {
      for (let sx = Math.floor(left); sx < Math.min(source.width, Math.ceil(right)); sx++) {
        const weight = (Math.min(right, sx + 1) - Math.max(left, sx)) * (Math.min(bottom, sy + 1) - Math.max(top, sy));
        const i = (sy * source.width + sx) * 4, a = source.data[i + 3] / 255 * weight;
        alpha += a; red += source.data[i] * a; green += source.data[i + 1] * a; blue += source.data[i + 2] * a;
      }
    }
    const i = (y * 256 + x) * 4;
    target.data[i + 3] = Math.round(alpha / (scaleX * scaleY) * 255);
    if (alpha > 0) { target.data[i] = Math.round(red / alpha); target.data[i + 1] = Math.round(green / alpha); target.data[i + 2] = Math.round(blue / alpha); }
  }
  const output = new URL(`runtime/${asset.file}`, root);
  await mkdir(new URL('.', output), { recursive: true });
  const result = PNG.sync.write(target);
  await writeFile(output, result);
  sourceBytes += bytes.length; runtimeBytes += result.length;
}
console.log(JSON.stringify({ files: 24, sourceBytes, runtimeBytes }));
