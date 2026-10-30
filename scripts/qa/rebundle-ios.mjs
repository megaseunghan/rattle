// Reuse a verified native baseline when only JavaScript changed; rebuild Hermes and re-sign the QA copy.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, open } from 'node:fs/promises';
import { resolve } from 'node:path';
const config = JSON.parse(await readFile(new URL('../../.qa/accounts.json', import.meta.url), 'utf8'));
const derived = '.qa/rebundle';
const app = resolve(derived, 'Build/Products/Release-iphonesimulator/rattle.app');
execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
const log = await open('.qa/rebundle.log', 'w', 0o600);
try {
  execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'export:embed', '--entry-file', 'index.ts', '--platform', 'ios', '--dev', 'false', '--minify', 'false', '--bundle-output', '.qa/main.jsbundle', '--assets-dest', app], {
    env: { ...process.env, NODE_ENV: 'production', EXPO_PUBLIC_QA_LOGIN: '1', EXPO_PUBLIC_QA_BROKER_TOKEN: config.brokerToken, EXPO_PUBLIC_SUPABASE_URL: config.projectUrl, EXPO_PUBLIC_SUPABASE_ANON_KEY: config.anonKey },
    stdio: ['ignore', log.fd, log.fd],
  });
  execFileSync('ios/Pods/hermes-engine/destroot/bin/hermesc', ['-emit-binary', '-O', '-out', `${app}/main.jsbundle`, '.qa/main.jsbundle'], { stdio: ['ignore', log.fd, log.fd] });
  execFileSync('codesign', ['--force', '--sign', '-', '--preserve-metadata=entitlements,requirements,flags', app], { stdio: ['ignore', log.fd, log.fd] });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
  await writeFile('.qa/build-path.json', JSON.stringify({ derived }));
  console.log('QA JavaScript/Hermes build ready; native baseline reused and signature verified');
} finally { await log.close(); }
