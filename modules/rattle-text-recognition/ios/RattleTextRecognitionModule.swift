import ExpoModulesCore
import Vision
import ImageIO
import CryptoKit
import PhotosUI
import UniformTypeIdentifiers

public class RattleTextRecognitionModule: Module {
  private var pickerDelegate: ReceiptPickerDelegate?
  private let temporaryFiles = OCRTemporaryFiles()
  private let recognitionQueue = DispatchQueue(label: "rattle.ocr", qos: .userInitiated, autoreleaseFrequency: .workItem)

  public func definition() -> ModuleDefinition {
    Name("RattleTextRecognition")

    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      let started = ProcessInfo.processInfo.systemUptime
      guard let url = URL(string: uri), url.isFileURL else {
        promise.reject("ERR_OCR_INVALID_URI", "A local file URI is required")
        return
      }
      guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        promise.reject("ERR_OCR_IMAGE", "The local image could not be decoded")
        return
      }
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
      let orientationRaw = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
      let orientation = CGImagePropertyOrientation(rawValue: orientationRaw) ?? .up
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["ko-KR", "en-US"]
      request.usesLanguageCorrection = true
      do {
        let supported = try request.supportedRecognitionLanguages()
        guard supported.contains("ko-KR") else {
          promise.reject("ERR_OCR_LANGUAGE", "Korean text recognition is unavailable")
          return
        }
        // Explicit EXIF direction with the untransformed CGImage avoids double rotation.
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
        try handler.perform([request])
        let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
          guard let candidate = observation.topCandidates(1).first else { return nil }
          let box = observation.boundingBox
          return ["text": candidate.string, "confidence": candidate.confidence,
                  "box": ["x": box.minX, "y": 1 - box.maxY, "w": box.width, "h": box.height]]
        }
        promise.resolve([
          "lines": lines, "elapsedMs": (ProcessInfo.processInfo.systemUptime - started) * 1000,
          "engine": "apple-vision",
          "metadata": ["revision": request.revision, "os": ProcessInfo.processInfo.operatingSystemVersionString,
                       "languages": request.recognitionLanguages, "recognitionLevel": "accurate",
                       "usesLanguageCorrection": true, "orientation": orientationRaw,
                       "width": image.width, "height": image.height,
                       "coordinateOrigin": "top-left", "preprocessing": "none",
                       "sha256": try self.temporaryFiles.imageSHA256(url)]
        ])
      } catch {
        promise.reject("ERR_OCR_RECOGNITION", "Text recognition failed")
      }
    }.runOnQueue(recognitionQueue)

    AsyncFunction("pickImages") { (promise: Promise) in
      guard self.pickerDelegate == nil else {
        promise.reject("ERR_OCR_BUSY", "The photo picker is already open")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_OCR_PICKER", "No view controller is available")
        return
      }
      var configuration = PHPickerConfiguration()
      configuration.filter = .images
      configuration.selectionLimit = 20
      configuration.selection = .ordered
      configuration.preferredAssetRepresentationMode = .current
      let picker = PHPickerViewController(configuration: configuration)
      let delegate = ReceiptPickerDelegate(temporaryFiles: self.temporaryFiles) { [weak self] result in
        self?.pickerDelegate = nil
        switch result {
        case .success(let images): promise.resolve(images)
        case .failure(let error):
          if error is OCRTemporaryFileError { promise.reject("ERR_OCR_CLEANUP", "Temporary files could not be removed") }
          else { promise.reject("ERR_OCR_PICKER", "Selected images could not be opened") }
        }
      }
      self.pickerDelegate = delegate
      picker.delegate = delegate
      presenter.present(picker, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("releaseImages") { (uris: [String], promise: Promise) in
      do { try self.temporaryFiles.releaseImages(uris); promise.resolve(nil) }
      catch { promise.reject("ERR_OCR_CLEANUP", "Temporary images could not be removed") }
    }.runOnQueue(recognitionQueue)

    AsyncFunction("cleanupTemporaryFiles") { (promise: Promise) in
      do { try self.temporaryFiles.cleanup(); promise.resolve(nil) }
      catch { promise.reject("ERR_OCR_CLEANUP", "Temporary files could not be removed") }
    }.runOnQueue(recognitionQueue)

    AsyncFunction("shareJson") { (json: String, promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController(),
            let data = json.data(using: .utf8) else {
        promise.reject("ERR_OCR_SHARE", "The results could not be shared")
        return
      }
      let url: URL
      do { url = try self.temporaryFiles.newExportURL() }
      catch { promise.reject("ERR_OCR_SHARE", "The results could not be shared"); return }
      do { try data.write(to: url, options: [.atomic, .completeFileProtection]) }
      catch {
        do { try self.temporaryFiles.remove(url) }
        catch { promise.reject("ERR_OCR_CLEANUP", "Temporary results could not be removed"); return }
        promise.reject("ERR_OCR_SHARE", "The results could not be shared"); return
      }
      let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      sheet.popoverPresentationController?.sourceView = presenter.view
      sheet.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
      sheet.completionWithItemsHandler = { _, _, _, error in
        do { try self.temporaryFiles.remove(url) }
        catch { promise.reject("ERR_OCR_CLEANUP", "Temporary results could not be removed"); return }
        if error != nil { promise.reject("ERR_OCR_SHARE", "Sharing failed") }
        else { promise.resolve(nil) }
      }
      presenter.present(sheet, animated: true)
    }.runOnQueue(.main)
  }
}

private final class ReceiptPickerDelegate: NSObject, PHPickerViewControllerDelegate {
  private let completion: (Result<[[String: String]], Error>) -> Void
  private let temporaryFiles: OCRTemporaryFiles
  init(temporaryFiles: OCRTemporaryFiles, completion: @escaping (Result<[[String: String]], Error>) -> Void) {
    self.temporaryFiles = temporaryFiles; self.completion = completion
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard !results.isEmpty else { completion(.success([])); return }
    let group = DispatchGroup()
    let lock = NSLock()
    var images: [Int: [String: String]] = [:]
    var failed = false
    var cleanupFailed = false
    let directory: URL
    do { directory = try temporaryFiles.imageDirectory() }
    catch { completion(.failure(error)); return }
    for (index, result) in results.enumerated() {
      group.enter()
      result.itemProvider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, _ in
        defer { group.leave() }
        guard let url = url else { lock.lock(); failed = true; lock.unlock(); return }
        let destination = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension(url.pathExtension)
        do {
          // Copy inside the provider callback, before its temporary URL expires; no re-encoding.
          try FileManager.default.copyItem(at: url, to: destination)
          try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
          lock.lock()
          images[index] = ["uri": destination.absoluteString, "fileName": result.itemProvider.suggestedName ?? url.lastPathComponent]
          lock.unlock()
        } catch {
          do { try self.temporaryFiles.remove(destination) }
          catch { lock.lock(); cleanupFailed = true; lock.unlock() }
          lock.lock(); failed = true; lock.unlock()
        }
      }
    }
    group.notify(queue: .main) {
      if failed {
        for image in images.values {
          if let uri = image["uri"], let url = URL(string: uri) {
            do { try self.temporaryFiles.remove(url) } catch { cleanupFailed = true }
          }
        }
        self.completion(.failure(cleanupFailed ? OCRTemporaryFileError.cleanupFailed : NSError(domain: "RattleOCR", code: 1)))
      } else { self.completion(.success(images.keys.sorted().compactMap { images[$0] })) }
    }
  }
}
