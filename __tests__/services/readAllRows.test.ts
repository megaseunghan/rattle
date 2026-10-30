import { readAllRows } from '../../lib/services/readAllRows';
it('요청 크기보다 작은 서버 상한이어도 마지막 행까지 읽는다',async()=>{
 const source=Array.from({length:1203},(_,id)=>({id}));
 const page=jest.fn(async(start:number,end:number)=>({data:source.slice(start,Math.min(end+1,start+127)),error:null}));
 expect(await readAllRows(page)).toEqual(source);
 expect(page.mock.calls.at(-1)?.[0]).toBe(1203);
});
it('중간 페이지 오류를 부분 합계로 반환하지 않는다',async()=>{
 let call=0;
 await expect(readAllRows(async()=>++call===1?{data:[1],error:null}:{data:null,error:new Error('failed')})).rejects.toThrow('failed');
});
