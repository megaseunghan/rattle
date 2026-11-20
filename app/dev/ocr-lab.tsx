import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { AppBar } from '../../lib/components/ui/AppBar';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { useAuth } from '../../lib/contexts/AuthContext';
import { pickLabImages, releaseLabImages, shareLabJson } from '../../lib/ocr/labIO';
import { parseReceipt, type ParsedReceipt } from '../../lib/ocr/receiptParser';
import { getTextRecognitionModule, recognizeText, type RecognitionResult } from '../../modules/rattle-text-recognition';

interface LabResult { id: string; fileName: string; benchmarkKey: string; ocr: RecognitionResult | null; parsed: ParsedReceipt | null; error: string | null }
const amount = (n: number | null | undefined) => n == null ? '미확인' : `${n.toLocaleString('ko-KR')}원`;


export default function OcrLabScreen() {
  if (!__DEV__) return <ErrorMessage message="사용할 수 없는 화면이에요" />;
  return <AuthorizedOcrLab />;
}

function AuthorizedOcrLab() {
  const { user, store, canManageStore, permissionsReady, devPreviewMode, permissionRevision } = useAuth();
  if (!permissionsReady) return <LoadingSpinner />;
  if (!user || !store || !canManageStore || devPreviewMode !== 'self') {
    return <SafeAreaView style={styles.page}><AppBar title="영수증 인식 측정" onBack={() => router.back()} /><ErrorMessage message="매장 관리자만 사용할 수 있어요" /></SafeAreaView>;
  }
  return <OcrLabBody key={`${user.id}:${store.id}:${permissionRevision}`} />;
}

function OcrLabBody() {
  const [results, setResults] = useState<LabResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cleanupNeeded, setCleanupNeeded] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const pendingCleanup = useRef<string[]>([]);
  const cleanupRunning = useRef(false);
  const mounted = useRef(true);
  const running = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    void native?.cleanupTemporaryFiles?.().catch(() => {
      if (mounted.current) { setCleanupNeeded(true); setError('이전 임시 파일을 지우지 못했어요. 다시 정리해 주세요'); }
    });
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  const native = getTextRecognitionModule();
  const available = !!native && (Platform.OS === 'android' || (Platform.OS === 'ios' && !!native.pickImages));

  const isCleanupFailure = (value: unknown) => !!value && typeof value === 'object' && 'code' in value && value.code === 'ERR_OCR_CLEANUP';
  async function cleanupPending() {
    if (!native) return;
    if (pendingCleanup.current.length) await releaseLabImages(native, pendingCleanup.current);
    await native.cleanupTemporaryFiles?.();
    pendingCleanup.current = [];
  }
  async function retryCleanup() {
    if (!native || busy || sharing || cleanupRunning.current) return;
    cleanupRunning.current = true; setCleaning(true);
    try {
      await cleanupPending();
      if (mounted.current) { setCleanupNeeded(false); setError(null); }
    } catch { if (mounted.current) setError('임시 파일을 지우지 못했어요. 다시 정리해 주세요'); }
    finally { cleanupRunning.current = false; if (mounted.current) setCleaning(false); }
  }
  async function pickAndRecognize() {
    if (running.current || cleanupRunning.current || !native || !available) return;
    running.current = true;
    const run = ++generation.current;
    const current = () => mounted.current && generation.current === run;
    setBusy(true); setError(null); setProgress('사진을 선택해 주세요');
    let uris: string[] = [];
    try {
      if (cleanupNeeded) {
        try { await cleanupPending(); if (current()) setCleanupNeeded(false); }
        catch { if (current()) setError('임시 파일을 지우지 못했어요. 다시 정리해 주세요'); return; }
      }
      if (!current()) return;
      const photos = await pickLabImages(native);
      uris = photos.map(p => p.uri);
      if (!current() || !photos.length) return;
      setResults([]);
      for (const [index, photo] of photos.entries()) {
        if (!current()) break;
        setProgress(`${index + 1} / ${photos.length}장 인식 중`);
        const id = `image-${index + 1}`;
        let item: LabResult;
        try {
          const ocr = await recognizeText(photo.uri);
          const parsed = parseReceipt(ocr.lines, id);
          item = { id, fileName: photo.fileName, benchmarkKey: '', ocr, parsed, error: null };
        } catch {
          item = { id, fileName: photo.fileName, benchmarkKey: '', ocr: null, parsed: null, error: '인식하지 못했어요. 사진을 다시 선택해 주세요' };
        }
        if (current()) setResults(previous => [...previous, item]);
      }
    } catch (cause) {
      if (current()) {
        if (isCleanupFailure(cause)) { setCleanupNeeded(true); setError('임시 파일을 지우지 못했어요. 다시 정리해 주세요'); }
        else setError('사진을 열지 못했어요. 다시 선택해 주세요');
      }
    } finally {
      try { await releaseLabImages(native, uris); }
      catch {
        pendingCleanup.current = uris;
        if (mounted.current) { setCleanupNeeded(true); setError('임시 사진을 지우지 못했어요. 다시 정리해 주세요'); }
      }
      running.current = false;
      if (mounted.current) { setBusy(false); setProgress(''); }
    }
  }
  async function share() {
    if (!mounted.current || busy || sharing || !native || !results.length) return;
    setSharing(true); setError(null);
    try {
      await shareLabJson(native, JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), platform: Platform.OS,
        coordinateOrigin: 'top-left', parserVersion: 1, results }, null, 2));
    } catch (cause) {
      if (mounted.current) {
        if (isCleanupFailure(cause)) { setCleanupNeeded(true); setError('공유 후 임시 파일을 지우지 못했어요. 다시 정리해 주세요'); }
        else setError('결과를 공유하지 못했어요. 다시 시도해 주세요');
      }
    }
    finally { if (mounted.current) setSharing(false); }
  }
  function confirmShare() {
    Alert.alert('인식 결과 공유', '영수증에서 읽은 원문이 JSON에 포함돼요. 공유할 대상을 확인해 주세요.', [
      { text: '취소', style: 'cancel' }, { text: '공유', onPress: () => { void share(); } },
    ]);
  }
  const header = <View style={styles.section}>
    <Text style={styles.body}>사진은 이 기기에서 인식해요. 매입으로 저장되지 않아요. 여러 장도 각각 측정하며 합치지 않아요.</Text>
    {!available && <Text style={styles.body}>기기 OCR 모듈이 포함된 새 빌드가 필요해요.</Text>}
    <Pressable accessibilityRole="button" disabled={!available || busy || sharing || cleaning} onPress={() => { void pickAndRecognize(); }} style={[styles.button, (!available || busy || sharing || cleaning) && styles.disabled]}>
      <Text style={styles.buttonText}>사진 선택</Text>
    </Pressable>
    {busy && <><Text accessibilityLiveRegion="polite" style={styles.body}>{progress}</Text><Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { generation.current += 1; setProgress('현재 사진 인식 후 멈춰요'); }}><Text style={styles.link}>측정 중지</Text></Pressable></>}
    {!!results.length && <View style={styles.actions}>
      <Pressable accessibilityRole="button" disabled={busy || sharing} style={styles.secondary} onPress={confirmShare}><Text style={styles.link}>{sharing ? '공유 중' : 'JSON 공유'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || sharing} style={styles.secondary} onPress={() => setResults([])}><Text style={styles.link}>결과 지우기</Text></Pressable>
    </View>}
    {error && <ErrorMessage message={error} />}
    {cleanupNeeded && <Pressable accessibilityRole="button" disabled={busy || sharing || cleaning} style={styles.secondary} onPress={() => { void retryCleanup(); }}><Text style={styles.link}>{cleaning ? '정리 중' : '다시 정리'}</Text></Pressable>}
    {!results.length && !busy && <Text style={styles.body}>영수증을 선택하면 처리 시간, 원문과 파서 결과가 표시돼요.</Text>}
  </View>;
  return <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
    <AppBar title="영수증 인식 측정" onBack={() => router.back()} />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList data={results} keyExtractor={item => item.id} ListHeaderComponent={header} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}
        renderItem={({ item }) => <View style={styles.result}>
          <Text style={styles.title}>{item.id} · {item.fileName}</Text>
          <Text style={styles.body}>Mac 비교 파일명 (선택, 예: 0_0)</Text>
          <TextInput accessibilityLabel={`${item.id} Mac 비교 파일명`} style={styles.input} placeholder="0_0" autoCapitalize="none" autoCorrect={false} editable={!busy && !sharing} value={item.benchmarkKey}
            onChangeText={benchmarkKey => setResults(previous => previous.map(r => r.id === item.id ? { ...r, benchmarkKey } : r))} />
          {item.error && <Text style={styles.body}>{item.error}</Text>}
          {item.ocr && <Text style={styles.number}>{item.ocr.engine} · {Math.round(item.ocr.elapsedMs)} ms · {item.ocr.lines.length}줄</Text>}
          {item.parsed && <>
            <Text style={styles.title}>선택 합계 {amount(item.parsed.selectedTotal?.value)}</Text>
            <Text style={styles.body}>품목 {item.parsed.items.length}개 · 품목 합 {amount(item.parsed.checks.itemSum)}</Text>
            <Text style={styles.body}>날짜 후보: {item.parsed.dateCandidates.map(d => d.value).join(', ') || '없음'}</Text>
            <Text style={styles.body}>거래처 후보: {item.parsed.vendorCandidates.map(v => v.value).join(', ') || '없음'}</Text>
            {item.parsed.totalCandidates.map((c, index) => <Text key={index} style={styles.body}>합계 후보: {c.label} · {amount(c.value)} · 우선순위 {c.score}</Text>)}
            {item.parsed.warnings.map(w => <Text key={w} style={styles.body}>· {w}</Text>)}
          </>}
          <Text style={styles.title}>인식 원문 · 신뢰도</Text>
          {item.ocr?.lines.map((line, index) => <Text selectable key={index} style={styles.body}>{index + 1}. {line.text} · {line.confidence == null ? '신뢰도 미제공' : `${Math.round(line.confidence * 100)}%`}</Text>)}
        </View>} />
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.homeCanvas }, flex: { flex: 1 },
  list: { padding: 20, paddingBottom: 40, gap: 16 }, section: { gap: 12 },
  result: { paddingVertical: 20, borderTopWidth: 1, borderColor: Colors.homeBorder, gap: 10 },
  title: { fontFamily: Fonts.wantedBold, color: Colors.black, fontSize: 17 },
  body: { fontFamily: Fonts.wantedRegular, color: Colors.gray700, fontSize: 14, lineHeight: 22 },
  number: { fontFamily: Fonts.geistMedium, color: Colors.black, fontSize: 14 },
  button: { minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: Colors.action, alignItems: 'center' },
  buttonText: { fontFamily: Fonts.wantedBold, fontSize: 16, color: Colors.white }, disabled: { opacity: .45 },
  secondary: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 8, justifyContent: 'center' },
  link: { color: Colors.action, fontFamily: Fonts.wantedSemiBold, fontSize: 14 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  input: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 10, backgroundColor: Colors.white, fontFamily: Fonts.geistRegular, color: Colors.black },
});
