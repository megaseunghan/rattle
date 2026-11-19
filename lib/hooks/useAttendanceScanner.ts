import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Enrollment from '../services/attendanceScannerEnrollment';
import type { AttendanceScannerEnrollmentService, AttendanceScannerRegistration } from '../services/attendanceScannerEnrollment';
import type { AttendanceResult } from '../services/attendanceTransport';
import { getAttendanceScannerFailureState, isAttendanceScannerRevoked, type AttendancePunchResult } from '../services/attendanceScanner';
import { attendanceTime } from './attendanceTime';

/** The scanner never receives an app session or an employee credential. */
export interface ScannerUiService extends AttendanceScannerEnrollmentService {
  loadStoredAttendanceScannerRegistration(): Promise<AttendanceScannerRegistration | null>;
  scannerStatus(): Promise<AttendanceResult<AttendanceScannerRegistration>>;
  scan(qr: string, previousOutcome?: 'unknown'): Promise<AttendancePunchResult>;
}
const defaultService: ScannerUiService = Enrollment;
const waiting = () => ({ state: 'waiting', title: '', body: '', time: '' });
const feedbackStates = ['saved', 'registered', 'scanFailed', 'wrongQr', 'unknown'];
export function useAttendanceScanner(service: ScannerUiService = defaultService) {
  const mounted = useRef(false), busy = useRef(false);
  const registration = useRef<AttendanceScannerRegistration | null>(null);
  // Memory only. Resolving B or replacing a revoked scanner must never erase A.
  const unresolved = useRef(new Map<string, number>());
  const uncertainPairings = useRef(new Set<string>());
  const pairingUnknown = useRef(false);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [state, setState] = useState({ state: 'loading', title: '', body: '', time: '' });
  const holdingResult = useRef(false);
  useLayoutEffect(() => {
    holdingResult.current = feedbackStates.includes(state.state);
  }, [state]);
  function present(notice: typeof state) {
    holdingResult.current = feedbackStates.includes(notice.state);
    setState(notice);
  }
  const processed = useRef(new Set<string>());
  const revoked = useCallback(() => {
    registration.current = null;
    setState({ state: 'revoked', title: '등록이 해제됐어요', body: '관리자 앱의 새 등록 QR을 찍어주세요', time: '' });
  }, []);
  const remember = (qr: string) => {
    if (!unresolved.current.has(qr)) unresolved.current.set(qr, Date.now());
    setUnresolvedCount(unresolved.current.size);
  };
  const showUnknown = () => present({ state: 'unknown', title: '저장됐는지 확인하고 있어요', body: '같은 QR을 다시 보여주거나 다음 직원 QR을 스캔해주세요. 확인이 필요한 기록은 직원 휴대폰에서도 확인해주세요', time: '' });
  const refresh = useCallback(async () => {
    if (!mounted.current || busy.current) return;
    busy.current = true;
    try {
      const saved = await service.loadStoredAttendanceScannerRegistration();
      if (!mounted.current) return;
      if (!saved) {
        const alreadyUnregistered = !registration.current;
        registration.current = null;
        if (alreadyUnregistered && holdingResult.current) return;
        setState({ state: pairingUnknown.current ? 'unknownSetup' : 'unregistered', title: pairingUnknown.current ? '등록됐는지 확인하고 있어요' : '매장폰 등록이 필요해요', body: pairingUnknown.current ? '관리자 앱의 매장폰 목록을 확인해주세요. 없으면 새 QR로 다시 등록해주세요' : '사장님이나 점장님 앱에서 매장폰 등록 QR을 열어주세요', time: '' });
        return;
      }
      const status = await service.scannerStatus();
      if (!mounted.current) return;
      if (isAttendanceScannerRevoked(status)) revoked();
      else if (status.status === 'success') {
        registration.current = saved; pairingUnknown.current = false;
        setState(old => feedbackStates.includes(old.state) ? old : waiting());
      } else setState(old => old.state === 'unknown' ? old : { state: 'error', title: '매장폰을 확인하지 못했어요', body: '인터넷 연결을 확인한 뒤 다시 시도해주세요', time: '' });
    } catch { if (mounted.current) setState(old => old.state === 'unknown' ? old : { state: 'error', title: '매장폰을 확인하지 못했어요', body: '인터넷 연결을 확인한 뒤 다시 시도해주세요', time: '' }); }
    finally { busy.current = false; }
  }, [service, revoked]);
  useEffect(() => {
    mounted.current = true; void refresh();
    const listener = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active' && registration.current) void refresh(); }, 15000);
    return () => { mounted.current = false; registration.current = null; unresolved.current.clear(); clearInterval(timer); listener.remove(); };
  }, [refresh]);
  const scan = useCallback(async (qr: string, screenReader = false) => {
    if ((holdingResult.current && !screenReader) || !mounted.current || busy.current || pairingUnknown.current || AppState.currentState !== 'active') return;
    const isPunch = !!registration.current;
    // A registration QR can explain its purpose once in each mode, without a second exchange.
    const key = (isPunch ? 'registered:' : 'setup:') + qr;
    if (processed.current.has(key)) return;
    processed.current.add(key);
    busy.current = true;
    try {
      if (isPunch && qr.startsWith('rattle-scanner:v1.')) {
        present({ state: 'wrongQr', title: '이미 등록된 매장폰이에요', body: '직원 휴대폰의 출퇴근 QR을 보여주세요', time: '' });
        return;
      }
      if (!isPunch && qr.startsWith('rattle-punch:v1.')) {
        present({ state: 'wrongQr', title: '먼저 매장폰을 등록해주세요', body: '관리자 앱에서 매장폰 등록 QR을 열어주세요', time: '' });
        return;
      }
      if (!isPunch) {
        // Explicit recovery accepts a new QR, never re-exchanges an uncertain one.
        if (uncertainPairings.current.has(qr)) {
          present({ state: 'scanFailed', title: '새 등록 QR을 보여주세요', body: '이전 QR은 다시 사용할 수 없어요. 관리자 앱에서 새 QR을 받아주세요', time: '' }); return;
        }
        present({ state: 'pairing', title: '확인하고 있어요', body: '', time: '' });
        const result = await service.exchangeAndStoreAttendanceScannerPairingQr({ qr });
        if (!mounted.current) return;
        if (result.status === 'success') { registration.current = result.data; present({ state: 'registered', title: '매장폰을 등록했어요', body: '이제 직원 QR을 스캔해주세요', time: '' }); }
        else {
          pairingUnknown.current = result.status === 'unknown';
          if (pairingUnknown.current) uncertainPairings.current.add(qr);
          present({ state: pairingUnknown.current ? 'unknownSetup' : 'scanFailed', title: pairingUnknown.current ? '등록됐는지 확인하고 있어요' : '등록 QR을 확인하지 못했어요', body: pairingUnknown.current ? '관리자 앱의 매장폰 목록을 확인해주세요. 없으면 새 QR로 다시 등록해주세요' : '관리자 앱에서 등록 QR을 새로 열어주세요', time: '' });
        }
        return;
      }
      present({ state: 'processing', title: '확인하고 있어요', body: '', time: '' });
      const previousUnknown = unresolved.current.has(qr);
      const result = await service.scan(qr, previousUnknown ? 'unknown' : undefined);
      if (!mounted.current) return;
      if (result.status === 'saved') {
        unresolved.current.delete(qr); setUnresolvedCount(unresolved.current.size);
        present({ state: 'saved', title: `${result.data.employee_name}님, ${result.data.kind === 'clock_in' ? '출근했어요' : '퇴근했어요'}`, body: result.data.duplicate ? '이미 기록된 시각이에요' : '', time: attendanceTime(result.data.punched_at) });
      } else if (isAttendanceScannerRevoked(result) || getAttendanceScannerFailureState(result).revoked) {
        if (previousUnknown || getAttendanceScannerFailureState(result).outcomeUnknown) remember(qr);
        revoked();
      }
      else if (previousUnknown || result.status === 'unknown') { remember(qr); showUnknown(); }
      else present({ state: 'scanFailed', title: result.error.code === 'ATTENDANCE_QR_EXPIRED' ? '출퇴근 QR이 만료됐어요' : '출퇴근 QR을 확인하지 못했어요', body: '직원 휴대폰에서 출퇴근 QR을 새로 고친 뒤 다시 스캔해주세요', time: '' });
    } catch {
      if (!mounted.current) return;
      if (isPunch) { remember(qr); showUnknown(); }
      else {
        uncertainPairings.current.add(qr); pairingUnknown.current = true;
        present({ state: 'unknownSetup', title: '등록됐는지 확인하고 있어요', body: '관리자 앱의 매장폰 목록을 확인해주세요. 없으면 새 QR로 다시 등록해주세요', time: '' });
      }
    } finally {
      if (unresolved.current.has(qr) || pairingUnknown.current) processed.current.delete(key);
      busy.current = false;
    }
  }, [service, revoked]);
  /** Called only after the operator confirms the manager checked/revoked the old registration. */
  const confirmRegistrationRecovery = useCallback(async () => {
    if (!mounted.current || busy.current || !pairingUnknown.current) return;
    busy.current = true;
    try {
      const saved = await service.loadStoredAttendanceScannerRegistration();
      if (!mounted.current) return;
      if (saved) {
        const status = await service.scannerStatus();
        if (!mounted.current) return;
        if (isAttendanceScannerRevoked(status)) { pairingUnknown.current = false; revoked(); }
        else if (status.status === 'success') { registration.current = saved; pairingUnknown.current = false; setState(waiting()); }
        else setState({ state: 'unknownSetup', title: '등록됐는지 확인하고 있어요', body: '지금은 등록 상태를 불러올 수 없어요. 잠시 후 다시 확인해주세요', time: '' });
        return;
      }
      pairingUnknown.current = false;
      setState({ state: 'unregistered', title: '새 등록 QR을 찍어주세요', body: '관리자 앱에서 새로 받은 QR을 보여주세요', time: '' });
    } catch { if (mounted.current) setState({ state: 'unknownSetup', title: '등록됐는지 확인하고 있어요', body: '등록 상태를 불러오지 못했어요. 잠시 후 다시 확인해주세요', time: '' }); }
    finally { busy.current = false; }
  }, [service, revoked]);
  const clearNotice = useCallback(() => {
    holdingResult.current = false;
    setState(old => feedbackStates.includes(old.state) ? waiting() : old);
  }, []);
  return { ...state, notice: state, scan, refresh, clearNotice, confirmRegistrationRecovery, unresolvedCount, ready: !!registration.current,
    canScan: !['loading', 'processing', 'pairing', 'unknownSetup'].includes(state.state) };
}
