/* design-system: DESIGN.md — 저장 결과를 알 수 없을 때 해당 월 매입 목록을 위에 열어 확인한다(A안, 서버 자동 조회 없음) */
import { ActivityIndicator, FlatList, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import type { Purchase } from '../../../types';
import { PurchaseAppBar, won } from './PurchaseUi';

export function PurchaseMonthCheck({ visible, monthLabel, purchases, loading, error, onRetry, onClose, onClosed }: {
  visible: boolean; monthLabel: string; purchases: Purchase[]; loading: boolean; error: string | null;
  onRetry: () => void; onClose: () => void;
  /** 모달이 완전히 닫힌 뒤. 그때 다음 확인 팝업을 띄운다. */
  onClosed: () => void;
}) {
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}
    onDismiss={Platform.OS === 'ios' ? onClosed : undefined}>
    <SafeAreaView style={styles.screen}>
      <PurchaseAppBar title="매입" onBack={onClose} />
      <Text style={styles.month}>{monthLabel}</Text>
      {loading && !purchases.length ? <ActivityIndicator style={styles.center} color={Colors.primary} />
        : error ? <View style={styles.center}>
          <Text style={styles.empty}>매입 내역을 불러오지 못했어요.</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={onRetry}><Text style={styles.retryText}>다시 불러오기</Text></TouchableOpacity>
        </View>
        : <FlatList data={purchases} keyExtractor={item => item.id} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>이 달 매입이 없어요.</Text>}
          renderItem={({ item, index }) => <View style={[styles.row, index > 0 && styles.line]}>
            <Text style={styles.date}>{item.date.slice(5).replace('-', '.')}</Text>
            <Text numberOfLines={1} style={styles.name}>{item.supplier || '거래처 없음'}</Text>
            <Text style={styles.amount}>{won(item.amount)}원</Text>
          </View>} />}
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.homeCanvas },
  month: { fontFamily: Fonts.wantedBold, fontSize: 15, color: Colors.black, paddingHorizontal: 20, paddingVertical: 8 },
  list: { marginHorizontal: 16, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, paddingHorizontal: 16 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { borderTopWidth: 1, borderTopColor: Colors.hairline },
  date: { width: 44, fontFamily: Fonts.geistSemiBold, fontVariant: ['tabular-nums'], fontSize: 14, color: Colors.gray600 },
  name: { flex: 1, fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.black },
  amount: { fontFamily: Fonts.geistSemiBold, fontVariant: ['tabular-nums'], fontSize: 15, color: Colors.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: Fonts.wantedRegular, fontSize: 14, color: Colors.gray500, paddingVertical: 20, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  retryText: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.action },
});
