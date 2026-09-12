import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, Switch, TextInput,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { getErrorMessage } from '../../lib/utils/error';
import { searchKakaoPlaces, reverseGeocode, KakaoPlace } from '../../lib/services/kakaoLocal';
import { updateStoreAttendanceSettings } from '../../lib/services/attendance';
import KakaoMap, { KakaoMapRef } from '../../lib/components/KakaoMap';
import { AppBar, Button, Field } from '../../lib/components/ui';

const DEFAULT_LAT = 37.5665; // 좌표 없는 매장의 초기 지도 중심 (서울시청)
const DEFAULT_LNG = 126.9780;
const MIN_RADIUS = 20;
const MAX_RADIUS = 200;

export default function StoreInfoScreen() {
  const { store, refreshStore } = useAuth();
  const mapRef = useRef<KakaoMapRef>(null);
  const keyboard = useAnimatedKeyboard();
  const keyboardSpacerStyle = useAnimatedStyle(() => ({ height: keyboard.height.value }));

  const [name, setName] = useState(store?.name ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [addressQuery, setAddressQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KakaoPlace[]>([]);
  const [coords, setCoords] = useState({
    lat: store?.latitude ?? DEFAULT_LAT,
    lng: store?.longitude ?? DEFAULT_LNG,
  });
  const [radiusM, setRadiusM] = useState(store?.attendance_radius_m ?? 40);
  const [blockOutside, setBlockOutside] = useState(store?.attendance_block_outside ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!store) return;
    setName(store.name ?? '');
    setAddress(store.address ?? '');
    setCoords({ lat: store.latitude ?? DEFAULT_LAT, lng: store.longitude ?? DEFAULT_LNG });
    setRadiusM(store.attendance_radius_m ?? 40);
    setBlockOutside(store.attendance_block_outside ?? true);
  }, [store?.id]);

  function movePin(lat: number, lng: number) {
    setCoords({ lat, lng });
    mapRef.current?.moveToCoord(lat, lng);
    reverseGeocode(lat, lng).then(addr => { if (addr) setAddress(addr); });
  }

  async function handleAddressSearch() {
    const query = addressQuery.trim();
    if (!query) return;
    setSearching(true);
    try {
      const results = await searchKakaoPlaces(query);
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('검색 결과 없음', '다른 주소나 상호명으로 다시 검색해주세요.');
      }
    } catch (e: unknown) {
      Alert.alert('검색 실패', getErrorMessage(e));
    } finally {
      setSearching(false);
    }
  }

  function handleSelectResult(place: KakaoPlace) {
    const addressLabel = place.road_address_name || place.address_name;
    Alert.alert(
      '기준점을 변경할까요?',
      `"${place.place_name}"\n${addressLabel}\n\n이 위치로 출퇴근 GPS 기준점을 옮깁니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '변경',
          onPress: () => {
            setAddress(addressLabel);
            movePin(place.latitude, place.longitude);
            setAddressQuery('');
            setSearchResults([]);
          },
        },
      ],
    );
  }

  async function handleUseCurrentLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '위치 권한이 필요합니다.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      movePin(loc.coords.latitude, loc.coords.longitude);
    } catch (e: unknown) {
      Alert.alert('위치 확인 실패', getErrorMessage(e));
    }
  }

  async function handleSave() {
    if (!store) return;
    if (!name.trim()) { Alert.alert('입력 오류', '매장 이름을 입력해주세요.'); return; }

    setSaving(true);
    try {
      await updateStoreAttendanceSettings(store.id, {
        name: name.trim(),
        address: address.trim() || null,
        latitude: coords.lat,
        longitude: coords.lng,
        radiusM: Math.round(radiusM),
        blockOutside,
      });
      await refreshStore();
      Alert.alert('저장 완료', '매장 정보가 저장되었습니다.');
    } catch (e: unknown) {
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="매장 정보" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="매장명" value={name} onChangeText={setName} placeholder="매장 이름" />

        <TouchableOpacity style={styles.settlementRow} onPress={() => router.push('/settings/sales')} activeOpacity={0.7}>
          <View style={styles.settlementLeft}>
            <Text style={styles.fieldLabel}>일 정산 시간</Text>
            <Text style={styles.settlementValue}>
              매일 {(store?.closing_time as string | undefined)?.slice(0, 5) ?? '23:00'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
        </TouchableOpacity>

        <View style={styles.mapSection}>
          <Text style={styles.sectionTitle}>출퇴근 GPS 기준점</Text>
          <Text style={styles.sectionDesc}>여기서 정한 기준점과 허용 반경 안에서만 출퇴근을 기록할 수 있어요</Text>

          <View style={styles.mapWrap}>
            <KakaoMap
              ref={mapRef}
              initialLat={coords.lat}
              initialLng={coords.lng}
              radiusM={radiusM}
              onPinMoved={movePin}
            />
            <TouchableOpacity style={styles.locateBtn} onPress={handleUseCurrentLocation} activeOpacity={0.8}>
              <Ionicons name="locate" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={16} color={Colors.gray500} />
            <TextInput
              style={styles.addressInput}
              value={addressQuery}
              onChangeText={setAddressQuery}
              placeholder={address || '주소 또는 상호명 검색'}
              placeholderTextColor={Colors.gray400}
              onSubmitEditing={handleAddressSearch}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={handleAddressSearch} disabled={searching} hitSlop={8}>
              {searching
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={styles.searchLink}>검색</Text>}
            </TouchableOpacity>
          </View>

          {searchResults.length > 0 && (
            <View style={styles.resultList}>
              {searchResults.map((place, i) => (
                <TouchableOpacity
                  key={`${place.address_name}-${i}`}
                  style={[styles.resultItem, i > 0 && styles.resultItemBorder]}
                  onPress={() => handleSelectResult(place)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resultPlaceName} numberOfLines={1}>{place.place_name}</Text>
                  <Text style={styles.resultAddress} numberOfLines={1}>
                    {place.road_address_name || place.address_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.hintText}>지도를 눌러 기준점을 옮기거나, 우측 상단 버튼으로 현재 위치를 기준점으로 잡을 수 있어요</Text>

          <View style={styles.radiusHeader}>
            <Text style={styles.fieldLabel}>허용 반경</Text>
            <Text style={styles.radiusValue}>{Math.round(radiusM)}m</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={MIN_RADIUS}
            maximumValue={MAX_RADIUS}
            step={5}
            value={radiusM}
            onValueChange={setRadiusM}
            minimumTrackTintColor={Colors.primary}
            maximumTrackTintColor={Colors.gray200}
            thumbTintColor={Colors.primary}
          />
          <View style={styles.radiusScaleRow}>
            <Text style={styles.radiusScaleText}>{MIN_RADIUS}m</Text>
            <Text style={styles.radiusScaleText}>100m</Text>
            <Text style={styles.radiusScaleText}>{MAX_RADIUS}m</Text>
          </View>

          <Text style={styles.sectionTitle}>출퇴근 규칙</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleTitle}>반경 밖에서 출근 차단</Text>
              <Text style={styles.toggleDesc}>밖에서 누르면 출근 버튼이 비활성화돼요</Text>
            </View>
            <Switch
              value={blockOutside}
              onValueChange={setBlockOutside}
              trackColor={{ false: Colors.gray200, true: Colors.primary }}
              thumbColor={Colors.white}
            />
          </View>
        </View>

        <View style={styles.saveButtonWrap}>
          <Button label={saving ? '저장 중...' : '저장하기'} variant="primary" onPress={handleSave} loading={saving} />
        </View>

        {/* 키보드 높이에 프레임 단위로 맞춰 늘어나는 스페이서 — 네이티브 키보드 애니메이션과 그대로 동기화됨 */}
        <Animated.View style={keyboardSpacerStyle} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: Spacing.fieldGap },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },

  settlementRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
  },
  settlementLeft: { gap: 4 },
  settlementValue: { fontSize: 14, fontWeight: '600', color: Colors.black },

  mapSection: { gap: 10, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray600, marginTop: 8 },
  sectionDesc: { fontSize: 12, fontWeight: '400', color: Colors.gray400, lineHeight: 17, marginTop: -6 },

  mapWrap: { height: 220, borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: Colors.gray100 },
  locateBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },

  addressRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4,
  },
  addressInput: {
    flex: 1, fontSize: 14, fontWeight: '600', color: Colors.black,
    paddingVertical: 13, paddingHorizontal: 0,
  },
  searchLink: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  hintText: { fontSize: 11, fontWeight: '400', color: Colors.gray400, lineHeight: 16, marginTop: -4 },

  resultList: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 14, overflow: 'hidden',
  },
  resultItem: { paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  resultItemBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  resultPlaceName: { fontSize: 14, fontWeight: '600', color: Colors.black },
  resultAddress: { fontSize: 12, fontWeight: '400', color: Colors.gray400 },

  radiusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  radiusValue: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  slider: { width: '100%', height: 32 },
  radiusScaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  radiusScaleText: { fontSize: 11, fontWeight: '400', color: Colors.gray400 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray100,
    borderRadius: 14, padding: 14,
  },
  toggleTextWrap: { flex: 1, gap: 3, marginRight: 12 },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: Colors.black },
  toggleDesc: { fontSize: 11, fontWeight: '400', color: Colors.gray400 },

  saveButtonWrap: { marginTop: 8 },
});
