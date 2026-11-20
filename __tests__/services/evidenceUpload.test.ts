const mockUpload = jest.fn().mockResolvedValue(undefined);
const mockFinish = jest.fn().mockResolvedValue(undefined);
const mockRead = jest.fn().mockResolvedValue(new ArrayBuffer(8));
const mockDelete = jest.fn();
const mockSave = jest.fn().mockResolvedValue({ uri: 'file:///optimized.jpg' });
const mockRelease = jest.fn();
const mockResize = jest.fn();
const mockRender = jest.fn().mockResolvedValue({ width: 1800, height: 2400, saveAsync: mockSave, release: mockRelease });
jest.mock('../../lib/services/evidence', () => ({ uploadEvidenceBytes: (...args: unknown[]) => mockUpload(...args), finishEvidence: (...args: unknown[]) => mockFinish(...args) }));
const mockSource = { width: 3000, height: 4000, release: jest.fn() };
const mockLoad = jest.fn().mockResolvedValue(mockSource);
const mockManipulate = jest.fn((..._args: unknown[]) => ({ renderAsync: mockRender, resize: mockResize, release: mockRelease }));
const mockSizes: Record<string, number> = {};
jest.mock('expo-image', () => ({ Image: { loadAsync: (...args: unknown[]) => mockLoad(...args) } }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) }, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation((uri: string) => ({ size: mockSizes[uri] ?? 100, arrayBuffer: mockRead, delete: mockDelete })) }));
import { uploadEvidence } from '../../lib/media/evidenceUpload';
import { EvidenceFile } from '../../lib/types/evidence';
const file = { id: 'file', status: 'pending', mime_type: 'image/jpeg' } as EvidenceFile;
const selection = { id: 'file', uri: 'file:///picked.jpg', name: 'receipt.jpg', mimeType: 'image/jpeg', size: 100 };
beforeEach(() => { jest.clearAllMocks(); Object.keys(mockSizes).forEach(key => delete mockSizes[key]); mockUpload.mockResolvedValue(undefined); });
test('native transforms send an optimized image then thumbnail before finalizing', async () => {
 await uploadEvidence(selection, file, () => true);
 expect(mockLoad).toHaveBeenCalledWith(selection.uri, { maxWidth: 2000, maxHeight: 2000 });
 expect(mockManipulate).toHaveBeenCalledWith(mockSource);
 expect(mockResize).toHaveBeenCalledWith({ width: 288, height: 384 });
 expect(mockResize).toHaveBeenNthCalledWith(1, { height: 2000 });
 expect(mockSave).toHaveBeenNthCalledWith(1, { format: 'jpeg', compress: 0.75 });
 expect(mockSave).toHaveBeenNthCalledWith(2, { format: 'jpeg', compress: 0.65 });
 expect(mockSource.release).toHaveBeenCalled();
 expect(mockUpload).toHaveBeenNthCalledWith(1, file, expect.any(ArrayBuffer));
 expect(mockUpload).toHaveBeenNthCalledWith(2, file, expect.any(ArrayBuffer), true);
 expect(mockFinish).toHaveBeenCalledWith('file');
 expect(mockDelete).toHaveBeenCalled();
});
test('a failed thumbnail never finalizes and retry preserves the file ID', async () => {
 mockUpload.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
 await expect(uploadEvidence(selection, file, () => true)).rejects.toThrow('offline');
 expect(mockFinish).not.toHaveBeenCalled();
 await uploadEvidence(selection, file, () => true);
 expect(mockFinish).toHaveBeenCalledWith('file');
});
test('account change after native processing prevents any byte upload', async () => {
 let checks = 0;
 await expect(uploadEvidence(selection, file, () => ++checks < 2)).rejects.toThrow('EVIDENCE_SCOPE_CHANGED');
 expect(mockUpload).not.toHaveBeenCalled();
});
test('ready row from a lost finish response is not reuploaded', async () => {
 await uploadEvidence(selection, { ...file, status: 'ready' }, () => true);
 expect(mockUpload).not.toHaveBeenCalled(); expect(mockRender).not.toHaveBeenCalled();
});
test('PDF upload skips native transforms and image thumbnail', async () => {
 await uploadEvidence(selection, { ...file, mime_type: 'application/pdf' }, () => true);
 expect(mockRender).not.toHaveBeenCalled(); expect(mockUpload).toHaveBeenCalledTimes(1); expect(mockFinish).toHaveBeenCalledTimes(1);
});

test('12MiB HEIC source is accepted before bounded decoding and optimized upload', async () => {
 mockSizes[selection.uri] = 12 * 1024 * 1024;
 await uploadEvidence({ ...selection, mimeType: 'image/heic', size: mockSizes[selection.uri] }, file, () => true);
 expect(mockLoad).toHaveBeenCalled(); expect(mockFinish).toHaveBeenCalled();
});
test('image sources above 25MiB are rejected before decoding', async () => {
 mockSizes[selection.uri] = 25 * 1024 * 1024 + 1;
 await expect(uploadEvidence(selection, file, () => true)).rejects.toThrow('25MiB');
 expect(mockLoad).not.toHaveBeenCalled(); expect(mockUpload).not.toHaveBeenCalled();
});
test('PDF above 10MiB is rejected before reading bytes', async () => {
 mockSizes[selection.uri] = 12 * 1024 * 1024;
 await expect(uploadEvidence(selection, { ...file, mime_type: 'application/pdf' }, () => true)).rejects.toThrow('10MB');
 expect(mockRead).not.toHaveBeenCalled(); expect(mockLoad).not.toHaveBeenCalled();
});
test('optimized output above 10MiB is rejected before reading or upload and releases refs', async () => {
 mockSizes['file:///optimized.jpg'] = 10 * 1024 * 1024 + 1;
 await expect(uploadEvidence(selection, file, () => true)).rejects.toThrow('10MB');
 expect(mockRead).not.toHaveBeenCalled(); expect(mockUpload).not.toHaveBeenCalled();
 expect(mockSource.release).toHaveBeenCalled(); expect(mockRelease).toHaveBeenCalled(); expect(mockDelete).toHaveBeenCalled();
});
test('scope change after bounded load releases source without creating manipulator', async () => {
 let calls = 0;
 await expect(uploadEvidence(selection, file, () => ++calls < 2)).rejects.toThrow('EVIDENCE_SCOPE_CHANGED');
 expect(mockSource.release).toHaveBeenCalled(); expect(mockManipulate).not.toHaveBeenCalled();
});
test('render failure releases both native context and bounded source', async () => {
 mockRender.mockRejectedValueOnce(new Error('decode failed'));
 await expect(uploadEvidence(selection, file, () => true)).rejects.toThrow('decode failed');
 expect(mockSource.release).toHaveBeenCalled(); expect(mockRelease).toHaveBeenCalled();
});
