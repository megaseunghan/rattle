import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { callOcrEdgeFunction } from '../../lib/services/ocr';
import { Colors } from '../../constants/colors';
import { useOrders } from '../../lib/hooks/useOrders';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { OrderCard } from '../../lib/components/OrderCard';

export default function OrdersScreen() {
  const { data, loading, loadingMore, hasMore, loadMore, error, refetch, deliver, remove } = useOrders();
  const [scanning, setScanning] = useState(false);
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  async function handleScanReceipt() {
    Alert.alert('납품서 스캔', '이미지를 어떻게 가져올까요?', [
      {
        text: '카메라로 촬영',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('권한 필요', '카메라 권한이 필요합니다. 설정에서 허용해주세요.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
          if (!result.canceled && result.assets[0].base64) {
            await processImages([{ uri: result.assets[0].uri, base64: result.assets[0].base64 }]);
          }
        },
      },
      {
        text: '앨범에서 선택',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('권한 필요', '사진 접근 권한이 필요합니다. 설정에서 허용해주세요.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            base64: true,
            quality: 0.8,
            allowsMultipleSelection: true,
          });
          if (!result.canceled && result.assets.length > 0) {
            const assets = result.assets.filter(a => a.base64) as Array<{ uri: string; base64: string }>;
            if (assets.length > 0) await processImages(assets);
          }
        },
      },
      { text: '취소', style: 'cancel' },
    ]);
  }

  async function processImages(assets: Array<{ uri: string; base64: string }>) {
    setScanning(true);
    try {
      const allItems: unknown[] = [];
      for (const asset of assets) {
        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        const ocrText = await callOcrEdgeFunction(manipulated.base64!);
        const parsed = JSON.parse(ocrText);
        if (Array.isArray(parsed)) allItems.push(...parsed);
      }
      router.push({
        pathname: '/orders/ocr-review',
        params: { imageUri: assets[0].uri, ocrText: JSON.stringify(allItems) },
      });
    } catch (e: any) {
      Alert.alert('OCR 오류', e.message);
    } finally {
      setScanning(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>발주</Text>
          {data.length > 0 && <Text style={styles.subtitle}>{data.length}건</Text>}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
            onPress={handleScanReceipt}
            disabled={scanning}
          >
            {scanning
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="camera-outline" size={18} color={Colors.primary} />
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/orders/new')}>
            <Ionicons name="add" size={16} color={Colors.white} />
            <Text style={styles.addText}>새 발주</Text>
          </TouchableOpacity>
        </View>
      </View>

      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="document-text-outline" size={28} color={Colors.gray400} />
          </View>
          <Text style={styles.emptyText}>발주 내역이 없어요</Text>
          <Text style={styles.emptySubtext}>
            새 발주를 등록하면{'\n'}재고가 자동으로 관리돼요
          </Text>
          <TouchableOpacity style={styles.emptyAction} onPress={() => router.push('/orders/new')}>
            <Text style={styles.emptyActionText}>발주 등록하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <OrderCard order={item} onDeliver={deliver} onDelete={remove} />
          )}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.black, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.gray400, marginTop: 2 },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.tinted,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonDisabled: { opacity: 0.5 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  addText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  listContent: { padding: 16 },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyText: { fontSize: 17, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  emptySubtext: {
    fontSize: 14,
    color: Colors.gray400,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  emptyAction: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyActionText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
