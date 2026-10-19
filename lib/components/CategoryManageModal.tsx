import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { animateListChange } from '../utils/layoutAnimation';
import { getErrorMessage } from '../utils/error';

interface CategoryManageModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  removeConfirmHint: string; // 카테고리 삭제 확인 문구 (예: "해당 카테고리의 재료는 '기타'로 이동해요.")
  categories: string[];
  loading: boolean;
  add: (name: string) => Promise<void>;
  rename: (oldName: string, newName: string) => Promise<void>;
  remove?: (name: string) => Promise<void>;
  noun?: string;
}

/** 매장별 카테고리(재고/매입 등)를 추가·이름변경·삭제하는 공용 모달 */
export function CategoryManageModal({
  visible, onClose, title, removeConfirmHint,
  categories, loading, add, rename, remove, noun = '카테고리',
}: CategoryManageModalProps) {
  const [newName, setNewName] = useState('');
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [saving, setSaving] = useState(false);
  const renameInFlight = useRef(false);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    if (categories.includes(name)) { Alert.alert('중복', '이미 있는 카테고리예요.'); return; }
    setSaving(true);
    try {
      animateListChange();
      await add(name);
      setNewName('');
    } catch (e: unknown) {
      Alert.alert('추가 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function openRename(name: string) {
    setRenameTarget(name);
    setRenameValue(name);
  }

  async function handleRename() {
    if (!renameTarget || renameInFlight.current) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget) { setRenameTarget(null); return; }
    renameInFlight.current = true;
    setSaving(true);
    try {
      await rename(renameTarget, name);
      setRenameTarget(null);
    } catch (e: unknown) {
      Alert.alert('수정 실패', getErrorMessage(e));
    } finally {
      renameInFlight.current = false;
      setSaving(false);
    }
  }

  function handleRemove(name: string) {
    if (!remove) return;
    Alert.alert('카테고리 삭제', `"${name}" 카테고리를 삭제할까요?\n${removeConfirmHint}`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          try {
            animateListChange();
            await remove(name);
          } catch (e: unknown) {
            Alert.alert('삭제 실패', getErrorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetHeaderTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Text style={styles.sheetDoneText}>완료</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.categoryListCard}>
              {categories.map((c, i) => (
                <View key={c} style={[styles.categoryRow, i > 0 && styles.categoryRowBorder]}>
                  {renameTarget === c ? (
                    <TextInput
                      style={styles.categoryRenameInput}
                      value={renameValue}
                      onChangeText={setRenameValue}
                      onSubmitEditing={handleRename}
                      autoFocus
                    />
                  ) : (
                    <Text style={styles.categoryRowText}>{c}</Text>
                  )}
                  <View style={styles.categoryRowActions}>
                    <TouchableOpacity onPress={() => renameTarget === c ? handleRename() : openRename(c)} hitSlop={8} disabled={saving}
                      accessibilityRole="button" accessibilityLabel={`${c} ${renameTarget === c ? '이름 저장' : '이름 변경'}`}>
                      <Ionicons name={renameTarget === c ? 'checkmark' : 'create-outline'} size={18} color={Colors.gray400} />
                    </TouchableOpacity>
                    {remove && <TouchableOpacity onPress={() => handleRemove(c)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={Colors.gray400} />
                    </TouchableOpacity>}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.categoryAddRow}>
            <TextInput
              style={styles.categoryAddInput}
              value={newName}
              onChangeText={setNewName}
              placeholder={`새 ${noun} 이름`}
              placeholderTextColor={Colors.gray400}
              onSubmitEditing={handleAdd}
            />
            <TouchableOpacity style={styles.categoryAddBtn} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="add" size={20} color={Colors.white} />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  sheetHeaderTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },
  sheetDoneText: { fontSize: 15, fontWeight: '700', color: Colors.primary },

  categoryListCard: { backgroundColor: Colors.gray50, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.gray100, overflow: 'hidden' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  categoryRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  categoryRowText: { fontSize: 15, color: Colors.black, flex: 1 },
  categoryRenameInput: { fontSize: 15, color: Colors.black, flex: 1, padding: 0 },
  categoryRowActions: { flexDirection: 'row', gap: 16 },
  categoryAddRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  categoryAddInput: {
    flex: 1, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.black,
  },
  categoryAddBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
});
