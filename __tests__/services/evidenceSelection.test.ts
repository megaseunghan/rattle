const mockRead = jest.fn(), mockClose = jest.fn();
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(() => ({ open: () => ({ readBytes: mockRead, close: mockClose }) })) }));
import { prepareEvidenceSelection } from '../../lib/media/evidenceSelection';
const asset = { uri: 'file:///receipt', name: 'receipt', size: 100 };
beforeEach(() => { jest.clearAllMocks(); mockRead.mockReturnValue(new Uint8Array([37,80,68,70,45])); });
test.each([undefined, '', 'application/octet-stream'])('unknown MIME %s uses bounded PDF magic', mimeType => {
 expect(prepareEvidenceSelection({ ...asset, mimeType }).mimeType).toBe('application/pdf');
 expect(mockRead).toHaveBeenCalledWith(5); expect(mockClose).toHaveBeenCalled();
});
test('case insensitive PDF extension identifies a generic document without reading it', () => {
 expect(prepareEvidenceSelection({ ...asset, name: 'RECEIPT.PDF', mimeType:'application/octet-stream' }).mimeType).toBe('application/pdf');
 expect(mockRead).not.toHaveBeenCalled();
});
test('PDF magic keeps 10MiB cap even with image extension', () => {
 expect(()=>prepareEvidenceSelection({ ...asset, name:'receipt.jpg', size:12*1024*1024 })).toThrow('10MiB');
});
test('unknown image MIME falls back to supported extension after checking PDF header', () => {
 mockRead.mockReturnValue(new Uint8Array([255,216,255,0,0]));
 expect(prepareEvidenceSelection({ ...asset, name:'receipt.HEIC', size:12*1024*1024 }).mimeType).toBe('image/heic');
});
test('unknown unsupported and truncated headers are rejected and closed', () => {
 mockRead.mockReturnValue(new Uint8Array([37,80]));
 expect(()=>prepareEvidenceSelection(asset)).toThrow('지원하는'); expect(mockClose).toHaveBeenCalled();
});
test('read failure closes the native file handle', () => {
 mockRead.mockImplementationOnce(()=>{throw Error('read failed');});
 expect(()=>prepareEvidenceSelection(asset)).toThrow('read failed'); expect(mockClose).toHaveBeenCalled();
});
