/* design-system: DESIGN.md 「매장 만들기·마저 채우기·직원 합류 시안 확정 · 2026-11-27」 — 합류 승인: 줄 + 아래 시트(급여·세금·수습·계좌), 아래 버튼 거절 / 최종 합류. */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../icons/AppIcon';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Radius, Spacing, Type } from '../../constants/designTokens';
import { draftFromProfile, type OnboardingDraft } from '../utils/joinOnboarding';
import { getErrorMessage } from '../utils/error';
import { koreanDate } from '../utils/regularWages';
import { revealAccountNumber } from '../services/accountNumbers';
import type { JoinOnboardingProfile, JoinOnboardingReview, JoinProbationReview, MemberApprovalCandidate, MemberApprovalChoice, Store, StoreMember } from '../../types';
import { formatDuration, formatKoreanDate } from './pickers';
import { InfoRow, RowGroup } from './join/InfoRows';
import { GrayNotice } from './join/GrayNotice';
import { choiceTitle, EMPLOYMENT_CHOICES, INCOME_CHOICES, WEEKLY_REST_CHOICES } from './join/ChoiceList';
import { ApprovalSheets, type ApprovalSheetKey } from './join/ApprovalSheets';
import { RehireCandidates } from './join/RehireCandidates';
import {
  accountText, adminDraftError, adminWageError, amountOf, buildApprovalReview, defaultProbation, minimumWageMessage,
  moneyText, probationText, wageCheckDate,
} from './join/approvalValues';

interface Props {
  member: StoreMember;
  candidates: MemberApprovalCandidate[];
  busy: boolean;
  profile?: JoinOnboardingProfile | null;
  /** 매장 기본 수습 기간·비율(수습 시트의 첫 값) */
  storeDefaults?: Pick<Store, 'default_probation_months' | 'default_probation_rate'> | null;
  onChoose: (choice: MemberApprovalChoice, review?: JoinOnboardingReview) => void;
  onReject?: () => void;
  onClose: () => void;
}

/** 이전 화면의 함수 이름을 유지한다(다른 곳에서 쓰지 않으면 지워도 된다). */
export { adminWageError as getAdminJoinWageError };

export function MemberApprovalModal({ member, candidates, busy, onChoose, onReject, onClose, profile, storeDefaults }: Props) {
  const hasApplicantRecord = candidates.some(e => e.is_applicant_account);
  const retiredOnly = candidates.some(e => !e.is_active) && !candidates.some(e => e.is_active);
  const [preserve, setPreserve] = useState<{ memberId: string; employeeId: string; historyId: string } | null>(null);
  const canPreserve = (e: MemberApprovalCandidate) => !e.is_active && !e.has_other_account && (!hasApplicantRecord || e.is_applicant_account)
    && e.wage_condition_valid === true && !!e.wage_history_id && !!e.existing_wage;
  const preserved = candidates.find(e => canPreserve(e) && preserve?.memberId === member.id && e.id === preserve?.employeeId && e.wage_history_id === preserve?.historyId);
  const [draft, setDraft] = useState<OnboardingDraft>(() => draftFromProfile(profile));
  const [touched, setTouched] = useState({ incomeType: false, weeklyRest: false });
  const [probationChoice, setProbationChoice] = useState<JoinProbationReview | null>(null);
  const [sheet, setSheet] = useState<ApprovalSheetKey | null>(null);
  const [accountNote, setAccountNote] = useState<string | null>(null);
  // 암호화된 계좌번호를 푸는 동안에는 '계좌번호를 확인해주세요'로 잘못 안내하지 않고 기다린다.
  const [accountLoading, setAccountLoading] = useState(() => !!profile?.account_number?.startsWith('enc:'));
  const storeMonths = storeDefaults?.default_probation_months ?? null;
  const storeRate = storeDefaults?.default_probation_rate ?? null;
  // 관리자가 수습을 정하기 전에는 매장 기본 기간·비율을 따른다(입사일이 바뀌면 다시 계산).
  const probation = probationChoice ?? defaultProbation(draft.joinedAt, storeMonths, storeRate);
  // 같은 이름·연락처의 재직 직원에 연결되면 그 직원의 수습·계약을 매장 기본값으로 덮지 않는다.
  // 관리자가 직접 고르지 않은 항목은 리뷰에서 빼서 보내고(서버는 키가 없으면 기존 값을 유지), 화면에는 '지금 조건 그대로'로 보인다.
  const linksExisting = candidates.some(e => e.is_active);
  const keepProbation = linksExisting && probationChoice == null;
  const keepIncome = linksExisting && !touched.incomeType && profile?.income_type == null;

  useEffect(() => {
    if (!profile?.account_number?.startsWith('enc:')) return;
    let alive = true;
    setAccountLoading(true);
    revealAccountNumber('join_profile', member.id)
      .then(number => {
        if (!alive) return;
        if (number) setDraft(d => (d.accountNumber ? d : { ...d, accountNumber: number }));
        else setAccountNote('제출한 계좌번호를 확인하지 못했어요. 직원에게 확인해 다시 입력해 주세요.');
      })
      .catch(e => { if (alive) setAccountNote(getErrorMessage(e, '계좌번호를 불러오지 못했어요. 다시 열어 주세요.')); })
      .finally(() => { if (alive) setAccountLoading(false); });
    return () => { alive = false; };
  }, [member.id, profile?.account_number]);

  const wageError = adminWageError(draft);
  const draftError = adminDraftError(draft);
  const cannotApprove = busy || !!preserved || !!draftError || accountLoading;

  function updateDraft(patch: Partial<OnboardingDraft>, field?: 'incomeType' | 'weeklyRest') {
    setDraft(current => ({ ...current, ...patch }));
    if (field) setTouched(current => ({ ...current, [field]: true }));
    // 입사일이 바뀌면 수습 마지막 날 범위도 바뀌므로 매장 기본으로 다시 계산한다.
    if (patch.joinedAt !== undefined && patch.joinedAt !== draft.joinedAt) setProbationChoice(null);
  }
  function choose(choice: MemberApprovalChoice) {
    if (busy) return;
    if (preserved && choice.kind === 'rehire' && choice.employeeId === preserved.id) {
      onChoose(choice, { preserve_existing_wage: true, wage_history_id: preserved.wage_history_id! }); return;
    }
    if (cannotApprove) return;
    try {
      const { is_probation, probation_ends_on, probation_rate, income_type, ...rest } = buildApprovalReview(draft, probation);
      onChoose(choice, { ...rest,
        ...(keepProbation ? {} : { is_probation, probation_ends_on, probation_rate }),
        ...(keepIncome ? {} : { income_type }) });
    }
    catch (e) { Alert.alert('입력 확인', getErrorMessage(e, '입력한 내용을 다시 확인해 주세요.')); }
  }

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!busy) onClose(); }}>
    {/* 모달은 별도 창이라 바깥 SafeAreaProvider 값을 받지 못한다. 안에서 다시 재야 닫기 버튼이 상태 표시줄을 피한다. */}
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView style={styles.page} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" disabled={busy} onPress={onClose} style={styles.back}>
          <AppIcon name="chevron-back" size={24} color={Colors.black} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">합류 전 정보 확인</Text>
        <Applicant member={member} />
        {!profile && !preserved && <Text style={styles.body}>근무 정보가 아직 없어요. 직원에게 확인한 내용을 입력해주세요.</Text>}
        {preserved ? <Text style={styles.body}>기존 직원 정보와 급여 조건을 유지하고 계정만 연결해요. 새 내용을 적용하려면 기존 급여 선택을 해제해주세요.</Text>
          : <ApprovalRows keepProbation={keepProbation} keepIncome={keepIncome} incomeAsked={profile?.income_type != null} draft={draft} touched={touched} hasProfile={!!profile} wageError={wageError} probation={probation} storeRate={storeRate}
            disabled={busy} onOpen={setSheet} />}
        {!preserved && !!accountNote && <GrayNotice message={accountNote} />}
        {candidates.length > 0 && !preserved && !retiredOnly && <Text style={styles.body}>기존 직원에 연결하면 현재 조건은 위 내용으로 바뀌고, 급여 조건 이력은 오늘부터 추가돼요. 이미 작성된 급여 내역은 유지돼요.</Text>}
        {retiredOnly && <RehireCandidates candidates={candidates} busy={busy} cannotApprove={cannotApprove} hasApplicantRecord={hasApplicantRecord}
          preservedId={preserved?.id ?? null} canPreserve={canPreserve}
          onTogglePreserve={e => setPreserve(preserved?.id === e.id ? null : { memberId: member.id, employeeId: e.id, historyId: e.wage_history_id! })}
          onRehire={employeeId => choose({ kind: 'rehire', employeeId })} onNew={() => choose({ kind: 'new' })} />}
      </ScrollView>
      <View style={styles.bottom}>
        {!preserved && accountLoading ? <Text style={styles.hint}>계좌번호를 불러오는 중이에요.</Text>
          : !preserved && !!draftError && !wageError && <Text style={styles.hint}>{draftError}</Text>}
        <View style={styles.buttons}>
          {onReject && <Pressable accessibilityRole="button" disabled={busy} onPress={onReject} style={({ pressed }) => [styles.cta, styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>거절</Text>
          </Pressable>}
          {!retiredOnly && <Pressable accessibilityRole="button" accessibilityLabel="최종 합류" accessibilityState={{ disabled: cannotApprove }} disabled={cannotApprove}
            onPress={() => choose({ kind: 'auto' })} style={({ pressed }) => [styles.cta, styles.primary, cannotApprove && styles.disabled, pressed && styles.pressed]}>
            <Text style={[styles.primaryText, cannotApprove && styles.disabledText]}>최종 합류</Text>
          </Pressable>}
        </View>
      </View>
      <ApprovalSheets sheet={sheet} draft={draft} probation={probation} storeMonths={storeMonths} storeRate={storeRate}
        onDraft={updateDraft} onProbation={setProbationChoice} onClose={() => setSheet(null)} />
    </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

function Applicant({ member }: { member: StoreMember }) {
  const name = member.applicant_name ?? member.user_email ?? '신청자';
  const applied = member.created_at ? `${formatKoreanDate(String(member.created_at).slice(0, 10), { weekday: false })} 신청` : '';
  return <View style={styles.who}>
    <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1)}</Text></View>
    <View style={styles.whoText}>
      <Text style={styles.whoName}>{name}</Text>
      <Text style={styles.whoSub}>{[member.phone, applied].filter(Boolean).join(' · ')}</Text>
    </View>
  </View>;
}

const KEEP_EXISTING = '지금 조건 그대로';
const CHOSEN_TAG = '직원이 고름';
const UNSURE_TAG = '직원이 잘 모르겠대요';

function ApprovalRows({ draft, touched, hasProfile, incomeAsked, keepProbation, keepIncome, wageError, probation, storeRate, disabled, onOpen }: {
  /** 재직 직원에 연결되고 관리자가 아직 고르지 않아 기존 값을 그대로 두는 항목 */
  keepProbation: boolean; keepIncome: boolean;
  draft: OnboardingDraft; touched: { incomeType: boolean; weeklyRest: boolean }; hasProfile: boolean;
  /** 신청에서 계약을 물었는지(이전 앱 신청은 묻지 않았다) */
  incomeAsked: boolean; wageError: string;
  probation: JoinProbationReview; storeRate: number | null; disabled: boolean; onOpen: (sheet: ApprovalSheetKey) => void;
}) {
  const part = draft.employmentType === 'part_time';
  const notSet = '아직 안 정했어요';
  const restIncluded = draft.weeklyRest === 'included' ? true : draft.weeklyRest === 'separate' ? false : null;
  const minimum = useMemo(() => minimumWageMessage({ isPart: part, hourly: amountOf(draft.hourlyWage), monthly: amountOf(draft.baseSalary),
    weeklyMinutes: draft.weeklyMinutes, weeklyRestIncluded: restIncluded }, wageCheckDate(draft.joinedAt, koreanDate())),
  [part, draft.hourlyWage, draft.baseSalary, draft.weeklyMinutes, restIncluded, draft.joinedAt]);
  const incomeUnknown = !draft.incomeType || draft.incomeType === 'unknown';
  // 이전 앱 신청은 계약을 묻지 않았으니 '직원이 고름'으로 보이지 않는다.
  const incomeTag = touched.incomeType || !hasProfile || !incomeAsked ? undefined : draft.incomeType === 'unknown' ? UNSURE_TAG : CHOSEN_TAG;
  const restTag = touched.weeklyRest || !hasProfile || !draft.weeklyRest ? undefined : draft.weeklyRest === 'unknown' ? UNSURE_TAG : CHOSEN_TAG;
  const row = (label: string, value: string, sheet: ApprovalSheetKey, extra: { tag?: string; numeric?: boolean; ask?: boolean } = {}) =>
    <InfoRow label={label} value={value || notSet} tone={extra.ask ? 'ask' : value ? 'normal' : 'none'} tag={extra.tag} tagTone={extra.tag === CHOSEN_TAG ? 'chosen' : 'unsure'}
      numeric={extra.numeric && !!value} disabled={disabled} onPress={() => onOpen(sheet)} />;
  return <>
    <RowGroup title="급여">
      {row('근무 형태', choiceTitle(EMPLOYMENT_CHOICES, draft.employmentType), 'emp')}
      {part ? <>
        {row('시급', moneyText(draft.hourlyWage), 'wage', { numeric: true })}
        {!!wageError && <Text accessibilityRole="alert" style={styles.error}>{wageError}</Text>}
        {!!minimum && <GrayNotice message={minimum} />}
        {row('주휴수당', draft.weeklyRest === 'unknown' ? '' : choiceTitle(WEEKLY_REST_CHOICES, draft.weeklyRest), 'wk', { tag: restTag })}
        {row('주 근무시간', formatDuration(draft.weeklyMinutes), 'hours', { numeric: true })}
      </> : <>
        {row('월 기본급', moneyText(draft.baseSalary), 'salary', { numeric: true })}
        {!!wageError && <Text accessibilityRole="alert" style={styles.error}>{wageError}</Text>}
        {!!minimum && <GrayNotice message={minimum} />}
        {row('월 비과세 금액', moneyText(draft.nonTaxable || '0'), 'salary', { numeric: true })}
      </>}
      {row('입사일', draft.joinedAt ? formatKoreanDate(draft.joinedAt) : '', 'joined')}
    </RowGroup>
    <RowGroup title="세금">
      {row('계약', keepIncome ? KEEP_EXISTING : incomeUnknown ? '정해 주세요' : choiceTitle(INCOME_CHOICES, draft.incomeType), 'inc', { tag: keepIncome ? undefined : incomeTag, ask: !keepIncome && incomeUnknown })}
    </RowGroup>
    <RowGroup title="수습">{row('수습 적용', keepProbation ? KEEP_EXISTING : probationText(probation, storeRate), 'prob')}</RowGroup>
    <RowGroup title="계좌">{row('급여 계좌', accountText(draft.bankName, draft.accountNumber), 'acct', { numeric: false })}</RowGroup>
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.white },
  top: { paddingHorizontal: 8, minHeight: 48, justifyContent: 'center' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.screenX, paddingBottom: 32 },
  title: { fontFamily: Fonts.wantedBold, fontSize: 24, lineHeight: 32, color: Colors.black },
  body: { marginTop: 12, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 20, color: Colors.gray600 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, color: Colors.gray700 },
  whoText: { flex: 1 },
  whoName: { fontFamily: Fonts.wantedBold, fontSize: Type.lg, color: Colors.black },
  whoSub: { marginTop: 2, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray500 },
  error: { marginTop: 6, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 20, color: Colors.negative },
  bottom: { paddingHorizontal: Spacing.screenX, paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray200, backgroundColor: Colors.white },
  hint: { marginBottom: 10, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 20, color: Colors.gray600 },
  buttons: { flexDirection: 'row', gap: 8 },
  cta: { flex: 1, minHeight: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 2, backgroundColor: Colors.action },
  secondary: { backgroundColor: Colors.chipBg },
  pressed: { opacity: 0.85 },
  disabled: { backgroundColor: Colors.gray200 },
  primaryText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, color: Colors.white },
  disabledText: { color: Colors.gray500 },
  secondaryText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, color: Colors.gray700 },
});
