// Read-only route/spec traceability check. No application or network imports.
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(process.argv[2] ?? '.');
const manifest = resolve(process.argv[3] ?? 'docs/screen-manifest-2026-10-26.json');
async function walk(dir) {
 const entries = await readdir(dir, { withFileTypes: true });
 return (await Promise.all(entries.map(e => e.isDirectory() ? walk(resolve(dir,e.name)) : resolve(dir,e.name)))).flat();
}
const routes=(await walk(resolve(root,'app'))).filter(p=>p.endsWith('.tsx') && !p.endsWith('/_layout.tsx')).map(p=>relative(root,p)).sort();
const rows=JSON.parse(await readFile(manifest,'utf8'));
assert.deepEqual(rows.map(r=>r.source).sort(), routes, 'Every current route must have exactly one specification row');
assert.equal(new Set(rows.map(r=>r.id)).size, rows.length, 'IDs must be unique');
for(const row of rows) for(const key of ['id','source','name','access','input','behavior','effect','family']) assert.ok(row[key]?.trim(), `${row.id}: missing ${key}`);
console.log(`PASS: ${routes.length} routes mapped, unique IDs and specification fields present. This is not behavioral E2E.`);
