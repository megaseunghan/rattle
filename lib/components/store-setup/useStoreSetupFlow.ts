/**
 * 매장 만들기 흐름 상태: 기기 임시 저장 초안, 질문 위치, 고치기, 제출(시도당 요청 ID 하나).
 * 답은 '다음'·뒤로·화면을 떠날 때 기기에 저장해 뒤로 가거나 다시 열어도 남는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { PosSetupChoice } from '../../../types';
import { createStoreWithSetup, StoreSetupNotCreatedError } from '../../services/stores';
import { getErrorMessage } from '../../utils/error';
import { useQuestionSteps } from '../question-flow';
import {
  STORE_SETUP_QUESTIONS, canAnswer, emptyDraft, isComplete, parseDraft, restoredStep, toCreateInput, type StoreSetupDraft,
} from './draft';

const LAST = STORE_SETUP_QUESTIONS.length - 1;

export interface CreatedStore { id: string; name: string; choice: PosSetupChoice }

export function useStoreSetupFlow({ userId, knownRequestIds, canWrite, onCancel }: {
  userId: string; knownRequestIds: readonly string[]; canWrite: () => boolean; onCancel: () => void;
}) {
  const key = `store-setup:v1:${userId}`;
  const [draft, setDraft] = useState<StoreSetupDraft>(() => emptyDraft(Crypto.randomUUID()));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedStore | null>(null);
  const steps = useQuestionSteps(STORE_SETUP_QUESTIONS.length);
  const saving = useRef(false);
  const completed = useRef(false);
  const latest = useRef(draft);
  latest.current = draft;
  const editSnapshot = useRef<StoreSetupDraft | null>(null);
  const persist = useCallback((value: StoreSetupDraft) => AsyncStorage.setItem(key, JSON.stringify(value)), [key]);

  useRestoreDraft(key, knownRequestIds, value => { setDraft(value); steps.dispatch({ type: 'jump', index: restoredStep(value) }); }, setReady);
  useEffect(() => () => {
    // 이름만 쓰고 닫아도 다음에 이어 쓸 수 있게 남긴다. 만든 뒤에는 남기지 않는다.
    if (!completed.current) void AsyncStorage.setItem(key, JSON.stringify(latest.current)).catch(() => {});
  }, [key]);

  const change = useCallback((update: Partial<StoreSetupDraft> | ((value: StoreSetupDraft) => StoreSetupDraft)) => {
    setDraft(value => typeof update === 'function' ? update(value) : { ...value, ...update });
    setError(null);
  }, []);

  async function finish() {
    if (!canWrite() || saving.current || !isComplete(draft)) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      const submitted: StoreSetupDraft = { ...draft, step: LAST, submitted: true };
      await persist(submitted);
      setDraft(submitted);
      if (!canWrite()) return;
      const store = await createStoreWithSetup(toCreateInput(submitted));
      completed.current = true;
      await AsyncStorage.removeItem(key).catch(() => { /* 남아도 knownRequestIds로 다시 쓰지 않는다. */ });
      setCreated({ id: store.id, name: store.name || submitted.name.trim(), choice: store.pos_setup_choice ?? 'later' });
    } catch (e) {
      if (e instanceof StoreSetupNotCreatedError) {
        // 서버가 넣기 전에 거절했으니 만들어진 매장이 없다. 잠금을 풀고 새 요청 ID로 고쳐서 다시 보낸다.
        const reopened: StoreSetupDraft = { ...latest.current, submitted: false, requestId: Crypto.randomUUID() };
        setDraft(reopened);
        void persist(reopened).catch(() => {});
      }
      setError(getErrorMessage(e, '매장을 만들지 못했어요. 다시 시도해 주세요.'));
    } finally { saving.current = false; setBusy(false); }
  }

  async function next() {
    if (saving.current || !ready || busy) return;
    if (!canAnswer(STORE_SETUP_QUESTIONS[steps.activeIndex], draft)) return;
    if (steps.isLast) { await finish(); return; }
    const snapshot = { ...draft, step: steps.editing != null ? steps.current : steps.current + 1 };
    saving.current = true; setBusy(true);
    try {
      await persist(snapshot);
      setDraft(snapshot); setError(null);
      editSnapshot.current = null;
      Keyboard.dismiss();
      steps.dispatch({ type: 'advance' });
    } catch { setError('입력 내용을 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { saving.current = false; setBusy(false); }
  }

  function edit(index: number) {
    if (busy || draft.submitted || index >= steps.current) return;
    const base = steps.editing != null && editSnapshot.current
      && !canAnswer(STORE_SETUP_QUESTIONS[steps.editing], draft) ? editSnapshot.current : draft;
    if (base !== draft) setDraft(base);
    editSnapshot.current = base;
    setError(null);
    steps.dispatch({ type: 'edit', index });
  }

  function back() {
    if (busy) return;
    setError(null);
    if (steps.editing != null) {
      // 고치던 것을 접는다. 고치기 전 값으로 되돌린다.
      if (editSnapshot.current) setDraft(editSnapshot.current);
      editSnapshot.current = null;
      steps.dispatch({ type: 'back' });
      return;
    }
    if (draft.submitted || steps.current === 0) { void persist(draft).catch(() => {}); onCancel(); return; }
    const previous = { ...draft, step: steps.current - 1 };
    setDraft(previous);
    void persist(previous).catch(() => {});
    Keyboard.dismiss();
    steps.dispatch({ type: 'back' });
  }

  return { draft, ready, busy, error, created, steps, change, next, back, edit };
}

function useRestoreDraft(key: string, knownRequestIds: readonly string[], restore: (value: StoreSetupDraft) => void, setReady: (ready: boolean) => void) {
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const known = useRef(knownRequestIds);
  known.current = knownRequestIds;
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key).then(raw => {
      if (!alive || !raw) return;
      let value: StoreSetupDraft | null = null;
      try { value = parseDraft(JSON.parse(raw)); } catch { /* 잘못된 초안은 새로 시작한다. */ }
      if (!value) return;
      // 이미 만들어진 매장의 초안은 새 매장에 다시 쓰지 않는다(정리 실패로 남았을 때).
      if (known.current.includes(value.requestId)) { void AsyncStorage.removeItem(key).catch(() => {}); return; }
      restoreRef.current(value);
    }).catch(() => { /* 읽지 못하면 새로 시작한다. */ }).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [key, setReady]);
}
