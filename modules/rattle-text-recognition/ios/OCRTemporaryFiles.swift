import Foundation
import CryptoKit

enum OCRTemporaryFileError: Error { case cleanupFailed, invalidOwnedFile, cannotReadImage }

/// Only this module's UUID files may be removed. Failed removals remain retryable in this instance.
final class OCRTemporaryFiles {
  let root: URL
  let imagesDirectory: URL
  let exportsDirectory: URL
  private let removeItem: (URL) throws -> Void
  private let lock = NSLock()
  private var pending: Set<URL> = []

  init(root: URL = FileManager.default.temporaryDirectory,
       removeItem: @escaping (URL) throws -> Void = { try FileManager.default.removeItem(at: $0) }) {
    self.root = root.standardizedFileURL
    imagesDirectory = root.appendingPathComponent("rattle-ocr-images", isDirectory: true).standardizedFileURL
    exportsDirectory = root.appendingPathComponent("rattle-ocr-exports", isDirectory: true).standardizedFileURL
    self.removeItem = removeItem
  }

  func imageDirectory() throws -> URL {
    try FileManager.default.createDirectory(at: imagesDirectory, withIntermediateDirectories: true)
    return imagesDirectory
  }
  func newExportURL() throws -> URL {
    try FileManager.default.createDirectory(at: exportsDirectory, withIntermediateDirectories: true)
    return exportsDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("json")
  }
  private func owns(_ url: URL) -> Bool {
    guard url.isFileURL else { return false }
    let file = url.standardizedFileURL
    let parent = file.deletingLastPathComponent().path
    let stem = file.deletingPathExtension().lastPathComponent
    if parent == imagesDirectory.path || parent == exportsDirectory.path { return UUID(uuidString: stem) != nil }
    // Older releases created share files directly in temporaryDirectory.
    return parent == root.path && file.pathExtension == "json" && stem.hasPrefix("rattle-ocr-")
      && UUID(uuidString: String(stem.dropFirst("rattle-ocr-".count))) != nil
  }
  private func missing(_ error: Error) -> Bool {
    let error = error as NSError
    return error.domain == NSCocoaErrorDomain && (error.code == NSFileNoSuchFileError || error.code == NSFileReadNoSuchFileError)
  }

  func remove(_ url: URL) throws {
    guard owns(url) else { throw OCRTemporaryFileError.invalidOwnedFile }
    let file = url.standardizedFileURL
    // Retry a transient failure once; a persistent failure is reported and retained for explicit retry.
    for _ in 0..<2 {
      do {
        let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular else { throw OCRTemporaryFileError.invalidOwnedFile }
        try removeItem(file)
        lock.lock(); pending.remove(file); lock.unlock()
        return
      } catch {
        if missing(error) { lock.lock(); pending.remove(file); lock.unlock(); return }
      }
    }
    lock.lock(); pending.insert(file); lock.unlock()
    throw OCRTemporaryFileError.cleanupFailed
  }

  func releaseImages(_ uris: [String]) throws {
    var failed = false
    for uri in uris {
      guard let url = URL(string: uri), url.standardizedFileURL.deletingLastPathComponent().path == imagesDirectory.path,
            owns(url) else { continue }
      do { try remove(url) } catch { failed = true }
    }
    if failed { throw OCRTemporaryFileError.cleanupFailed }
  }

  /// Reclaim pending failures immediately, and only own files older than 24h after a crash/restart.
  func cleanup(now: Date = Date(), staleAfter: TimeInterval = 24 * 60 * 60) throws {
    lock.lock(); let retries = Array(pending); lock.unlock()
    var failed = false
    for url in retries { do { try remove(url) } catch { failed = true } }
    for directory in [imagesDirectory, exportsDirectory, root] {
      do {
        let urls = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        for url in urls where owns(url) {
          do {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            guard attributes[.type] as? FileAttributeType == .typeRegular,
                  let modified = attributes[.modificationDate] as? Date,
                  now.timeIntervalSince(modified) >= staleAfter else { continue }
            try remove(url)
          } catch { if !missing(error) { failed = true } }
        }
      } catch { if !missing(error) { failed = true } }
    }
    if failed { throw OCRTemporaryFileError.cleanupFailed }
  }

  func imageSHA256(_ url: URL) throws -> String {
    guard let stream = InputStream(url: url) else { throw OCRTemporaryFileError.cannotReadImage }
    stream.open()
    defer { stream.close() }
    var hash = SHA256()
    var buffer = [UInt8](repeating: 0, count: 64 * 1024)
    while true {
      let count = stream.read(&buffer, maxLength: buffer.count)
      if count < 0 { throw stream.streamError ?? OCRTemporaryFileError.cannotReadImage }
      if count == 0 { break }
      hash.update(data: Data(buffer.prefix(count)))
    }
    return hash.finalize().map { String(format: "%02x", $0) }.joined()
  }
}
