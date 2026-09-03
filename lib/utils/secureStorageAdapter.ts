import * as SecureStore from 'expo-secure-store';

/**
 * Supabase auth 세션(access/refresh token)을 OS 레벨 암호화 저장소(iOS Keychain / Android Keystore)에
 * 저장하기 위한 어댑터. AsyncStorage는 평문 저장이라 세션 토큰 보관에 부적합하다 (CWE-312).
 *
 * SecureStore는 값 하나당 크기 제한(iOS ~2048byte)이 있어 세션 JSON이 넘칠 수 있으므로,
 * 제한을 넘는 값은 여러 청크로 쪼개 저장하고 읽을 때 재조합한다.
 */
const CHUNK_SIZE = 1800; // SecureStore 제한(2048B)보다 여유 있게 설정
const CHUNK_COUNT_SUFFIX = '_chunks';

function chunkKey(key: string, index: number): string {
  return `${key}_${index}`;
}

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX);
    if (countRaw == null) {
      // 청크 없이 단일 값으로 저장된 경우 (하위 호환)
      return SecureStore.getItemAsync(key);
    }
    const count = Number(countRaw);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part == null) return null; // 청크 유실 시 손상된 값으로 취급
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await secureStorageAdapter.removeItem(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));
    await SecureStore.setItemAsync(key + CHUNK_COUNT_SUFFIX, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX);
    if (countRaw != null) {
      const count = Number(countRaw);
      await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i))));
      await SecureStore.deleteItemAsync(key + CHUNK_COUNT_SUFFIX);
    }
    await SecureStore.deleteItemAsync(key);
  },
};
