package expo.modules.rattletextrecognition

import android.net.Uri
import android.os.SystemClock
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

class RattleTextRecognitionModule : Module() {
  private val busy = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("RattleTextRecognition")

    AsyncFunction("recognize") { uriString: String, promise: Promise ->
      val uri = Uri.parse(uriString)
      if (uri.scheme != "file" || !uri.authority.isNullOrEmpty() || uri.path.isNullOrBlank()) {
        promise.reject("ERR_OCR_INVALID_URI", "A local file URI is required", null)
        return@AsyncFunction
      }
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_OCR_UNAVAILABLE", "OCR context is unavailable", null)
        return@AsyncFunction
      }
      if (!busy.compareAndSet(false, true)) {
        promise.reject("ERR_OCR_BUSY", "Recognition is already running", null)
        return@AsyncFunction
      }
      val started = SystemClock.elapsedRealtime()
      val image = try {
        val file = File(requireNotNull(uri.path))
        require(file.isFile && file.canRead())
        // ML Kit's file loader decodes the image and applies its EXIF orientation.
        InputImage.fromFilePath(context, uri)
      } catch (error: Exception) {
        busy.set(false)
        promise.reject("ERR_OCR_IMAGE", "The image could not be read", error)
        return@AsyncFunction
      }
      val recognizer = try {
        TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
      } catch (error: Exception) {
        busy.set(false)
        promise.reject("ERR_OCR_UNAVAILABLE", "The Korean OCR engine is unavailable", error)
        return@AsyncFunction
      }
      try {
        recognizer.process(image)
          .addOnSuccessListener { result ->
            try {
              val output = RecognitionOutput.create(result, image, started)
              recognizer.close()
              busy.set(false)
              promise.resolve(output)
            } catch (error: Exception) {
              promise.reject("ERR_OCR_RECOGNITION", "Recognition output could not be read", error)
              recognizer.close()
              busy.set(false)
            }
          }
          .addOnFailureListener { error ->
            recognizer.close()
            busy.set(false)
            promise.reject("ERR_OCR_RECOGNITION", "Text recognition failed", error)
          }
      } catch (error: Exception) {
        recognizer.close()
        busy.set(false)
        promise.reject("ERR_OCR_RECOGNITION", "Text recognition failed", error)
      }
    }
  }
}
