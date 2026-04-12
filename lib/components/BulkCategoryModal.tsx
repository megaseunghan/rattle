import { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

interface BulkCategoryModalProps {
  visible: boolean;
  items: { id: string; name: string }[];
  categories: string[];
  onConfirm: (ids: string[], category: string) => Promise<void>;
  onClose: () => void;
}

export function BulkCategoryModal({ visible, items, categories, onConfirm, onClose }: BulkCategoryModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetCategory, setTargetCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set(items.map(i => i.id)));
      setTargetCategory('');
      setNewCategory('');
    }
  }, [visible]);

  const isCustom = targetCategory === '__new__';
  const finalCategory = isCustom ? newCategory.trim() : targetCategory;
  const canConfirm = selectedIds.size > 0 && finalCategory.length > 0 && !saving;

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(prev =>
      prev.size === items.length ? new Set() : new Set(items.map(i => i.id))
    );
  }

  async function handleConfirm() {
    if (!canConfirm) return;
    setSaving(true);
    try {
      await onConfirm(Array.from(selectedIds), finalCategory);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.gray600} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>미분류 일괄 수정</Text>
            <Text style={styles.headerCount}>{items.length}개 항목</Text>
          </View>
          <TouchableOpacity onPress={toggleAll} style={styles.selectAllBtn}>
            <Text style={styles.selectAllText}>
              {selectedIds.size === items.length ? '전체 해제' : '전체 선택'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>적용할 카테고리</Text>
          <View style={styles.categoryGrid}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, targetCategory === cat && styles.catChipActive]}
                onPress={() => setTargetCategory(cat)}
              >
                <Text style={[styles.catChipText, targetCategory === cat && styles.catChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.catChip, isCustom && styles.catChipActive]}
              onPress={() => setTargetCategory('__new__')}
            >
              <Text style={[styles.catChipText, isCustom && styles.catChipTextActive]}>
                + 새 카테고리
              </Text>
            </TouchableOpacity>
          </View>

          {isCustom && (
            <TextInput
              style={styles.newCatInput}
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder="새 카테고리 이름"
              placeholderTextColor={Colors.gray400}
              autoFocus
            />
          )}

          <Text style={styles.sectionLabel}>수정할 항목 선택</Text>
          {items.map(item => {
            const checked = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.itemRow, checked && styles.itemRowChecked]}
                onPress={() => toggleItem(item.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && <Ionicons name="checkmark" size={13} color={Colors.white} />}
                </View>
                <Text style={[styles.itemName, checked && styles.itemNameChecked]} numberOfLines={1}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm}
          >
            {saving
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={styles.confirmBtnText}>
                  {selectedIds.size}개에 "{finalCategory || '카테고리 선택'}" 적용
                </Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.gray100, justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { alignItems: 'center', gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.black },
  headerCount: { fontSize: 12, color: Colors.gray400 },
  selectAllBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.tinted,
  },
  selectAllText: { fontSize: 13, color: Colors.primary, fontWeight: '700' },

  scroll: { padding: 16, paddingBottom: 24 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.gray500,
    marginTop: 16, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.gray200,
  },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  catChipTextActive: { color: Colors.white },

  newCatInput: {
    marginTop: 10, borderWidth: 1.5, borderColor: Colors.primary,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: Colors.black, backgroundColor: Colors.white,
  },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 12,
    padding: 14, marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  itemRowChecked: { backgroundColor: Colors.tinted },
  checkbox: {
    width: 22, height: 22, borderRadius: 7,
    borderWidth: 2, borderColor: Colors.gray200,
    justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  itemName: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.black },
  itemNameChecked: { fontWeight: '600', color: Colors.dark },

  footer: {
    padding: 16, paddingBottom: 24,
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.gray100,
  },
  confirmBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
