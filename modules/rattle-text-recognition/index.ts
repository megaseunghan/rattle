import { requireOptionalNativeModule } from 'expo';

/** Normalized coordinates, origin at the upright image's TOP LEFT. */
export interface TextBox { x: number; y: number; w: number; h: number }
export interface RecognizedLine { text: string; confidence: number | null; box: TextBox }
export interface RecognitionResult {
  lines: RecognizedLine[];
  elapsedMs: number;
  engine: 'apple-vision' | 'mlkit';
  /** Engine/platform details for comparison; no local URI is exported. */
  metadata?: Record<string, string | number | boolean | string[]>;
}
export type RecognitionErrorCode =
  | 'ERR_OCR_UNAVAILABLE' | 'ERR_OCR_INVALID_URI' | 'ERR_OCR_IMAGE'
  | 'ERR_OCR_LANGUAGE' | 'ERR_OCR_RECOGNITION' | 'ERR_OCR_BUSY'
  | 'ERR_OCR_PICKER' | 'ERR_OCR_SHARE';
export interface PickedImage { uri: string; fileName: string }
export interface TextRecognitionNativeModule {
  /** file:// only; the caller materializes ph:// before recognition. Reject with a RecognitionErrorCode. */
  recognize(uri: string): Promise<RecognitionResult>;
  /** iOS lab helpers, optional on other platforms. Copies selected originals to temporary file:// URLs. */
  pickImages?(): Promise<PickedImage[]>;
  releaseImages?(uris: string[]): Promise<void>;
  shareJson?(json: string): Promise<void>;
}
export function getTextRecognitionModule(): TextRecognitionNativeModule | null {
  return requireOptionalNativeModule<TextRecognitionNativeModule>('RattleTextRecognition');
}
export async function recognizeText(uri: string): Promise<RecognitionResult> {
  const native = getTextRecognitionModule();
  if (!native) throw Object.assign(new Error('OCR module is unavailable'), { code: 'ERR_OCR_UNAVAILABLE' });
  if (!uri.startsWith('file://')) throw Object.assign(new Error('A local file URI is required'), { code: 'ERR_OCR_INVALID_URI' });
  return native.recognize(uri);
}
