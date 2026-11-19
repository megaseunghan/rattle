// expo-camera 55 iOS scans barcodes only when the optional ExpoCameraBarcodeScanning
// provider pod is linked (BarcodeScanner.addOutputs returns early without it).
// Autolinking does not add that podspec, so the QR scanner never fired on device.
const { withPodfile } = require('expo/config-plugins');

const POD_LINE = "  pod 'ExpoCameraBarcodeScanning', :path => '../node_modules/expo-camera/ios'";

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
