import { HomeWorkflow } from '../../types';
import { supabase } from '../supabase';
import { invalidateCachedStore } from './cacheInvalidation';
import { isHomeWorkflow } from '../utils/homeWorkflow';

export function homeWorkflowLoadMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'Invalid home workflow') {
    return '저장된 홈 설정 형식을 확인해야 해요. 관리자에게 문의해 주세요.';
  }
  if (error instanceof Error && /network request failed|failed to fetch|networkerror/i.test(error.message)) {
    return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  }
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
  if (status === 401 || status === 403) return '로그인 상태를 확인한 뒤 다시 시도해 주세요.';
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  if (typeof code === 'string' && /^[A-Z0-9_]{3,12}$/.test(code)) {
    return `홈 설정을 불러오지 못했어요 (${code}). 다시 시도해 주세요.`;
  }
  return '홈 설정을 불러오지 못했어요. 다시 시도해 주세요.';
}

export async function getHomeWorkflow(storeId: string): Promise<HomeWorkflow | null> {
  const { data, error } = await supabase.from('store_home_workflows').select('configuration').eq('store_id', storeId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (!isHomeWorkflow(data.configuration)) throw new Error('Invalid home workflow');
  return data.configuration;
}
export async function saveHomeWorkflow(storeId: string, configuration: HomeWorkflow): Promise<void> {
  if (!isHomeWorkflow(configuration)) throw new Error('Invalid home workflow');
  const { error } = await supabase.from('store_home_workflows').upsert({ store_id: storeId, configuration }, { onConflict: 'store_id' });
  if (error) throw error;
  await invalidateCachedStore(storeId, ['home-workflow']);
}
