package expo.modules.rattletextrecognition

import android.app.Instrumentation
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/** Local-only benchmark: fixtures are pushed into the test APK's private files directory. */
class ReceiptBenchmark : Instrumentation() {
  override fun onCreate(arguments: Bundle?) {
    super.onCreate(arguments)
    start()
  }

  override fun onStart() {
    val report = Bundle()
    val recognizer = TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
    try {
      val files = context.filesDir.listFiles { file -> file.extension == "jpg" }.orEmpty().sortedBy { it.name }
      check(files.isNotEmpty()) { "No benchmark fixtures installed" }
      val output = File(context.filesDir, "results").apply { mkdirs() }
      for (file in files) {
        val started = SystemClock.elapsedRealtime()
        val image = InputImage.fromFilePath(context, Uri.fromFile(file))
        val text = Tasks.await(recognizer.process(image), 90, TimeUnit.SECONDS)
        val result = RecognitionOutput.create(text, image, started)
        File(output, "${file.nameWithoutExtension}.json").writeText(JSONObject(result).toString(2))
        val lines = result.getValue("lines") as List<*>
        check(lines.isNotEmpty()) { "No text recognized in ${file.name}" }
        for (entry in lines) {
          val line = entry as Map<*, *>
          val box = line["box"] as Map<*, *>
          val x = box["x"] as Double
          val y = box["y"] as Double
          val w = box["w"] as Double
          val h = box["h"] as Double
          check(x in 0.0..1.0 && y in 0.0..1.0 && w >= 0 && h >= 0)
          check(x + w <= 1.000001 && y + h <= 1.000001)
          val confidence = line["confidence"] as Double?
          check(confidence == null || confidence in 0.0..1.0)
        }
      }
      report.putInt("recognizedImages", files.size)
      finish(0, report)
    } catch (error: Exception) {
      report.putString("failure", error.toString())
      finish(1, report)
    } finally {
      recognizer.close()
    }
  }
}
