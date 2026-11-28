import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { StoreFillPatch } from '../../../types';
import { getStoreFill, updateStoreFill, type StoreFillState } from '../../services/stores';
import { getIndustrialAccidentIndustries } from '../../services/industrialAccident';
import { invalidateStoreData, queryClient, queryKeys, useQueryScope } from '../../query';
import { STALE_TIME } from '../../query/staleTimes';
import { useAuth } from '../../contexts/AuthContext';

export const STORE_FILL_DOMAIN = 'store-fill';
/** 4대보험·산재 업종이 바뀌면 손익 사업주 부담 추정이 달라진다. */
const INSURANCE_DOMAINS = ['financial'];

/** 매장 관리자(사장·점장)인지, 그중 사장님인지. 미리보기 중이면 관리자가 아니다. */
export function useStoreFillRole(storeId: string | null): { isManager: boolean; canEdit: boolean } {
  const { store, user, currentRole } = useAuth();
  const current = !!storeId && store?.id === storeId;
  const isManager = current && currentRole === 'admin';
  return { isManager, canEdit: isManager && !!user && store?.owner_id === user.id };
}

/** 홈 유도와 마저 채우기 화면이 같은 캐시를 쓴다. 저장 응답으로 바로 갱신한다. */
export function useStoreFill(storeId: string | null, enabled: boolean) {
  const scope = useQueryScope();
  const queryKey = useMemo(() => queryKeys.store(scope, storeId ?? '', STORE_FILL_DOMAIN), [scope, storeId]);
  const query = useQuery({
    queryKey,
    queryFn: () => getStoreFill(storeId as string),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.config,
  }, queryClient);

  const save = useCallback(async (patch: StoreFillPatch): Promise<StoreFillState> => {
    if (!storeId) throw new Error('Store fill without store');
    const next = await updateStoreFill(storeId, patch);
    await queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.setQueryData(queryKey, next);
    const touchesInsurance = 'social_insurance_enrolled' in patch || 'industrial_accident_industry' in patch;
    // 저장은 이미 끝났다. 다른 화면 갱신 실패로 저장 실패처럼 보이지 않게 한다.
    if (touchesInsurance) void invalidateStoreData(storeId, INSURANCE_DOMAINS).catch(() => {});
    return next;
  }, [storeId, queryKey]);

  return { query, save };
}

export function useIndustrialAccidentIndustries(enabled: boolean) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.store(scope, '', 'industrial-accident-industries'),
    queryFn: getIndustrialAccidentIndustries,
    enabled,
    staleTime: STALE_TIME.config,
  }, queryClient);
}
