import AsyncStorage from '@react-native-async-storage/async-storage';

/** 이전 버전의 금액 캐시만 정리하고 인증·다른 사용자 설정은 보존한다. */
export async function clearLegacyPosCache(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith('pos_summaries_'));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
