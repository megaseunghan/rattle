import { evidenceFailure, logEvidenceFailure } from '../../lib/utils/evidenceError';
test.each([
 [{message:'EVIDENCE_LIMIT'},'limit'],[{message:'EVIDENCE_NO_OCCURRENCE'},'occurrence'],[{code:'42501'},'forbidden'],[{statusCode:'403'},'forbidden'],
])('terminal error %p disables retry',(error,kind)=>{expect(evidenceFailure(error)).toMatchObject({kind,retryable:false});});
test('network failures retain retry and logs omit raw evidence details',()=>{
 const failure=evidenceFailure(new Error('offline https://secret/path.pdf?token=private'));
 expect(failure.retryable).toBe(true);const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
 logEvidenceFailure(failure);expect(warn).toHaveBeenCalledWith('evidence_upload_failed',{kind:'upload',retryable:true});warn.mockRestore();
});
