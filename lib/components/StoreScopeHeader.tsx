import { SheetModal } from './ui/SheetModal';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Colors } from '../../constants/colors';

export function StoreScopeHeader({ name, onPress }: { name: string; onPress: () => void }) {
  return <SafeAreaView edges={['top']} style={styles.header}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`현재 매장 ${name}, 매장 변경`} style={styles.scopeButton}>
      <Ionicons name="storefront-outline" size={18} color={Colors.deeper} />
      <Text numberOfLines={1} style={styles.scopeName}>{name}</Text>
      <Ionicons name="chevron-down" size={16} color={Colors.gray600} />
    </Pressable>
  </SafeAreaView>;
}

export function StoreScopePicker({ visible, stores, selectedId, allSelected, allowAll, required, busy, error, onSelect, onAll, onClose }: {
  visible: boolean; stores: { id: string; name: string }[]; selectedId?: string; allSelected: boolean;
  allowAll: boolean; required: boolean; busy: boolean; error: string | null;
  onSelect: (id: string) => void; onAll: () => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const matches = stores.filter(store => store.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  function close() { if (!busy) { setSearch(''); onClose(); } }
  return <SheetModal visible={visible} onRequestClose={close}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="매장 선택 취소" disabled={busy} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.titleRow}><Text style={styles.title}>매장 선택</Text><Pressable style={styles.close} onPress={close} disabled={busy} accessibilityLabel="매장 선택 닫기"><Ionicons name="close" size={22} color={Colors.gray600} /></Pressable></View>
        <Text style={styles.hint}>{required ? '이 업무를 진행할 매장을 먼저 선택해 주세요.' : '현재 화면에서 확인할 매장을 선택해 주세요.'}</Text>
        <TextInput accessibilityLabel="매장 검색" placeholder="매장 이름 검색" value={search} onChangeText={setSearch} style={styles.search} editable={!busy} autoCorrect={false} />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {busy && <View style={styles.loading}><ActivityIndicator color={Colors.primary} /><Text style={styles.hint}>매장을 바꾸는 중이에요</Text></View>}
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
          {allowAll && !required && !search.trim() && <Pressable style={styles.row} disabled={busy} onPress={() => { setSearch(''); onAll(); }} accessibilityRole="button" accessibilityState={{ selected: allSelected }}><Text style={styles.rowName}>전체 매장</Text>{allSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.deeper} />}</Pressable>}
          {matches.map(store => <Pressable key={store.id} style={styles.row} disabled={busy} onPress={() => onSelect(store.id)} accessibilityRole="button" accessibilityState={{ selected: !allSelected && selectedId === store.id }}><Text style={styles.rowName}>{store.name}</Text>{!allSelected && selectedId === store.id && <Ionicons name="checkmark-circle" size={22} color={Colors.deeper} />}</Pressable>)}
          {matches.length === 0 && <Text style={styles.empty}>검색 결과가 없어요</Text>}
        </ScrollView>
      </SafeAreaView>
    </View>
  </SheetModal>;
}

const styles = StyleSheet.create({
  header: { backgroundColor: Colors.glass.background }, scopeButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginHorizontal: 20 }, scopeName: { flex: 1, color: Colors.black, fontSize: 15, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: Colors.overlaySheet, justifyContent: 'flex-end' }, sheet: { maxHeight: '80%', backgroundColor: Colors.homeCanvas, paddingHorizontal: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 20, fontWeight: '700', color: Colors.black }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, hint: { color: Colors.gray600, fontSize: 13, lineHeight: 20 },
  search: { minHeight: 48, borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 14, marginVertical: 12, color: Colors.black }, list: { flexGrow: 0 }, row: { minHeight: 54, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray200 }, rowName: { flex: 1, fontSize: 16, color: Colors.black, fontWeight: '600' }, empty: { padding: 24, color: Colors.gray600, textAlign: 'center' }, error: { color: Colors.danger, fontSize: 14, marginBottom: 10 }, loading: { flexDirection: 'row', gap: 10, paddingBottom: 12 },
});
