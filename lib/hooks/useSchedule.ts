import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getEmployeeSchedule, getMyPendingScheduleRequest, submitScheduleRequest,
} from '../services/schedule';
import { EmployeeSchedule, ScheduleDayInput, ScheduleRequest } from '../../types';

export function useSchedule(employeeId: string | undefined) {
  const { store } = useAuth();
  const [schedule, setSchedule] = useState<EmployeeSchedule[]>([]);
  const [pendingRequest, setPendingRequest] = useState<ScheduleRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refetch = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const [sched, pending] = await Promise.all([
        getEmployeeSchedule(employeeId),
        getMyPendingScheduleRequest(employeeId),
      ]);
      setSchedule(sched);
      setPendingRequest(pending);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  const submit = useCallback(async (days: ScheduleDayInput[]) => {
    if (!store || !employeeId) return;
    setSubmitting(true);
    try {
      const request = await submitScheduleRequest(store.id, employeeId, days);
      setPendingRequest(request);
    } finally {
      setSubmitting(false);
    }
  }, [store, employeeId]);

  return { schedule, pendingRequest, loading, submitting, refetch, submit };
}
