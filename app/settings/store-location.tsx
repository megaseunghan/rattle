import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { updateStoreLocation } from '../../lib/services/attendance';
import { searchKakaoPlaces } from '../../lib/services/kakaoLocal';

interface GeoResult {
  latitude: number;
  longitude: number;
  address: string;
}

export default function StoreLocationScreen() {
  const { store, refreshStore } = useAuth();
  const [geoResult, setGeoResult] = useState<GeoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasLocation = store?.latitude != null && store?.longitude != null;

  useEffect(() => {
    if (!store?.address) return;
    geocodeAddress(store.address);
  }, [store?.address]);

  async function geocodeAddress(address: string) {
    setLoading(true);
    try {
      const results = await searchKakaoPlaces(address);
      if (results.length === 0) {
        Alert.alert('주소 변환 실패', '매장 주소로 위치를 찾지 못했어요.\n매장 주소를 확인해주세요.');
        return;
      }
      const r = results[0];
      setGeoResult({
        latitude: r.latitude,
        longitude: r.longitude,
        address: r.road_address_name || r.address_name,
      });
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!geoResult || !store) return;

    Alert.alert(
      '위치 등록',
      `아래 주소로 출퇴근 기준 위치를 등록할까요?\n\n${geoResult.address}`,
      [
        { text: '아니오', style: 'cancel' },
        {
          text: '예',
          onPress: async () => {
            setSaving(true);
            try {
              await updateStoreLocation(store.id, geoResult.latitude, geoResult.longitude);
              await refreshStore();
              Alert.alert('완료', '매장 위치가 등록됐습니다.', [
                { text: '확인', onPress: () => router.back() },
              ]);
            } catch (e: any) {
              Alert.alert('저장 실패', e.message);
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>매장 위치 등록</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.infoCard}>
          <Ionicons name="location" size={28} color={Colors.primary} style={{ marginBottom: 10 }} />
          <Text style={styles.infoTitle}>출퇴근 GPS 기준점 등록</Text>
          <Text style={styles.infoDesc}>
            매장 주소를 기반으로 위치를 등록합니다.{'\n'}
            직원이 40m 이내에서 출퇴근을 찍을 수 있습니다.
          </Text>
        </View>

        {/* 매장 주소 */}
        <View style={styles.addressCard}>
          <Text style={styles.addressLabel}>등록된 매장 주소</Text>
          <Text style={styles.addressText}>
            {store?.address ?? '주소가 등록되어 있지 않습니다.'}
          </Text>
        </View>

        {/* 변환된 좌표 */}
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>주소 변환 중...</Text>
          </View>
        ) : geoResult ? (
          <View style={styles.coordCard}>
            <View style={styles.coordRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.coordLabel}>변환된 위치</Text>
            </View>
            <Text style={styles.coordAddr}>{geoResult.address}</Text>
            <Text style={styles.coordValues}>
              위도 {geoResult.latitude.toFixed(6)} · 경도 {geoResult.longitude.toFixed(6)}
            </Text>
          </View>
        ) : null}

        {/* 현재 등록된 위치 */}
        {hasLocation && (
          <View style={styles.currentCard}>
            <Ionicons name="location" size={14} color={Colors.gray400} />
            <Text style={styles.currentText}>
              현재 등록된 위치: {store!.latitude!.toFixed(5)}, {store!.longitude!.toFixed(5)}
            </Text>
          </View>
        )}

        {/* 등록 버튼 */}
        <TouchableOpacity
          style={[styles.btn, (!geoResult || saving) && styles.btnDisabled]}
          onPress={handleRegister}
          disabled={!geoResult || saving}
          activeOpacity={0.7}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <>
                <Ionicons name="location-outline" size={17} color={Colors.white} />
                <Text style={styles.btnText}>{hasLocation ? '위치 다시 등록' : '위치 등록'}</Text>
              </>
          }
        </TouchableOpacity>

        {!store?.address && (
          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={14} color={Colors.warning} />
            <Text style={styles.warningText}>매장 주소가 없습니다. TossPos 연동 설정에서 주소를 먼저 등록해주세요.</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },

  body: { padding: 16, gap: 12 },

  infoCard: { backgroundColor: Colors.tinted, borderRadius: 16, padding: 20, alignItems: 'center' },
  infoTitle: { fontSize: 14, fontWeight: '700', color: Colors.deeper, marginBottom: 6 },
  infoDesc: { fontSize: 13, color: Colors.dark, textAlign: 'center', lineHeight: 20 },

  addressCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100, padding: 14, gap: 4,
  },
  addressLabel: { fontSize: 11, color: Colors.gray400, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  addressText: { fontSize: 14, color: Colors.black, fontWeight: '500', lineHeight: 20 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  loadingText: { fontSize: 13, color: Colors.gray400 },

  coordCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100, padding: 14, gap: 4,
  },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coordLabel: { fontSize: 12, fontWeight: '600', color: Colors.success },
  coordAddr: { fontSize: 13, color: Colors.black, fontWeight: '500' },
  coordValues: { fontSize: 12, color: Colors.gray400 },

  currentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.gray100, borderRadius: 10, padding: 10,
  },
  currentText: { fontSize: 12, color: Colors.gray500, flex: 1 },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  warningRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.warning + '18', borderRadius: 10, padding: 12,
  },
  warningText: { flex: 1, fontSize: 12, color: Colors.warning, lineHeight: 18 },
});
