// expo-camera 55 iOS scans barcodes only when the optional ExpoCameraBarcodeScanning
// provider pod is linked (BarcodeScanner.addOutputs returns early without it).
// Autolinking does not add that podspec, so the QR scanner never fired on device.
const { withPodfile } = require('expo/config-plugins');

// ZXingObjC needs module maps to be imported from the Swift provider in static builds.
const POD_LINE = [
  "  pod 'ZXingObjC', :modular_headers => true",
  "  pod 'ExpoCameraBarcodeScanning', :path => '../node_modules/expo-camera/ios'",
].join('\n');

module.exports = function withExpoCameraBarcodeScanning(config) {
  return withPodfile(config, mod => {
    const contents = mod.modResults.contents;
    if (contents.includes('ExpoCameraBarcodeScanning')) return mod;
    const anchor = /(\n\s*use_expo_modules!.*\n)/;
    if (!anchor.test(contents)) {
      throw new Error('withExpoCameraBarcodeScanning: use_expo_modules! not found in Podfile');
    }
    mod.modResults.contents = contents.replace(anchor, `$1${POD_LINE}\n`);
    return mod;
  });
};
