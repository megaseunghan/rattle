import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { StoreFillPatch } from '../../../types';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { DetailSheetMotion, Spacing } from '../../../constants/designTokens';
import { AppIcon } from '../../icons/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getErrorMessage } from '../../utils/error';
import { countStoreFill, STORE_FILL_GROUPS, isStoreFillGroupDone, type StoreFillGroup } from '../../utils/storeFill';
import { LoadingSpinner } from '../LoadingSpinner';
import { ErrorMessage } from '../ErrorMessage';
import { InlineToast } from '../purchase/PurchaseUi';
import { useIndustrialAccidentIndustries, useStoreFill, useStoreFillRole } from './useStoreFill';
import { useHeadcountReference } from './headcountReference';
import { StoreFillGroups, type FillSheetKind } from './StoreFillGroups';
import { StoreFillSheetHost } from './StoreFillSheetHost';
import { DONE_TIP, GROUP_TIPS, READ_ONLY_TIP, pickTip } from './storeFillCopy';

const TOAST_MS = 1600;
/** 이어지는 시트는 앞 시트가 다 내려간 뒤 연다(iOS 모달 겹침 방지). */
const NEXT_SHEET_DELAY_MS = DetailSheetMotion.exit + 150;
const TOTAL = STORE_FILL_GROUPS.length;

function goBack() {
  if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
}

function useToast() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage('');
    setTimeout(() => setMessage(text), 0);
    timer.current = setTimeout(() => setMessage(''), TOAST_MS);
  }, []);
  return { message, show };
}

/** 마저 채우기(fill-v5): 사장님은 고르면 바로 저장, 점장은 보기만. */
export function StoreFillScreen() {
  const { store } = useAuth();
  const storeId = store?.id ?? null;
  const { isManager, canEdit } = useStoreFillRole(storeId);
  const { query, save } = useStoreFill(storeId, isManager);
  const industriesQuery = useIndustrialAccidentIndustries(isManager);
  const headcountReference = useHeadcountReference(storeId, canEdit);
  const values = query.data ?? null;
  const [sheet, setSheet] = useState<FillSheetKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [industryOther, setIndustryOther] = useState(false);
  const [tipGroup, setTipGroup] = useState<StoreFillGroup | null | undefined>(undefined);
  const toast = useToast();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // 화면을 열 때마다 안 채운 묶음 하나를 무작위로 고른다.
  useEffect(() => {
    if (!values || tipGroup !== undefined) return;
    setTipGroup(pickTip(STORE_FILL_GROUPS.filter(group => !isStoreFillGroupDone(group, values))));
  }, [values, tipGroup]);

  const openSheet = useCallback((kind: FillSheetKind) => { setError(null); setSheet(kind); }, []);
  const closeSheet = useCallback(() => { if (!saving) { setSheet(null); setError(null); } }, [saving]);

  const onSave = useCallback(async (patch: StoreFillPatch, next?: FillSheetKind) => {
    if (saving || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await save(patch);
      if (!alive.current) return;
      setSheet(null);
      if (next) setTimeout(() => { if (alive.current) setSheet(next); }, NEXT_SHEET_DELAY_MS);
      else toast.show('저장했어요');
    } catch (e) {
      if (alive.current) setError(getErrorMessage(e, '저장하지 못했어요. 다시 시도해 주세요.'));
    } finally {
      if (alive.current) setSaving(false);
    }
  }, [saving, canEdit, save, toast]);

  const onIndustryOther = useCallback(() => {
    setIndustryOther(true);
    if (values?.industrial_accident_industry) void onSave({ industrial_accident_industry: null });
    else setSheet(null);
  }, [values?.industrial_accident_industry, onSave]);

  const industryLabel = useMemo(() => {
    const code = values?.industrial_accident_industry;
    if (code) return industriesQuery.data?.find(item => item.code === code)?.name ?? null;
    return industryOther ? '목록에 없어요' : null;
  }, [values?.industrial_accident_industry, industriesQuery.data, industryOther]);

  if (!isManager) return null;
  if (query.isLoading) return <LoadingSpinner />;
  if (!values) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header />
        <ErrorMessage message={getErrorMessage(query.error, '매장 정보를 불러오지 못했어요.')} onRetry={() => { void query.refetch(); }} />
      </SafeAreaView>
    );
  }

  const filled = countStoreFill(values);
  const description = !canEdit ? READ_ONLY_TIP : filled === TOTAL ? DONE_TIP : GROUP_TIPS[tipGroup ?? 'payday'];
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">매장 정보 마저 채우기</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.progress} accessible accessibilityLabel={`4개 중 ${filled}개 채웠어요`}>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${(filled / TOTAL) * 100}%` }]} /></View>
          <Text style={styles.progressText}>4개 중 {filled}개</Text>
        </View>
        <StoreFillGroups values={values} readOnly={!canEdit} industryLabel={industryLabel} industryOther={industryOther} onOpen={openSheet} />
      </ScrollView>
      {canEdit ? (
        <StoreFillSheetHost sheet={sheet} values={values} saving={saving} error={error} headcountReference={headcountReference}
          industries={{ data: industriesQuery.data, loading: industriesQuery.isLoading, failed: industriesQuery.isError,
            retry: () => { void industriesQuery.refetch(); } }}
          industryOther={industryOther} onClose={closeSheet} onSave={(patch, next) => { void onSave(patch, next); }}
          onIndustryOther={onIndustryOther} />
      ) : null}
      <InlineToast message={toast.message} bottom={48} />
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="돌아가기" onPress={goBack}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}>
        <AppIcon name="chevron-back" size={24} color={Colors.black} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.white },
  header: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screenX - 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  backPressed: { backgroundColor: Colors.gray50 },
  body: { paddingHorizontal: Spacing.screenX, paddingTop: 4, paddingBottom: 40 },
  title: { fontFamily: Fonts.wantedBold, fontSize: 22, lineHeight: 31, color: Colors.black },
  description: { fontFamily: Fonts.wantedRegular, fontSize: 14, lineHeight: 22, color: Colors.gray600, marginTop: 6 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.gray100, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: Colors.action },
  progressText: { fontFamily: Fonts.wantedSemiBold, fontSize: 13, color: Colors.gray500 },
});
