const API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY ?? '';
const BASE = 'https://dapi.kakao.com';

export interface KakaoPlace {
  place_name: string;
  road_address_name: string;
  address_name: string;
  latitude: number;
  longitude: number;
}

async function kakaoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `KakaoAK ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`카카오 API 오류 (${res.status})`);
  return res.json();
}

/** 주소 검색 (도로명 + 지번) */
async function searchByAddress(query: string): Promise<KakaoPlace[]> {
  const data = await kakaoGet<any>(
    `/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=10`,
  );
  return (data.documents ?? []).map((d: any) => ({
    place_name: d.road_address?.address_name ?? d.address_name,
    road_address_name: d.road_address?.address_name ?? '',
    address_name: d.address_name,
    latitude: Number(d.y),
    longitude: Number(d.x),
  }));
}

/** 키워드 검색 (동읍면, 상호명 등) */
async function searchByKeyword(query: string): Promise<KakaoPlace[]> {
  const data = await kakaoGet<any>(
    `/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=10`,
  );
  return (data.documents ?? []).map((d: any) => ({
    place_name: d.place_name,
    road_address_name: d.road_address_name ?? '',
    address_name: d.address_name,
    latitude: Number(d.y),
    longitude: Number(d.x),
  }));
}

/** 주소 + 키워드 통합 검색 (중복 제거) */
export async function searchKakaoPlaces(query: string): Promise<KakaoPlace[]> {
  const [addrResults, keyResults] = await Promise.allSettled([
    searchByAddress(query),
    searchByKeyword(query),
  ]);

  const addr = addrResults.status === 'fulfilled' ? addrResults.value : [];
  const key  = keyResults.status  === 'fulfilled' ? keyResults.value  : [];

  // 주소 기준 중복 제거
  const seen = new Set<string>();
  return [...addr, ...key].filter(p => {
    const k = `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 좌표 → 주소 역지오코딩 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const data = await kakaoGet<any>(
      `/v2/local/geo/coord2address.json?x=${lng}&y=${lat}&input_coord=WGS84`,
    );
    const doc = data.documents?.[0];
    return doc?.road_address?.address_name ?? doc?.address?.address_name ?? '';
  } catch {
    return '';
  }
}
