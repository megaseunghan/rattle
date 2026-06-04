import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { updateStoreLocation } from '../../lib/services/attendance';

export default function StoreLocationScreen() {
  const { store, refreshStore } = useAuth();
  const [gpsLoading, setGpsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Location.LocationGeocodedLocation[]>([]);
  const [searchedAddr, setSearchedAddr] = useState('');

  const hasLocation = store?.latitude != null && store?.longitude != null;

  async function handleSetCurrentLocation() {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '위치 권한이 필요합니다.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;

      Alert.alert(
        '현재 위치 등록',
        `위도 ${latitude.toFixed(6)}\n경도 ${longitude.toFixed(6)}\n\n이 위치를 매장 기준점으로 등록할까요?`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '등록',
            onPress: async () => {
              await updateStoreLocation(store!.id, latitude, longitude);
              await refreshStore();
              Alert.alert('완료', '매장 위치가 등록됐습니다.');
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setGpsLoading(false);
    }
  }

  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const results = await Location.geocodeAsync(query);
      if (results.length === 0) {
        Alert.alert('검색 결과 없음', '해당 주소를 찾을 수 없어요. 더 자세한 주소로 다시 시도해주세요.');
        return;
      }
      setSearchResults(results);
      setSearchedAddr(query);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSelectResult(result: Location.LocationGeocodedLocation, index: number) {
    const { latitude, longitude } = result;
    Alert.alert(
      '위치 등록',
      `위도 ${latitude.toFixed(6)}\n경도 ${longitude.toFixed(6)}\n\n이 위치를 매장 기준점으로 등록할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '등록',
          onPress: async () => {
            await updateStoreLocation(store!.id, latitude, longitude);
            await refreshStore();
            setSearchResults([]);
            setSearchQuery('');
            Alert.alert('완료', '매장 위치가 등록됐습니다.');
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* 안내 */}
          <View style={styles.infoCard}>
            <Ionicons name="location" size={28} color={Colors.primary} style={{ marginBottom: 10 }} />
            <Text style={styles.infoTitle}>출퇴근 GPS 기준점</Text>
            <Text style={styles.infoDesc}>
              직원이 출퇴근을 찍을 때 이 위치에서{'\n'}40m 이내인지 확인합니다.
            </Text>
          </View>

          {/* 등록된 위치 */}
          {hasLocation && (
            <View style={styles.currentCard}>
              <View style={styles.currentRow}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.currentLabel}>현재 등록된 위치</Text>
              </View>
              <Text style={styles.coordText}>위도 {store!.latitude!.toFixed(6)}</Text>
              <Text style={styles.coordText}>경도 {store!.longitude!.toFixed(6)}</Text>
            </View>
          )}

          {/* 현재 위치로 등록 */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>현재 위치로 등록</Text>
            <TouchableOpacity
              style={[styles.gpsBtn, gpsLoading && { opacity: 0.5 }]}
              onPress={handleSetCurrentLocation}
              disabled={gpsLoading}
              activeOpacity={0.7}
            >
              {gpsLoading
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <><Ionicons name="locate-outline" size={17} color={Colors.white} /><Text style={styles.gpsBtnText}>현재 위치 사용</Text></>
              }
            </TouchableOpacity>
          </View>

          {/* 주소 검색 */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>주소 검색</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="예: 서울시 강남구 테헤란로 152"
                placeholderTextColor={Colors.gray300}
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity
                style={[styles.searchBtn, searchLoading && { opacity: 0.5 }]}
                onPress={handleSearch}
                disabled={searchLoading}
                activeOpacity={0.7}
              >
                {searchLoading
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Ionicons name="search" size={17} color={Colors.white} />
                }
              </TouchableOpacity>
            </View>

            {searchResults.length > 0 && (
              <View style={styles.resultCard}>
                <Text style={styles.resultHeader}>"{searchedAddr}" 검색 결과</Text>
                {searchResults.map((r, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.resultRow, i < searchResults.length - 1 && styles.resultBorder]}
                    onPress={() => handleSelectResult(r, i)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="location-outline" size={16} color={Colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultCoord}>위도 {r.latitude.toFixed(6)} · 경도 {r.longitude.toFixed(6)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={Colors.gray300} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
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

  scroll: { padding: 16, gap: 16, paddingBottom: 48 },

  infoCard: { backgroundColor: Colors.tinted, borderRadius: 16, padding: 20, alignItems: 'center' },
  infoTitle: { fontSize: 14, fontWeight: '700', color: Colors.deeper, marginBottom: 6 },
  infoDesc: { fontSize: 13, color: Colors.dark, textAlign: 'center', lineHeight: 20 },

  currentCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100, padding: 14, gap: 3,
  },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  currentLabel: { fontSize: 12, fontWeight: '600', color: Colors.success },
  coordText: { fontSize: 12, color: Colors.gray500 },

  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5 },

  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13,
  },
  gpsBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
    color: Colors.black, backgroundColor: Colors.white,
  },
  searchBtn: {
    width: 46, borderRadius: 12, backgroundColor: Colors.black,
    justifyContent: 'center', alignItems: 'center',
  },

  resultCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100, overflow: 'hidden',
  },
  resultHeader: { fontSize: 11, color: Colors.gray400, padding: 12, paddingBottom: 8 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  resultBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  resultCoord: { fontSize: 13, color: Colors.black },
});
