// Run on macOS by concatenating ios/OCRTemporaryFiles.swift and this synthetic test into /tmp.
let testRoot = FileManager.default.temporaryDirectory.appendingPathComponent("QA-OCR-\(UUID().uuidString)", isDirectory: true)
try FileManager.default.createDirectory(at: testRoot, withIntermediateDirectories: true)
defer { try! FileManager.default.removeItem(at: testRoot) }
var denyRemoval = true
var attempts = 0
let files = OCRTemporaryFiles(root: testRoot, removeItem: { url in
  attempts += 1
  if denyRemoval { throw NSError(domain: NSCocoaErrorDomain, code: NSFileWriteNoPermissionError) }
  try FileManager.default.removeItem(at: url)
})
let imageDir = try files.imageDirectory()
let image = imageDir.appendingPathComponent(UUID().uuidString).appendingPathExtension("jpg")
try Data("synthetic".utf8).write(to: image)
do { try files.releaseImages([image.absoluteString]); assertionFailure("Persistent deletion failure was swallowed") }
catch OCRTemporaryFileError.cleanupFailed { }
assert(attempts == 2)
assert(FileManager.default.fileExists(atPath: image.path))
denyRemoval = false
try files.cleanup()
assert(!FileManager.default.fileExists(atPath: image.path))
// Old owned files are reclaimed after restart, but recent files and unrelated files survive.
let old = imageDir.appendingPathComponent(UUID().uuidString).appendingPathExtension("jpg")
let recent = try files.newExportURL()
let unrelated = testRoot.appendingPathComponent("other-owner.json")
let unrelatedInOwnedDir = imageDir.appendingPathComponent("other-owner.jpg")
let legacy = testRoot.appendingPathComponent("rattle-ocr-\(UUID().uuidString).json")
for url in [old, recent, unrelated, unrelatedInOwnedDir, legacy] { try Data("synthetic".utf8).write(to: url) }
for url in [old, legacy, unrelated, unrelatedInOwnedDir] {
  try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -48 * 3600)], ofItemAtPath: url.path)
}
let restarted = OCRTemporaryFiles(root: testRoot)
try restarted.cleanup()
assert(!FileManager.default.fileExists(atPath: old.path))
assert(!FileManager.default.fileExists(atPath: legacy.path))
for url in [recent, unrelated, unrelatedInOwnedDir] { assert(FileManager.default.fileExists(atPath: url.path)) }
do { try restarted.remove(unrelated); assertionFailure("An unrelated file was accepted") }
catch OCRTemporaryFileError.invalidOwnedFile { }
// Streaming SHA must equal CryptoKit's one-shot digest across multiple chunks.
let bytes = Data(repeating: 42, count: 3 * 64 * 1024 + 7)
try bytes.write(to: recent)
let expected = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
let actual = try restarted.imageSHA256(recent)
assert(actual == expected)
try restarted.remove(recent)
print("PASS: persistent cleanup failure, retry, stale ownership isolation, streaming SHA")
