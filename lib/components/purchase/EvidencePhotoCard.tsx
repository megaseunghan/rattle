/* design-system: DESIGN.md — 매입 증빙 사진 카드: '사진 추가' → [앨범에서 선택 | 카메라 촬영] */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { AppIcon } from '../../icons/AppIcon';
import { MAX_EVIDENCE_FILES } from '../../types/evidence';
import { SheetModal } from '../ui/SheetModal';
import { CardHeader, PurchaseCard } from './PurchaseUi';

export type PhotoSource = 'library' | 'camera';

/** 시트가 완전히 닫힌 뒤 시스템 선택기를 연다(iOS는 표시 중인 모달 위에 선택기를 띄우지 못한다). */
const DISMISS_FALLBACK_MS = 900;

export function EvidenceSourceSheet({ visible, remaining, onClose, onPick }: {
  visible: boolean; remaining: number; onClose: () => void; onPick: (source: PhotoSource) => void;
}) {
  // 고른 순간의 onPick을 함께 기억한다. 시트를 닫으면 부모가 대상을 비우므로, 닫힌 뒤의 onPick으로는 무엇을 고를지 알 수 없다.
  const chosen = useRef<{ source: PhotoSource; pick: (source: PhotoSource) => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const launch = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const picked = chosen.current;
    chosen.current = null;
    if (picked) picked.pick(picked.source);
  }, []);
  function choose(source: PhotoSource) {
    if (chosen.current) return;
    chosen.current = { source, pick: onPick };
    onClose();
    timer.current = setTimeout(launch, DISMISS_FALLBACK_MS);
  }
  return <SheetModal visible={visible} onRequestClose={onClose} onDismiss={launch}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{remaining}장 더 붙일 수 있어요</Text>
          <SourceOption icon="images-outline" label="앨범에서 선택" onPress={() => choose('library')} />
          <SourceOption icon="camera-outline" label="카메라 촬영" onPress={() => choose('camera')} />
        </View>
        <TouchableOpacity accessibilityRole="button" style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
      </SafeAreaView>
    </View>
  </SheetModal>;
}

function SourceOption({ icon, label, onPress }: { icon: 'images-outline' | 'camera-outline'; label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={onPress}>
    <AppIcon name={icon} size={22} color={Colors.action} /><Text style={styles.optionText}>{label}</Text>
  </TouchableOpacity>;
}

/** 카드 틀: 제목·개수, '사진 추가' 버튼 줄, 붙인 사진 줄(가로 스크롤). */
export function EvidencePhotoCard({ count, disabled, onAdd, children, footer }: {
  count: number; disabled: boolean; onAdd: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const full = count >= MAX_EVIDENCE_FILES;
  const fullLabel = `${MAX_EVIDENCE_FILES}장을 모두 붙였어요`;
  return <PurchaseCard padded label="증빙 사진">
    <CardHeader title="증빙 사진" meta={<Text style={styles.count}><Text style={styles.countNow}>{count}</Text> / {MAX_EVIDENCE_FILES}장</Text>} />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={full ? fullLabel : '사진 추가'} accessibilityState={{ disabled: disabled || full }}
      disabled={disabled || full} style={[styles.add, (disabled || full) && styles.addDisabled]} onPress={onAdd}>
      {!full && <AppIcon name="add" size={20} color={Colors.action} />}
      <Text style={styles.addText}>{full ? fullLabel : '사진 추가'}</Text>
    </TouchableOpacity>
    {count > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{children}</ScrollView>}
    {full && <Text style={styles.note}>바꾸려면 사진을 먼저 빼 주세요.</Text>}
    {footer}
  </PurchaseCard>;
}

/** 72pt 정사각 썸네일 칸 + 오른쪽 위 ✕(빼기). ✕는 22pt로 그리고 누르는 영역은 썸네일 안에서 44pt로 둔다. */
export function PhotoThumb({ children, removeLabel, onRemove, removeDisabled = false, status }: {
  children: ReactNode; removeLabel: string; onRemove?: () => void; removeDisabled?: boolean; status?: ReactNode;
}) {
  return <View style={styles.thumb}>
    {children}
    {status && <View pointerEvents="none" style={StyleSheet.absoluteFill}>{status}</View>}
    {onRemove && <TouchableOpacity accessibilityRole="button" accessibilityLabel={removeLabel} disabled={removeDisabled} onPress={onRemove}
      style={[styles.removeTouch, removeDisabled && styles.addDisabled]}>
      <View style={styles.remove}><AppIcon name="close" size={12} color={Colors.white} /></View>
    </TouchableOpacity>}
  </View>;
}

export const photoStyles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  status: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 3, backgroundColor: Colors.scrimStrong, alignItems: 'center' },
  statusText: { fontFamily: Fonts.wantedSemiBold, fontSize: 11, color: Colors.white },
  placeholder: { fontFamily: Fonts.wantedMedium, fontSize: 11, color: Colors.gray500, textAlign: 'center', paddingHorizontal: 4 },
});

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlaySheet },
  sheet: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  group: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden' },
  groupTitle: { fontFamily: Fonts.wantedMedium, fontSize: 13, color: Colors.gray500, textAlign: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.hairline },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.hairline },
  optionText: { fontFamily: Fonts.wantedSemiBold, fontSize: 16, color: Colors.action },
  cancel: { minHeight: 56, marginBottom: 8, backgroundColor: Colors.white, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: Fonts.wantedBold, fontSize: 16, color: Colors.black },
  count: { fontFamily: Fonts.wantedSemiBold, fontSize: 13, color: Colors.gray600 },
  countNow: { fontFamily: Fonts.geistSemiBold, color: Colors.action },
  add: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.pale, backgroundColor: Colors.tinted, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addDisabled: { opacity: 0.5 },
  addText: { fontFamily: Fonts.wantedBold, fontSize: 15, color: Colors.action },
  row: { gap: 8, paddingTop: 12 },
  note: { fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.gray600, marginTop: 8 },
  thumb: { width: 72, height: 72, borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  removeTouch: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'flex-end', paddingTop: 4, paddingRight: 4 },
  remove: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.scrimStrong, alignItems: 'center', justifyContent: 'center' },
});
