import { Text } from 'react-native';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { EvidenceStagingPanel } from '../../lib/components/EvidenceStagingPanel';
import { EvidenceSelection } from '../../lib/types/evidence';
const mockPick = jest.fn();
let mockId = 0;
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockPick(...args) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `draft-${++mockId}` }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri:'file:///cache' } }, File: jest.fn().mockImplementation(()=>({delete:jest.fn()})) }));
const asset = {uri:'file:///cache/receipt.jpg',name:'receipt.jpg',mimeType:'image/jpeg',size:100};
function Harness({initial=[]}:{initial?:EvidenceSelection[]}) { const [files,setFiles]=useState(initial);return <><Text>{`선택 ${files.length}개`}</Text><EvidenceStagingPanel files={files} onChange={setFiles} /></>; }
beforeEach(()=>{jest.clearAllMocks();mockId=0;mockPick.mockResolvedValue({canceled:false,assets:[asset]});});
test('local staging add, image modal and accessible removal',async()=>{
 render(<Harness />);await act(async()=>{fireEvent.press(screen.getByText('파일 선택'));});
 fireEvent.press(screen.getByLabelText('receipt.jpg 미리보기'));
 expect(screen.getByLabelText('증빙 미리보기 닫기')).toBeTruthy();fireEvent.press(screen.getByLabelText('증빙 미리보기 닫기'));
 fireEvent.press(screen.getByLabelText('receipt.jpg 선택 삭제'));expect(screen.queryByLabelText('receipt.jpg 미리보기')).toBeNull();
});
test('ten-file cap includes existing staged selections',async()=>{
 const initial=Array.from({length:10},(_,i)=>({...asset,id:`existing-${i}`}));
 render(<Harness initial={initial} />);await act(async()=>{fireEvent.press(screen.getByText('파일 선택'));});
 expect(screen.getByText(/증빙은 한 건에 최대 10개/)).toBeTruthy();
 expect(screen.getByText('선택 10개')).toBeTruthy();
});
test.each([['image/heic',12*1024*1024,true],['image/jpeg',25*1024*1024+1,false],['application/pdf',100,true]])('staging source validation %s %i',async(mimeType,size,accepted)=>{
 mockPick.mockResolvedValue({canceled:false,assets:[{...asset,mimeType,size}]});
 render(<Harness />);await act(async()=>{fireEvent.press(screen.getByText('파일 선택'));});
 expect(!!screen.queryByLabelText('receipt.jpg 미리보기')).toBe(accepted);
});

const mockAlbum = jest.fn(), mockCamera = jest.fn(), mockCameraPermission = jest.fn(), mockAlbumPermission = jest.fn();
jest.mock('expo-image-picker', () => ({
 UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
 launchImageLibraryAsync: (...args: unknown[]) => mockAlbum(...args), launchCameraAsync: (...args: unknown[]) => mockCamera(...args),
 requestCameraPermissionsAsync: () => mockCameraPermission(), getMediaLibraryPermissionsAsync: () => mockAlbumPermission(),
}));
test('album selects multiple originals with unavailable limited-access filenames', async () => {
 mockAlbum.mockResolvedValue({ canceled: false, assets: ['a','b'].map(name => ({
   uri: 'file:///cache/' + name + '.heic', fileName: null, assetId: null, fileSize: 100, mimeType: 'image/heic',
 })) });
 render(<Harness />);
 await act(async () => { fireEvent.press(screen.getByText('사진 보관함')); });
 expect(mockAlbum).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes:['images'], allowsMultipleSelection:true, selectionLimit:10, exif:false, quality:1 }));
 expect(screen.getByText('선택 2개')).toBeTruthy();
 expect(mockPick).not.toHaveBeenCalled();
});
test('camera denial gives settings guidance, then an allowed capture is staged', async () => {
 mockCameraPermission.mockResolvedValueOnce({ granted:false }).mockResolvedValueOnce({ granted:true });
 mockCamera.mockResolvedValue({ canceled:false, assets:[{ uri:'file:///cache/camera.jpg', fileSize:100, mimeType:'image/jpeg' }] });
 render(<Harness />);
 await act(async () => { fireEvent.press(screen.getByText('카메라로 찍기')); });
 expect(screen.getByText(/설정에서 카메라 접근/)).toBeTruthy();
 expect(mockCamera).not.toHaveBeenCalled();
 await act(async () => { fireEvent.press(screen.getByText('카메라로 찍기')); });
 expect(screen.getByText('선택 1개')).toBeTruthy();
 expect(mockCamera).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes:['images'], exif:false }));
});
test.each(['limited','none'])('canceled album with %s access offers settings help', async accessPrivileges => {
 mockAlbum.mockResolvedValue({ canceled:true, assets:null });
 mockAlbumPermission.mockResolvedValue({ accessPrivileges, status:accessPrivileges === 'none' ? 'denied' : 'granted' });
 render(<Harness />);
 await act(async () => { fireEvent.press(screen.getByText('사진 보관함')); });
 expect(screen.getByText(/설정에서 Rattle의 사진 접근/)).toBeTruthy();
 expect(screen.getByText('선택 0개')).toBeTruthy();
});
