// Sync only update settings into existing ignored native projects without running prebuild.
const fs = require('node:fs/promises');
const path = require('node:path');
const plist = require('@expo/plist').default;
const { getConfig } = require('@expo/config');
const { IOSConfig, AndroidConfig } = require('@expo/config-plugins');
const { writeXMLAsync } = require('@expo/config-plugins/build/utils/XML');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const profileName = process.argv[2] ?? 'testflight';
  const eas = JSON.parse(await fs.readFile(path.join(projectRoot, 'eas.json'), 'utf8'));
  const channel = eas.build[profileName]?.channel;
  if (!channel) throw new Error(`Unknown update channel for build profile: ${profileName}`);
  const { exp } = getConfig(projectRoot);
  const config = {
    ...exp,
    updates: { ...exp.updates, requestHeaders: { ...exp.updates?.requestHeaders, 'expo-channel-name': channel } },
  };
  const updatesVersion = require('expo-updates/package.json').version;
  const iosPath = path.join(projectRoot, 'ios/Rattle/Supporting/Expo.plist');
  const androidPath = path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml');
  const stringsPath = path.join(projectRoot, 'android/app/src/main/res/values/strings.xml');
  let synced = 0;
  if (await exists(iosPath)) {
    const current = plist.parse(await fs.readFile(iosPath, 'utf8'));
    const updated = await IOSConfig.Updates.setUpdatesConfigAsync(projectRoot, config, current, updatesVersion);
    await fs.writeFile(iosPath, plist.build(updated));
    synced += 1;
  }
  if (await exists(androidPath)) {
    const current = await AndroidConfig.Manifest.readAndroidManifestAsync(androidPath);
    const updated = await AndroidConfig.Updates.setUpdatesConfigAsync(projectRoot, config, current, updatesVersion);
    const strings = await AndroidConfig.Resources.readResourcesXMLAsync({ path: stringsPath });
    const updatedStrings = await AndroidConfig.Updates.applyRuntimeVersionFromConfigForProjectRootAsync(projectRoot, config, strings);
    await AndroidConfig.Manifest.writeAndroidManifestAsync(androidPath, updated);
    await writeXMLAsync({ path: stringsPath, xml: updatedStrings });
    synced += 1;
  }
  if (!synced) throw new Error('No existing native projects. Run Expo prebuild for a new native project.');
  console.log(`Configured ${synced} native project(s) for ${profileName} / ${channel}.`);
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
