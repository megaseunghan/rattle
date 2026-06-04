import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Marker, Region } from 'react-native-maps';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { updateStoreLocation } from '../../lib/services/attendance';
import { searchKakaoPlaces, reverseGeocode, KakaoPlace } from '../../lib/services/kakaoLocal';

const SEOUL = { latitude: 37.5665, longitude: 126.9780 };
const DELTA  = { latitudeDelta: 0.003, longitudeDelta: 0.003 };

export default function StoreLocationScreen() {
  const { store, refreshStore } = useAuth();

  const initialCoord = store?.latitude != null
    ? { latitude: store.latitude, longitude: store.longitude! }
    : SEOUL;

  const [pin, setPin] = useState(initialCoord);
  const [address, setAddress] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KakaoPlace[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<MapView>(null);

  const moveToCoord = useCallback(async (lat: number, lng: number) => {
    setPin({ latitude: lat, longitude: lng });
    mapRef.current?.animateToRegion({
      latitude: lat, longitude: lng, ...DELTA,
    }, 400);
    const addr = await reverseGeocode(lat, lng);
    setAddress(addr);
  }, []);

  async function handleGps() {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('권한 필요', '위치 권한이 필요합니다.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await moveToCoord(loc.coords.latitude, loc.coords.longitude);
      setResults([]);
      setQuery('');
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setGpsLoading(false);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setSearchLoading(true);
    setResults([]);
    try {
      const list = await searchKakaoPlaces(q);
      if (list.length === 0) {
        Alert.alert('검색 결과 없음', '다른 검색어로 다시 시도해보세요.');
        return;
      }
      setResults(list);
    } catch (e: any) {
      Alert.alert('검색 오류', e.message);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSelectPlace(place: KakaoPlace) {
    setResults([]);
    setQuery('');
    await moveToCoord(place.latitude, place.longitude);
  }

  async function handleDragEnd(e: any) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPin({ latitude, longitude });
    const addr = await reverseGeocode(latitude, longitude);
    setAddress(addr);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateStoreLocation(store!.id, pin.latitude, pin.longitude);
      await refreshStore();
      Alert.alert('완료', '매장 위치가 저장됐습니다.', [
        { text: '확인', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  const hasLocation = store?.latitude != null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>매장 위치 등록</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.7}
        >
          {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveBtnText}>저장</Text>}
        </TouchableOpacity>
      </View>

      {/* 검색바 */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.gray400} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="도로명, 동읍면, 건물명 검색"
            placeholderTextColor={Colors.gray300}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          {searchLoading
            ? <ActivityIndicator size="small" color={Colors.gray400} />
            : <TouchableOpacity onPress={handleSearch} activeOpacity={0.7}>
                <Text style={styles.searchBtnText}>검색</Text>
              </TouchableOpacity>
          }
        </View>

        {/* 검색 결과 */}
        {results.length > 0 && (
          <View style={styles.resultList}>
            <FlatList
              data={results}
              keyExtractor={(_, i) => String(i)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[styles.resultItem, index < results.length - 1 && styles.resultBorder]}
                  onPress={() => handleSelectPlace(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location-outline" size={15} color={Colors.primary} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.placeName} numberOfLines={1}>{item.place_name}</Text>
                    {item.road_address_name
                      ? <Text style={styles.placeAddr} numberOfLines={1}>{item.road_address_name}</Text>
                      : <Text style={styles.placeAddr} numberOfLines={1}>{item.address_name}</Text>
                    }
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </KeyboardAvoidingView>

      {/* 지도 */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{ ...initialCoord, ...DELTA }}
        >
          <Marker
            coordinate={pin}
            draggable
            onDragEnd={handleDragEnd}
            pinColor={Colors.primary}
          />
        </MapView>

        {/* 현재 위치 버튼 */}
        <TouchableOpacity
          style={[styles.gpsBtn, gpsLoading && { opacity: 0.5 }]}
          onPress={handleGps}
          disabled={gpsLoading}
          activeOpacity={0.7}
        >
          {gpsLoading
            ? <ActivityIndicator size="small" color={Colors.black} />
            : <Ionicons name="locate-outline" size={20} color={Colors.black} />
          }
        </TouchableOpacity>

        {/* 좌표/주소 정보 */}
        <View style={styles.coordBadge}>
          <Ionicons name="location" size={13} color={Colors.primary} />
          <Text style={styles.coordText} numberOfLines={1}>
            {address || `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}
          </Text>
        </View>
      </View>

      {/* 안내 */}
      <View style={styles.hint}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.gray400} />
        <Text style={styles.hintText}>핀을 드래그하거나 검색해서 위치를 조정하세요. 저장 후 40m 이내에서 출퇴근이 가능합니다.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 7,
  },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
    backgroundColor: Colors.white,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.black, paddingVertical: 4 },
  searchBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  resultList: {
    backgroundColor: Colors.white, maxHeight: 220,
    borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  resultItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  resultBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  placeName: { fontSize: 13, fontWeight: '600', color: Colors.black },
  placeAddr: { fontSize: 12, color: Colors.gray400, marginTop: 2 },

  mapWrap: { flex: 1, position: 'relative' },
  map: { flex: 1 },

  gpsBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },

  coordBadge: {
    position: 'absolute', bottom: 14, left: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  coordText: { flex: 1, fontSize: 13, color: Colors.black, fontWeight: '500' },

  hint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.gray50, borderTopWidth: 0.5, borderTopColor: Colors.gray100,
  },
  hintText: { flex: 1, fontSize: 12, color: Colors.gray400, lineHeight: 18 },
});
