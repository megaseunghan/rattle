import { supabase } from '../supabase';

/** 산재보험 업종 목록(industrial_accident_industries, 20261127123000). 로그인 사용자는 읽기만 한다. */
export interface IndustrialAccidentIndustry {
  code: string;
  name: string;
  sort_order: number;
}

export async function getIndustrialAccidentIndustries(): Promise<IndustrialAccidentIndustry[]> {
  const { data, error } = await supabase.from('industrial_accident_industries')
    .select('code, name, sort_order').order('sort_order', { ascending: true }).order('code', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as IndustrialAccidentIndustry[];
}
