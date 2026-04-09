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

  // 모달이 열릴 때 전체 선택 초기화
  useEffect(() => {
    if (visible) setSelectedIds(new Set(items.map(i => i.itemId)));
  }, [visible]);

  // category_name 기준으로 그룹핑
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
            <Ionicons name="close" size={22} color={Colors.gray600} />
          </TouchableOpacity>
          <Text style={styles.title}>레시피로 가져오기</Text>
          <TouchableOpacity onPress={toggleAll} style={styles.selectAllBtn}>
            <Text style={styles.selectAllText}>{allSelected ? '전체 해제' : '전체 선택'}</Text>
          </TouchableOpacity>
        </View>

        {/* 품목 목록 */}
        <ScrollView contentContainerStyle={styles.list}>
          {grouped.length === 0 ? (
            <Text style={styles.emptyText}>가져올 항목이 없습니다.</Text>
          ) : (
            grouped.map(([category, catItems]) => (
              <View key={category}>
                <Text style={styles.categoryHeader}>{category}</Text>
                {catItems.map(item => {
                  const checked = selectedIds.has(item.itemId);
                  return (
                    <TouchableOpacity
                      key={item.itemId}
                      style={styles.itemRow}
                      onPress={() => toggleItem(item.itemId)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={checked ? Colors.primary : Colors.gray300}
                      />
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.itemName}</Text>
                        <Text style={styles.itemPrice}>{item.price.toLocaleString('ko-KR')}원</Text>
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
              : <Text style={styles.confirmBtnText}>확인 ({selectedIds.size}개)</Text>
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
  closeBtn: { padding: 4 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.black },
  selectAllBtn: { padding: 4 },
  selectAllText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  categoryHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gray500,
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  itemInfo: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '500', color: Colors.black, flex: 1 },
  itemPrice: { fontSize: 14, color: Colors.gray500, marginLeft: 8 },
  footer: {
    padding: 16,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  emptyText: { fontSize: 14, color: Colors.gray400, textAlign: 'center', paddingVertical: 40 },
});
