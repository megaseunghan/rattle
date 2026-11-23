// expo-camera 55 iOS scanned barcodes only when the optional ExpoCameraBarcodeScanning
// provider pod was linked, and autolinking did not add it, so this plugin added it by hand.
// From expo-camera 57 autolinking links that pod itself (adding it again makes CocoaPods fail
// with "multiple dependencies with different sources"), so only the ZXingObjC line remains.
const { withPodfile } = require('expo/config-plugins');

// ZXingObjC needs module maps to be imported from the Swift provider in static builds.
const POD_LINE = "  pod 'ZXingObjC', :modular_headers => true";

module.exports = function withExpoCameraBarcodeScanning(config) {
  return withPodfile(config, mod => {
    const contents = mod.modResults.contents;
    if (contents.includes("pod 'ZXingObjC'")) return mod;
    const anchor = /(\n\s*use_expo_modules!.*\n)/;
    if (!anchor.test(contents)) {
      throw new Error('withExpoCameraBarcodeScanning: use_expo_modules! not found in Podfile');
    }
    mod.modResults.contents = contents.replace(anchor, `$1${POD_LINE}\n`);
    return mod;
  });
};
