package expo.modules.rattletextrecognition

import android.os.SystemClock
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text

internal object RecognitionOutput {
  fun create(text: Text, image: InputImage, started: Long): Map<String, Any> {
    // ML Kit boxes refer to the upright image, so quarter-turn inputs swap dimensions.
    val quarterTurn = image.rotationDegrees == 90 || image.rotationDegrees == 270
    val width = if (quarterTurn) image.height else image.width
    val height = if (quarterTurn) image.width else image.height
    require(width > 0 && height > 0)
    val lines = text.textBlocks.flatMap { block ->
      block.lines.map { line ->
        val rect = requireNotNull(line.boundingBox) { "Recognized line has no bounding box" }
        val left = (rect.left.toDouble() / width).coerceIn(0.0, 1.0)
        val top = (rect.top.toDouble() / height).coerceIn(0.0, 1.0)
        val right = (rect.right.toDouble() / width).coerceIn(left, 1.0)
        val bottom = (rect.bottom.toDouble() / height).coerceIn(top, 1.0)
        mapOf(
          "text" to line.text,
          "confidence" to line.confidence.takeIf { it.isFinite() && it in 0f..1f }?.toDouble(),
          "box" to mapOf("x" to left, "y" to top, "w" to right - left, "h" to bottom - top),
        )
      }
    }
    return mapOf(
      "lines" to lines,
      "elapsedMs" to (SystemClock.elapsedRealtime() - started).toDouble(),
      "engine" to "mlkit",
      "metadata" to mapOf(
        "model" to "com.google.mlkit:text-recognition-korean:16.0.1",
        "bundled" to true,
        "imageWidth" to width,
        "imageHeight" to height,
        "rotationDegrees" to image.rotationDegrees,
      ),
    )
  }
}
