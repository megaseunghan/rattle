import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const run = args => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' }).trim();
const names = { admin: 'Rattle QA 관리자', regular: 'Rattle QA 직원', part_time: 'Rattle QA 파트타이머' };
const runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-26-3';
const devices = JSON.parse(run(['list', 'devices', 'available', '--json'])).devices[runtime];
const result = {};
for (const [role, name] of Object.entries(names)) {
  const found = devices.find(d => d.name === name);
  const id = found?.udid ?? run(['create', name, 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro', runtime]);
  result[role] = { id, name };
  if (found?.state !== 'Booted') run(['boot', id]);
  console.log(`${role}: ${name} (${id})`);
}
await writeFile(new URL('../../.qa/simulators.json', import.meta.url), JSON.stringify(result, null, 2));
if (process.argv.includes('--install')) {
  const { derived } = JSON.parse(await readFile(new URL('../../.qa/build-path.json', import.meta.url), 'utf8'));
  const { resolve } = await import('node:path');
  for (const [role, { id }] of Object.entries(result)) {
    run(['bootstatus', id, '-b']);
    const app = resolve('.qa/install', role, 'rattle.app');
    execFileSync('mkdir', ['-p', resolve('.qa/install', role)]);
    execFileSync('ditto', [resolve(derived, 'Build/Products/Release-iphonesimulator/rattle.app'), app]);
    execFileSync('plutil', ['-replace', 'CFBundleVersion', '-string', { admin: '900001', regular: '900002', part_time: '900003' }[role], `${app}/Info.plist`]);
    execFileSync('codesign', ['--force', '--sign', '-', '--preserve-metadata=entitlements,requirements,flags', app], { stdio: 'ignore' });
    execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
    run(['install', id, app]);
    run(['launch', '--terminate-running-process', id, 'com.seunghan.rattle']);
    console.log(`Installed and opened ${role}`);
  }
}
