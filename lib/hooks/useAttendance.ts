import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import {
  clockIn, clockOut, getTodayAttendance,
  calcDistanceM, isWithinRadius,
} from '../services/attendance';
import { Attendance } from '../../types';

export function useAttendance(employeeId: string) {
  const { store } = useAuth();
  const [todayRecords, setTodayRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const records = await getTodayAttendance(store.id, employeeId);
      setTodayRecords(records);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store, employeeId]);

  const stamp = useCallback(async (type: 'clock_in' | 'clock_out'): Promise<{
    success: boolean;
    distanceM?: number;
    withinRadius?: boolean;
    message?: string;
  }> => {
    if (!store) return { success: false, message: '매장 정보가 없습니다' };
    if (store.latitude == null || store.longitude == null) {
      return { success: false, message: '매장 위치가 등록되어 있지 않습니다. 설정에서 위치를 등록해주세요.' };
    }

    setActionLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return { success: false, message: '위치 권한이 필요합니다' };
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const distanceM = calcDistanceM(
        loc.coords.latitude, loc.coords.longitude,
        store.latitude!, store.longitude!,
      );

      if (!isWithinRadius(distanceM)) {
        return { success: false, distanceM: Math.round(distanceM), withinRadius: false, message: `매장에서 ${Math.round(distanceM)}m 떨어져 있어요. 40m 이내에서만 가능합니다.` };
      }

      const fn = type === 'clock_in' ? clockIn : clockOut;
      const record = await fn(store.id, employeeId, loc.coords.latitude, loc.coords.longitude, distanceM);
      setTodayRecords(prev => [...prev, record]);
      return { success: true, distanceM: Math.round(distanceM), withinRadius: true };
    } catch (e: any) {
      return { success: false, message: e.message };
    } finally {
      setActionLoading(false);
    }
  }, [store, employeeId]);

  const lastRecord = todayRecords[todayRecords.length - 1];
  const isClockedIn = lastRecord?.type === 'clock_in';

  return { todayRecords, loading, actionLoading, error, refetch, stamp, isClockedIn, lastRecord };
}
