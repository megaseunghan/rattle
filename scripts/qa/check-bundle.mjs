import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const config = JSON.parse(await readFile(new URL('../../.qa/accounts.json', import.meta.url), 'utf8'));
const { derived } = JSON.parse(await readFile(new URL('../../.qa/build-path.json', import.meta.url), 'utf8'));
const bundle = await readFile(resolve(derived, 'Build/Products/Release-iphonesimulator/rattle.app/main.jsbundle'));
assert.ok(bundle.includes(Buffer.from(config.brokerToken)), 'QA capability must match running broker');
for (const account of Object.values(config.accounts)) {
  assert.ok(!bundle.includes(Buffer.from(account.password)), 'Account passwords must not be embedded');
}
console.log('PASS QA bundle: broker capability configured, account passwords absent');
