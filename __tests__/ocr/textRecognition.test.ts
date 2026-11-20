import { getTextRecognitionModule, recognizeText } from '../../modules/rattle-text-recognition';
import { requireOptionalNativeModule } from 'expo';
jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));
it('구형 빌드에 모듈이 없으면 화면 import를 깨뜨리지 않고 명시 오류를 반환한다', async () => {
  (requireOptionalNativeModule as jest.Mock).mockReturnValue(null);
  expect(getTextRecognitionModule()).toBeNull();
  await expect(recognizeText('file:///synthetic.jpg')).rejects.toMatchObject({ code: 'ERR_OCR_UNAVAILABLE' });
});
it('원격 URL과 사진 라이브러리 URI를 인식기에 직접 넘기지 않는다', async () => {
  const recognize = jest.fn();
  (requireOptionalNativeModule as jest.Mock).mockReturnValue({ recognize });
  for (const uri of ['https://example.invalid/image.jpg', 'ph://synthetic']) {
    await expect(recognizeText(uri)).rejects.toMatchObject({ code: 'ERR_OCR_INVALID_URI' });
  }
  expect(recognize).not.toHaveBeenCalled();
});
