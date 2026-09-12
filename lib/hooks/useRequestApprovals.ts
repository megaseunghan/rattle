import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPendingScheduleRequests, reviewScheduleRequest } from '../services/schedule';
import { getPendingCorrections, reviewCorrection } from '../services/attendanceCorrections';
import { AttendanceCorrection, ScheduleRequest } from '../../types';

/** 사장님용 — 스케줄 변경/근태 정정 요청 승인함 (화면 21의 메뉴 "요청함") */
export function useRequestApprovals() {
  const { store } = useAuth();
  const [scheduleRequests, setScheduleRequests] = useState<(ScheduleRequest & { employee_name: string })[]>([]);
  const [corrections, setCorrections] = useState<(AttendanceCorrection & { employee_name: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const [sched, corr] = await Promise.all([
        getPendingScheduleRequests(store.id),
        getPendingCorrections(store.id),
      ]);
      setScheduleRequests(sched);
      setCorrections(corr);
    } finally {
      setLoading(false);
    }
  }, [store]);

  const reviewSchedule = useCallback(async (request: ScheduleRequest, approve: boolean) => {
    setReviewingId(request.id);
    try {
      await reviewScheduleRequest(request, approve);
      setScheduleRequests(prev => prev.filter(r => r.id !== request.id));
    } finally {
      setReviewingId(null);
    }
  }, []);

  const reviewAttendanceCorrection = useCallback(async (correction: AttendanceCorrection, approve: boolean) => {
    setReviewingId(correction.id);
    try {
      await reviewCorrection(correction, approve);
      setCorrections(prev => prev.filter(c => c.id !== correction.id));
    } finally {
      setReviewingId(null);
    }
  }, []);

  const totalPending = scheduleRequests.length + corrections.length;

  return {
    scheduleRequests, corrections, loading, reviewingId, totalPending,
    refetch, reviewSchedule, reviewAttendanceCorrection,
  };
}
