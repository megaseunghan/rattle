import { memo, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { disposeEvidenceCache, pickEvidenceSelections } from '../media/evidencePicker';
import { EvidenceLocalPreview } from './EvidenceLocalPreview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useAuth } from '../contexts/AuthContext';
import { useStorePermissions } from '../hooks/useStorePermissions';
import { EvidenceFile, EvidenceSelection, EvidenceTarget, MAX_EVIDENCE_FILES } from '../types/evidence';
import { discardEvidence, discardPendingEvidence, listEvidence, reserveEvidence, signEvidence } from '../services/evidence';
import { prepareEvidenceSelection } from '../media/evidenceSelection';
import { UserFacingError } from '../utils/error';
import { uploadEvidence } from '../media/evidenceUpload';
import { EvidenceReuploadRequired, evidenceFailure, logEvidenceFailure, type EvidenceFailure } from '../utils/evidenceError';

type Job = { selection: EvidenceSelection; status: 'queued' | 'uploading' | 'failed'; row?: EvidenceFile; failure?: EvidenceFailure };

/** Explicit file cancellation also covers a lost finish response; bulk cleanup keeps ready protection. */
async function discardCanceledUpload(file: EvidenceFile): Promise<void> {
  if (file.status === 'ready') { await discardEvidence(file); return; }
  try { await discardPendingEvidence(file); }
  catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    if (!message.includes('EVIDENCE_ALREADY_READY')) throw error;
    await discardEvidence({ ...file, status: 'ready' });
  }
}

const EvidenceThumbnail = memo(function EvidenceThumbnail({ file, account, onOpen }: { file: EvidenceFile; account: string; onOpen: (file: EvidenceFile, thumbnail?: string) => void }) {
  const [url, setUrl] = useState<string>();
  const [failure, setFailure] = useState<'retry' | 'original' | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (file.mime_type === 'image/jpeg' && file.status === 'ready') {
      void signEvidence(file, true).then(value => {
        if (active) { setUrl(value); setFailure(null); }
      }).catch(error => {
        if (active) { setUrl(undefined); setFailure(error instanceof EvidenceReuploadRequired ? 'original' : 'retry'); }
      });
    }
    return () => { active = false; };
  }, [file.id, file.status, attempt]);
  const action = failure === 'retry' ? '다시 불러오기' : failure === 'original' ? '원본 열기' : '열기';
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${file.name} ${action}`} style={styles.preview} onPress={() => failure === 'retry' ? setAttempt(x => x + 1) : onOpen(file, url)}>
    {url && !failure ? <Image style={styles.image} source={{ uri: url, cacheKey: `${account}:${file.id}:thumb` }} cachePolicy="memory-disk" contentFit="contain" recyclingKey={file.id} onError={() => setFailure('retry')} /> : <Text style={styles.help}>{failure ? action : file.mime_type === 'application/pdf' ? 'PDF' : '불러오는 중'}</Text>}
  </TouchableOpacity>;
});

type EvidencePanelProps = { target: EvidenceTarget; disabled?: boolean; initiallyExpanded?: boolean; initialSelections?: EvidenceSelection[]; onPendingChange?: (count: number) => void };

/** Collapsed until requested: no object URL, thumbnail or original request while closed. */
export function EvidencePanel(props: EvidencePanelProps) {
  const { user, store, storeRole, canManageStore, canReadFinancials, devPreviewMode } = useAuth();
  const key = `${user?.id}:${store?.id}:${storeRole}:${canManageStore}:${canReadFinancials}:${devPreviewMode}:${props.target.kind}:${props.target.id}:${props.target.month ?? ''}`;
  // A keyed inner component immediately removes old-account images and queued local files.
  if (!user || store?.id !== props.target.storeId || !canReadFinancials || devPreviewMode !== 'self' || (props.target.kind === 'recurring' && !canManageStore)) return null;
  return <EvidencePanelContent key={key} {...props} account={user.id} canManageStore={canManageStore} />;
}
function EvidencePanelContent({ target, disabled = false, initiallyExpanded = false, initialSelections = [], onPendingChange, account, canManageStore }: EvidencePanelProps & { account: string; canManageStore: boolean }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [jobs, setJobs] = useState<Job[]>(() => initialSelections.map(selection => ({ selection, status: 'queued' })));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [viewer, setViewer] = useState<{ file: EvidenceFile; url: string; thumb?: string } | null>(null);
  const canceledJobs = useRef(new Set<string>());
  const cancelRequests = useRef(new Set<string>());
  const autoStarted = useRef(false);
  const ownedCache = useRef(new Set<string>());
  useEffect(() => { onPendingChange?.(jobs.length); }, [jobs.length, onPendingChange]);
  useEffect(() => () => { ownedCache.current.forEach(disposeEvidenceCache); }, []);
  const alive = useRef(true), lock = useRef(false), generation = useRef(0);
  const signed = useRef(new Map<string, { url: string; expires: number }>());
  const permissions = useStorePermissions();
  const canWrite = permissions.canManageStock && (canManageStore || target.kind === 'purchase');
  useEffect(() => { alive.current = true; return () => { alive.current = false; signed.current.clear(); }; }, []);
  async function refresh() {
    const request = ++generation.current;
    const current = () => alive.current && request === generation.current;
    setLoading(true); setError('');
    try { const rows = await listEvidence(target); if (current()) { setFiles(rows); setLoaded(true); } }
    catch { if (current()) setError('증빙을 불러오지 못했어요. 다시 불러와 주세요.'); }
    finally { if (current()) setLoading(false); }
  }
  useEffect(() => { if (expanded) void refresh(); }, [expanded]);
  function patch(id: string, update: Partial<Job>) { if (alive.current) setJobs(previous => previous.map(job => job.selection.id === id ? { ...job, ...update } : job)); }
  async function run(batch: Job[]) {
    if (!alive.current || lock.current || disabled || !canWrite) return;
    lock.current = true; setBusy(true);
    // One native transform/upload at a time bounds memory for large camera images.
    try {
      for (const job of batch) {
        if (!alive.current) break;
        if (canceledJobs.current.has(job.selection.id)) continue;
        if (job.status === 'failed') cancelRequests.current.delete(job.selection.id);
        patch(job.selection.id, { status: 'uploading' });
        let row = job.row;
        try {
          row = await reserveEvidence(target, job.selection);
          patch(job.selection.id, { row });
          if (!alive.current) break;
          if (!cancelRequests.current.has(job.selection.id)) {
            await uploadEvidence(job.selection, row, () => alive.current && !cancelRequests.current.has(job.selection.id));
            row = { ...row, status: 'ready' };
            patch(job.selection.id, { row });
          }
          if (!alive.current) break;
          if (cancelRequests.current.has(job.selection.id)) {
            await discardCanceledUpload(row);
            canceledJobs.current.add(job.selection.id);
          }
          if (ownedCache.current.delete(job.selection.uri)) disposeEvidenceCache(job.selection.uri);
          if (alive.current) setJobs(previous => previous.filter(value => value.selection.id !== job.selection.id));
        } catch (error) {
          if (!alive.current) break;
          if (cancelRequests.current.has(job.selection.id)) {
            try {
              // Resolve a lost reservation response using the same ID before cleanup.
              row ??= await reserveEvidence(target, job.selection);
              patch(job.selection.id, { row });
              if (!alive.current) break;
              await discardCanceledUpload(row);
              canceledJobs.current.add(job.selection.id);
              if (alive.current) setJobs(previous => previous.filter(value => value.selection.id !== job.selection.id));
              continue;
            } catch {
              const failure: EvidenceFailure = { kind: 'cancel', message: '첨부 취소를 완료하지 못했어요. 다시 취소해주세요.', retryable: false };
              if (alive.current) { logEvidenceFailure(failure); patch(job.selection.id, { status: 'failed', failure }); }
              continue;
            }
          }
          const failure = evidenceFailure(error);
          if (alive.current) { logEvidenceFailure(failure); patch(job.selection.id, { status: 'failed', failure }); }
        }
      }
      if (alive.current) await refresh();
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    if (autoStarted.current || !initialSelections.length || !loaded || error || disabled || !canWrite || lock.current) return;
    autoStarted.current = true;
    void run(initialSelections.map(selection => ({ selection, status: 'queued' })));
  }, [loaded, error, disabled, canWrite]);
  const attachmentCount = new Set([...files.map(f => f.id), ...jobs.map(j => j.selection.id)]).size;
  async function pick() {
    if (!alive.current || lock.current || disabled || !loaded || !canWrite) return;
    lock.current = true; setBusy(true);
    let batch: Job[] = [];
    try {
      const selected = await pickEvidenceSelections(attachmentCount, () => alive.current);
      if (!alive.current) return;
      selected.forEach(file => ownedCache.current.add(file.uri));
      batch = selected.map(selection => ({ selection, status: 'queued' }));
      setJobs(previous => [...previous, ...batch]);
    } catch (error) { if (alive.current) setError(error instanceof UserFacingError ? error.message : '파일을 선택하지 못했어요. 다시 시도해주세요.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
    if (batch.length && alive.current) await run(batch);
  }
  function cancelJob(job: Job) {
    if (disabled) return;
    cancelRequests.current.add(job.selection.id);
    if (job.status === 'uploading') return; // Active run observes cancellation before/after every await.
    if (lock.current) {
      if (job.status === 'queued') { canceledJobs.current.add(job.selection.id); setJobs(previous => previous.filter(value => value.selection.id !== job.selection.id)); }
      return;
    }
    const reserved = job.row ?? files.find(file => file.id === job.selection.id);
    if (reserved) void remove(reserved, true);
    else { canceledJobs.current.add(job.selection.id); setJobs(previous => previous.filter(value => value.selection.id !== job.selection.id)); }
  }
  async function reselect(file: EvidenceFile) {
    if (!alive.current || lock.current || disabled || !canWrite) return;
    lock.current = true; setBusy(true);
    let job: Job | undefined;
    let pickedUri: string | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      pickedUri = asset.uri;
      if (!alive.current) return;
      const prepared = prepareEvidenceSelection(asset);
      if ((prepared.mimeType === 'application/pdf') !== (file.mime_type === 'application/pdf')) throw new UserFacingError('기존 첨부와 같은 종류의 파일을 선택해주세요.');
      job = { row: file, status: 'queued', selection: { id: file.id, uri: asset.uri, name: file.name, ...prepared } };
      ownedCache.current.add(asset.uri);
      setJobs(previous => [...previous.filter(j => j.selection.id !== file.id), job!]);
    } catch (error) { if (alive.current) setError(error instanceof UserFacingError ? error.message : '파일을 다시 선택해주세요.'); }
    finally {
      if (!job && pickedUri) disposeEvidenceCache(pickedUri);
      lock.current = false;
      if (alive.current) setBusy(false);
    }
    if (job && alive.current) await run([job]);
  }
  async function remove(file: EvidenceFile, canceledUpload = false) {
    if (!alive.current || lock.current || disabled || !canWrite) return;
    lock.current = true; setBusy(true);
    try { await (canceledUpload ? discardCanceledUpload(file) : (file.status === 'ready' || file.status === 'deleting') ? discardEvidence(file) : discardPendingEvidence(file)); if (alive.current) { setJobs(previous => previous.filter(j => j.selection.id !== file.id)); await refresh(); } }
    catch { if (alive.current) setError('첨부 삭제를 완료하지 못했어요. 다시 시도해주세요.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function cleanupPending() {
    if (!alive.current || lock.current || disabled || !canWrite) return;
    lock.current = true; setBusy(true); setError('');
    let failed = false;
    try {
      // Refresh the exact target before cleanup; ready rows are never claimed by the server.
      const rows = await listEvidence(target);
      for (const file of rows) {
        if (!alive.current) break;
        if (file.status === 'ready' || (file.created_by !== account && !canManageStore)) continue;
        try {
          await (file.status === 'deleting' ? discardEvidence(file) : discardPendingEvidence(file));
          if (alive.current) setJobs(previous => previous.filter(job => job.selection.id !== file.id));
        } catch { failed = true; }
      }
      if (alive.current) {
        await refresh();
        if (failed) setError('일부 미완료 첨부를 정리하지 못했어요. 목록을 확인하고 다시 정리해주세요.');
      }
    } catch { if (alive.current) setError('미완료 첨부를 확인하지 못했어요. 다시 시도해주세요.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function open(file: EvidenceFile, thumb?: string) {
    try {
      const cached = signed.current.get(file.id);
      const url = cached && cached.expires > Date.now() ? cached.url : await signEvidence(file);
      if (!alive.current) return;
      if (!cached || cached.expires <= Date.now()) signed.current.set(file.id, { url, expires: Date.now() + 240000 });
      if (file.mime_type === 'application/pdf') await WebBrowser.openBrowserAsync(url);
      else setViewer({ file, url, thumb });
    } catch (error) {
      if (!alive.current) return;
      if (!(error instanceof EvidenceReuploadRequired)) {
        setError('증빙을 열지 못했어요. 다시 시도해주세요.');
        return;
      }
      const title = '원본을 다시 첨부해주세요';
      if (!canWrite || disabled) {
        Alert.alert(title, '매장 관리자에게 이 파일의 원본을 다시 첨부해 달라고 요청해주세요.');
      } else if (attachmentCount >= MAX_EVIDENCE_FILES) {
        Alert.alert(title, '첨부가 가득 찼어요. 기존 증빙은 보관하고 관리자와 원본 사본을 확인한 뒤 첨부 공간을 마련해주세요.');
      } else {
        Alert.alert(title, '기기에 보관한 원본을 새 증빙으로 첨부해주세요. 기존 증빙은 새 파일이 열리는지 확인한 뒤 정리해주세요.', [
          { text: '닫기', style: 'cancel' },
          { text: '원본 선택', onPress: () => { void pick(); } },
        ]);
      }
    }
  }
  const jobIds = new Set(jobs.map(job => job.selection.id));
  return <View style={styles.container}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} style={styles.button} onPress={() => setExpanded(value => !value)}><Text style={styles.title}>증빙 자료 {expanded ? '접기' : '열기'}</Text></TouchableOpacity>
    {expanded && <>
      <Text style={styles.help}>이미지·PDF / 건당 최대 10개 / 이미지 원본 25MiB·PDF 10MiB / 변환 후 10MiB</Text>
      {loading && <Text style={styles.help}>증빙을 불러오는 중이에요.</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!loading && !!error && <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={refresh}><Text style={styles.link}>다시 불러오기</Text></TouchableOpacity>}
      <FlatList horizontal data={files.filter(file => !jobIds.has(file.id))} initialNumToRender={3} maxToRenderPerBatch={3} windowSize={3} keyExtractor={item => item.id} style={styles.list}
        renderItem={({ item }) => <View style={styles.file}>
          {item.status === 'ready' ? <EvidenceThumbnail file={item} account={account} onOpen={open} /> : <TouchableOpacity disabled={!canWrite || busy || disabled || (item.created_by !== account || item.status !== 'pending')} style={styles.button} accessibilityRole="button" onPress={() => { void reselect(item); }}><Text style={styles.link}>{item.status !== 'pending' ? '정리 미완료 · 다시 삭제해주세요' : item.created_by === account ? '업로드 미완료 · 파일 다시 선택' : '업로드 미완료'}</Text></TouchableOpacity>}
          <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
          {canWrite && (item.created_by === account || canManageStore) && <TouchableOpacity disabled={busy || disabled} style={styles.button} accessibilityRole="button" accessibilityLabel={`${item.name} 첨부 삭제`} onPress={() => Alert.alert('첨부 삭제', '이 증빙 파일을 삭제할까요?', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { void remove(item); } }])}><Text style={styles.error}>삭제</Text></TouchableOpacity>}
        </View>} />
      {jobs.map(job => <View key={job.selection.id} style={styles.job}>
        <EvidenceLocalPreview selection={job.selection} />
        <Text style={styles.name}>{job.selection.name}</Text><Text accessibilityLiveRegion="polite" style={styles.help}>{job.status === 'failed' ? job.failure?.message ?? '업로드 실패 · 거래는 저장되어 있어요.' : job.status === 'queued' ? '업로드 대기' : '최적화·업로드 중'}</Text>
        {job.status === 'failed' && job.failure?.retryable !== false && <TouchableOpacity disabled={busy || disabled} style={styles.button} accessibilityRole="button" accessibilityLabel={`${job.selection.name} 업로드 재시도`} onPress={() => { void run([job]); }}><Text style={styles.link}>이 파일 다시 업로드</Text></TouchableOpacity>}
        <TouchableOpacity disabled={disabled || (busy && job.status === 'failed')} style={styles.button} accessibilityRole="button" accessibilityLabel={`${job.selection.name} 업로드 취소`} onPress={() => cancelJob(job)}><Text style={styles.link}>첨부 취소</Text></TouchableOpacity>
      </View>)}
      {!loading && loaded && files.length === 0 && jobs.length === 0 && <Text style={styles.help}>첨부한 증빙이 없어요.</Text>}
      {canWrite && files.some(file => file.status !== 'ready' && (file.created_by === account || canManageStore)) && <TouchableOpacity disabled={busy || disabled || !loaded} style={styles.button} accessibilityRole="button" onPress={() => Alert.alert('미완료 첨부 정리', '업로드가 끝나지 않은 첨부를 모두 삭제할까요? 정리 후에는 파일을 다시 선택해야 해요. 완료된 증빙은 유지돼요.', [{ text: '취소', style: 'cancel' }, { text: '정리', style: 'destructive', onPress: () => { void cleanupPending(); } }])}><Text style={styles.error}>미완료 첨부 일괄 삭제</Text></TouchableOpacity>}
      {canWrite && <TouchableOpacity disabled={busy || disabled || !loaded || !!error} style={styles.button} accessibilityRole="button" accessibilityState={{ disabled: busy || disabled || !loaded || !!error, busy }} onPress={pick}><Text style={styles.link}>{busy ? '처리 중…' : '증빙 여러 개 첨부'}</Text></TouchableOpacity>}
    </>}
    <Modal visible={!!viewer} animationType="fade" onRequestClose={() => setViewer(null)}>
      <SafeAreaView style={styles.viewer}>
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => setViewer(null)}><Text style={styles.link}>닫기</Text></TouchableOpacity>
        {viewer && <Image style={styles.original} source={{ uri: viewer.url, cacheKey: `${account}:${viewer.file.id}:full` }} placeholder={viewer.thumb ? { uri: viewer.thumb, cacheKey: `${account}:${viewer.file.id}:thumb` } : undefined} cachePolicy="memory" contentFit="contain" placeholderContentFit="contain" transition={150} onError={() => { setViewer(null); setError('이미지를 불러오지 못했어요. 다시 열어주세요.'); }} />}
      </SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 8, paddingVertical: 8 },
  button: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 8, justifyContent: 'center' },
  title: { fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.black },
  help: { fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.gray600 },
  link: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.action },
  error: { fontSize: 13, color: Colors.danger },
  list: { flexGrow: 0 }, file: { width: 136, marginRight: 12, gap: 6 },
  preview: { width: 128, height: 100, backgroundColor: Colors.gray100, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '100%' },
  name: { fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.black },
  job: { gap: 4, paddingVertical: 8 },
  viewer: { flex: 1, backgroundColor: Colors.homeCanvas }, original: { flex: 1, width: '100%' },
});
