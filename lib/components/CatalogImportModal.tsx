import { useState, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet,
  TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { TossCatalogItem } from '../../types';

interface CatalogImportModalProps {
  visible: boolean;
  items: TossCatalogItem[];
  onConfirm: (selectedItems: TossCatalogItem[]) => Promise<void>;
  onClose: () => void;
}

export function CatalogImportModal({ visible, items, onConfirm, onClose }: CatalogImportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(items.map(i => i.itemId)));
  const [importing, setImporting] = useState(false);

  // items는 의존성에서 의도적으로 제외: visible이 true가 되는 시점에만 선택 초기화
  useEffect(() => {
    if (visible) setSelectedIds(new Set(items.map(i => i.itemId)));
  }, [visible]);

  const grouped = useMemo(() => {
    const map = new Map<string, TossCatalogItem[]>();
    for (const item of items) {
      const cat = item.categoryName || '미분류';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const allSelected = items.length > 0 && selectedIds.size === items.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.itemId)));
    }
  }

  function toggleItem(itemId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  async function handleConfirm() {
    const selected = items.filter(i => selectedIds.has(i.itemId));
    if (selected.length === 0) return;
    setImporting(true);
    try {
      await onConfirm(selected);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.gray600} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>레시피로 가져오기</Text>
            {items.length > 0 && (
              <Text style={styles.headerCount}>{items.length}개 품목</Text>
            )}
          </View>
          <TouchableOpacity onPress={toggleAll} style={styles.selectAllBtn}>
            <Text style={styles.selectAllText}>{allSelected ? '전체 해제' : '전체 선택'}</Text>
          </TouchableOpacity>
        </View>

        {/* 품목 목록 */}
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {grouped.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBg}>
                <Ionicons name="restaurant-outline" size={26} color={Colors.gray400} />
              </View>
              <Text style={styles.emptyText}>가져올 항목이 없습니다.</Text>
            </View>
          ) : (
            grouped.map(([category, catItems]) => (
              <View key={category}>
                <Text style={styles.categoryHeader}>{category}</Text>
                {catItems.map(item => {
                  const checked = selectedIds.has(item.itemId);
                  return (
                    <TouchableOpacity
                      key={item.itemId}
                      style={[styles.itemRow, checked && styles.itemRowChecked]}
                      onPress={() => toggleItem(item.itemId)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <Ionicons name="checkmark" size={13} color={Colors.white} />}
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemName, checked && styles.itemNameChecked]}>
                          {item.itemName}
                        </Text>
                        <Text style={styles.itemPrice}>
                          {item.price.toLocaleString('ko-KR')}원
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        {/* 하단 확인 버튼 */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, (importing || selectedIds.size === 0) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={importing || selectedIds.size === 0}
          >
            {importing
              ? <ActivityIndicator size="small" color={Colors.white} />
              : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
                  <Text style={styles.confirmBtnText}>가져오기 ({selectedIds.size}개)</Text>
                </>
              )
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { alignItems: 'center', gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.black },
  headerCount: { fontSize: 12, color: Colors.gray400 },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.tinted,
  },
  selectAllText: { fontSize: 13, color: Colors.primary, fontWeight: '700' },

  list: { paddingHorizontal: 16, paddingBottom: 24 },

  categoryHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray500,
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemRowChecked: {
    backgroundColor: Colors.tinted,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  itemInfo: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '500', color: Colors.black, flex: 1 },
  itemNameChecked: { fontWeight: '600', color: Colors.dark },
  itemPrice: { fontSize: 14, color: Colors.gray500, marginLeft: 8, fontWeight: '500' },

  footer: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIconBg: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyText: { fontSize: 15, color: Colors.gray400, fontWeight: '500' },
});
