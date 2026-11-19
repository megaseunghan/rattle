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
 render(<Harness />);await act(async()=>{fireEvent.press(screen.getByLabelText('등록 전 증빙 선택'));});
 fireEvent.press(screen.getByLabelText('receipt.jpg 미리보기'));
 expect(screen.getByLabelText('증빙 미리보기 닫기')).toBeTruthy();fireEvent.press(screen.getByLabelText('증빙 미리보기 닫기'));
 fireEvent.press(screen.getByLabelText('receipt.jpg 선택 삭제'));expect(screen.queryByLabelText('receipt.jpg 미리보기')).toBeNull();
});
test('ten-file cap includes existing staged selections',async()=>{
 const initial=Array.from({length:10},(_,i)=>({...asset,id:`existing-${i}`}));
 render(<Harness initial={initial} />);await act(async()=>{fireEvent.press(screen.getByLabelText('등록 전 증빙 선택'));});
 expect(screen.getByText(/증빙은 한 건에 최대 10개/)).toBeTruthy();
 expect(screen.getByText('선택 10개')).toBeTruthy();
});
test.each([['image/heic',12*1024*1024,true],['image/jpeg',25*1024*1024+1,false],['application/pdf',100,false]])('staging source validation %s %i',async(mimeType,size,accepted)=>{
 mockPick.mockResolvedValue({canceled:false,assets:[{...asset,mimeType,size}]});
 render(<Harness />);await act(async()=>{fireEvent.press(screen.getByLabelText('등록 전 증빙 선택'));});
 expect(!!screen.queryByLabelText('receipt.jpg 미리보기')).toBe(accepted);
});
