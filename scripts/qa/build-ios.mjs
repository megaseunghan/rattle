import { readFile, open, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const config = JSON.parse(await readFile(new URL('../../.qa/accounts.json', import.meta.url), 'utf8'));
const log = await open(new URL('../../.qa/build-ios.log', import.meta.url), 'w', 0o600);
const derived = process.env.RATTLE_QA_DERIVED_DATA ?? '.qa/build';
const destination = process.env.RATTLE_QA_DEVICE_ID ? `id=${process.env.RATTLE_QA_DEVICE_ID}` : 'generic/platform=iOS Simulator';
const build = spawn('xcodebuild', ['-workspace', 'ios/rattle.xcworkspace', '-scheme', 'rattle', '-configuration', 'Release', '-sdk', 'iphonesimulator', '-destination', destination, 'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES', '-jobs', '6', '-derivedDataPath', derived, 'build', '-quiet'], {
  env: { ...process.env, EXPO_PUBLIC_QA_LOGIN: '1', EXPO_PUBLIC_QA_BROKER_TOKEN: config.brokerToken,
    EXPO_PUBLIC_SUPABASE_URL: config.projectUrl, EXPO_PUBLIC_SUPABASE_ANON_KEY: config.anonKey },
  stdio: ['ignore', log.fd, log.fd],
});
build.on('exit', async code => { await log.close(); if (code === 0) await writeFile(new URL('../../.qa/build-path.json', import.meta.url), JSON.stringify({ derived })); console.log(code === 0 ? 'QA iOS Release build ready' : 'QA build failed; see .qa/build-ios.log'); process.exitCode = code ?? 1; });
