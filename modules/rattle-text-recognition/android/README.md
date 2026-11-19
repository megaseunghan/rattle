# Android receipt OCR

`RattleTextRecognition.recognize(fileUri)` uses the bundled ML Kit Korean model
`com.google.mlkit:text-recognition-korean:16.0.1`. No Play Services model download
is needed. The module accepts local `file://` URIs only. The ML Kit file loader
applies EXIF orientation; returned line rectangles use the upright image's top-left
origin and normalized `{x,y,w,h}` coordinates. Confidence is preserved in `[0,1]`
(or `null` if not finite/available). Images are neither uploaded nor retained here.
Concurrent calls reject with `ERR_OCR_BUSY`; callers should process sequentially.

## Local benchmark

From a generated Expo Android project, build with:

```sh
./gradlew :rattle-text-recognition:assembleDebugAndroidTest --max-workers=2 --no-parallel
```

The `ReceiptBenchmark` instrumentation reads `.jpg` fixtures from its test APK's
private `files/` directory and writes one JSON per image in `files/results/`.
Install the test APK, discover its application ID from its merged manifest, and
copy the selected fixtures with `adb shell run-as <test-package>` before running:

```sh
adb shell am instrument -w <test-package>/expo.modules.rattletextrecognition.ReceiptBenchmark
```

The benchmark uses the same `RecognitionOutput` converter as the Expo bridge and
checks for nonempty lines, confidence range, and normalized bounds. It does not
exercise the JS bridge, photo picker, authentication, or the receipt parser.
Keep fixture images and raw results outside the repository. Emulator timings do
not establish real Android device performance.

Official API reference: https://developers.google.com/ml-kit/vision/text-recognition/v2/android
