/* design-system: DESIGN.md — 매입 등록·상세 확정 시안(purchase-new-v4, purchase-edit-v2) 공용 조각 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Keyboard, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { AppIcon } from '../../icons/AppIcon';

export const won = (value: number): string => Math.round(value).toLocaleString('ko-KR');

/** 입력칸 아래와 보이는 영역 끝(하단 바 위) 사이에 남길 여유 */
const KEYBOARD_SCROLL_GAP = 16;
/** 키보드가 올라오며 화면이 줄어드는 애니메이션이 끝날 때까지 기다리는 시간 */
const KEYBOARD_SETTLE_MS = 300;
/** 하단 바가 없을 때 알림을 화면 아래(홈 인디케이터 위)에서 띄우는 높이 */
const TOAST_GAP = 12;
const TOAST_BOTTOM_NO_BAR = 48;

type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
const isMeasurable = (value: unknown): value is Measurable => !!value && typeof (value as Measurable).measureInWindow === 'function';

/**
 * 누른 입력칸이 키보드·하단 바에 가리면 가린 만큼만 스크롤해 올린다.
 * 키보드가 다 올라와 화면이 줄어든 뒤, 입력칸과 보이는 영역의 실제 위치를 재서 맞춘다.
 * 입력칸 onFocus에서 event.currentTarget을 넘긴다.
 */
export function useKeyboardScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const focused = useRef<Measurable | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reveal = useCallback((input: Measurable) => {
    const scroll = scrollRef.current?.getNativeScrollRef();
    if (!scroll) return;
    scroll.measureInWindow((_sx: number, top: number, _sw: number, height: number) => {
      input.measureInWindow((_x, y, _w, h) => {
        const overflow = y + h + KEYBOARD_SCROLL_GAP - (top + height);
        if (overflow > 0) scrollRef.current?.scrollTo({ y: offset.current + overflow, animated: true });
      });
    });
  }, []);
  const revealLater = useCallback((input: Measurable) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => reveal(input), KEYBOARD_SETTLE_MS);
  }, [reveal]);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => { if (focused.current) revealLater(focused.current); });
    return () => { sub.remove(); if (timer.current) clearTimeout(timer.current); };
  }, [revealLater]);
  const focusInput = useCallback((target: unknown) => {
    if (!isMeasurable(target)) return;
    focused.current = target;
    // 키보드가 이미 떠 있으면 이것으로 맞추고, 새로 올라오면 keyboardDidShow에서 다시 맞춘다.
    revealLater(target);
  }, [revealLater]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => { offset.current = event.nativeEvent.contentOffset.y; }, []);
  return { scrollRef, focusInput, onScroll };
}

/** 하단 바 높이를 재서 알림이 바를 가리지 않는 위치를 돌려준다. */
export function useBarToast() {
  const [barHeight, setBarHeight] = useState(0);
  const onBarLayout = useCallback((event: LayoutChangeEvent) => setBarHeight(event.nativeEvent.layout.height), []);
  return { onBarLayout, toastBottom: (hasBar: boolean) => hasBar && barHeight ? barHeight + TOAST_GAP : TOAST_BOTTOM_NO_BAR };
}

export function PurchaseAppBar({ title, storeName, onBack, backDisabled = false, right }: {
  title: string; storeName?: string; onBack: () => void; backDisabled?: boolean; right?: ReactNode;
}) {
  return <View style={ui.appBar}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="뒤로" accessibilityState={{ disabled: backDisabled }} disabled={backDisabled} onPress={onBack} style={ui.appBarButton}>
      <AppIcon name="chevron-back" size={24} color={Colors.black} />
    </TouchableOpacity>
    <Text accessibilityRole="header" style={ui.appBarTitle}>{title}</Text>
    {!!storeName && <Text numberOfLines={1} style={ui.appBarStore}>{storeName}</Text>}
    <View style={ui.appBarRight}>{right}</View>
  </View>;
}

export function PurchaseCard({ children, padded = false, style, label }: { children: ReactNode; padded?: boolean; style?: StyleProp<ViewStyle>; label?: string }) {
  return <View accessibilityLabel={label} style={[ui.card, padded && ui.cardPadded, style]}>{children}</View>;
}

export function CardHeader({ title, meta }: { title: string; meta?: ReactNode }) {
  return <View style={ui.cardHeader}>
    <Text accessibilityRole="header" style={ui.cardTitle}>{title}</Text>
    {typeof meta === 'string' ? <Text style={ui.cardMeta}>{meta}</Text> : meta}
  </View>;
}

/** 눌러서 고르는 칩. 아래 화살표(⌄)가 편집 가능 표시다. */
export function EditChip({ label, tinted = false, open = false, onPress, accessibilityLabel, disabled = false }: {
  label: string; tinted?: boolean; open?: boolean; onPress: () => void; accessibilityLabel?: string; disabled?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ expanded: open, disabled }}
    disabled={disabled} onPress={onPress} hitSlop={{ top: 6, bottom: 6 }} style={[ui.chip, tinted && ui.chipTinted, open && ui.chipOpen]}>
    <Text style={[ui.chipText, tinted && ui.chipTextTinted]}>{label}</Text>
    <AppIcon name="chevron-down" size={14} color={tinted ? Colors.action : Colors.gray500} style={ui.chipIcon} />
  </TouchableOpacity>;
}

export function PlainChip({ label }: { label: string }) {
  return <View style={[ui.chip, ui.chipPlain]}><Text style={ui.chipPlainText}>{label}</Text></View>;
}

export function MiniPanel({ children }: { children: ReactNode }) {
  return <View style={ui.mini}>{children}</View>;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text accessibilityRole="alert" style={ui.fieldError}>{message}</Text>;
}

/** 키보드가 올라와 있는지. 올라와 있으면 홈 막대 자리가 키보드에 덮이므로 그 여백을 두지 않는다. */
/** 이보다 낮으면 화면 아래에 붙은 키보드가 아니라 떠 있는 키보드·도구막대로 본다(바 아래 여백 유지) */
const MIN_DOCKED_KEYBOARD_HEIGHT = 120;

function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [
      Keyboard.addListener(showEvent, event => setShown((event?.endCoordinates?.height ?? 0) >= MIN_DOCKED_KEYBOARD_HEIGHT)),
      Keyboard.addListener(hideEvent, () => setShown(false)),
    ];
    return () => subs.forEach(sub => sub.remove());
  }, []);
  return shown;
}

export function BottomBar({ total, children, onLayout }: { total: number; children: ReactNode; onLayout?: (event: LayoutChangeEvent) => void }) {
  const keyboardShown = useKeyboardShown();
  return <SafeAreaView edges={keyboardShown ? [] : ['bottom']} style={ui.bar} onLayout={onLayout}>
    <View style={ui.barTotal} accessible accessibilityLabel={`합계 ${won(total)}원`}>
      <Text style={ui.barLabel}>합계</Text>
      <Text style={ui.barValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{won(total)}<Text style={ui.barUnit}>원</Text></Text>
    </View>
    {children}
  </SafeAreaView>;
}

export function BarButton({ label, onPress, disabled = false, secondary = false, accessibilityLabel }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; accessibilityLabel?: string;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={[secondary ? ui.barSecondary : ui.barPrimary, disabled && ui.barDisabled]}>
    <Text style={secondary ? ui.barSecondaryText : ui.barPrimaryText}>{label}</Text>
  </TouchableOpacity>;
}

/** 하단 고정 바 위의 파란 안내 줄. 사용자가 행동해야 할 때만 쓴다. */
export function BlueNotice({ message, action, onAction }: { message: string; action?: string; onAction?: () => void }) {
  return <View accessibilityRole="alert" style={ui.notice}>
    <Text style={ui.noticeText}>{message}</Text>
    {action && onAction && <TouchableOpacity accessibilityRole="button" onPress={onAction} style={ui.noticeAction}><Text style={ui.noticeActionText}>{action}</Text></TouchableOpacity>}
  </View>;
}

/** 품목 줄 오른쪽 금액. 아래에 칸을 새로 열지 않고 그 자리에서 바로 고친다. */
export function InlineAmount({ value, onChange, label, onFocus, editable = true }: {
  value: string; onChange: (digits: string) => void; label: string; onFocus?: (target: unknown) => void; editable?: boolean;
}) {
  return <View style={[ui.amountBox, !editable && ui.amountBoxDisabled]}>
    <TextInput style={ui.amountInput} value={value ? won(Number(value)) : ''} accessibilityLabel={label} keyboardType="number-pad"
      placeholder="금액" placeholderTextColor={Colors.gray400} maxLength={17} editable={editable} selectTextOnFocus returnKeyType="done"
      onFocus={event => onFocus?.(event.currentTarget)} onChangeText={text => onChange(text.replace(/\D/g, ''))} />
    <Text style={ui.amountUnit}>원</Text>
  </View>;
}

/** 되돌릴 수 있는 알림. 하단 바 위에 잠깐 떠 있고 '되돌리기'를 누를 수 있다. */
export function UndoToast({ message, bottom, onUndo }: { message: string; bottom: number; onUndo: () => void }) {
  useEffect(() => { if (message) AccessibilityInfo.announceForAccessibility(message); }, [message]);
  if (!message) return null;
  return <View pointerEvents="box-none" style={[ui.toast, { bottom }]}>
    <View style={ui.undoBox}>
      <Text style={ui.undoText} numberOfLines={1}>{message}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onUndo} style={ui.undoButton}><Text style={ui.undoAction}>되돌리기</Text></TouchableOpacity>
    </View>
  </View>;
}

/** 짧은 알림. 화면 아래쪽에 잠깐 보였다 사라진다. */
export function InlineToast({ message, bottom }: { message: string; bottom: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return;
    AccessibilityInfo.announceForAccessibility(message);
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [message, opacity]);
  if (!message) return null;
  return <Animated.View pointerEvents="none" style={[ui.toast, { bottom, opacity }]}><Text style={ui.toastText}>{message}</Text></Animated.View>;
}

export const ui = StyleSheet.create({
  appBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  appBarButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { fontFamily: Fonts.wantedBold, fontSize: 17, color: Colors.black },
  appBarStore: { flexShrink: 1, marginLeft: 6, fontFamily: Fonts.wantedMedium, fontSize: 12, color: Colors.gray600 },
  appBarRight: { marginLeft: 'auto', minWidth: 44, alignItems: 'flex-end' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  card: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 16 },
  cardPadded: { paddingBottom: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  cardTitle: { fontFamily: Fonts.wantedBold, fontSize: 15, color: Colors.black },
  cardMeta: { fontFamily: Fonts.wantedMedium, fontSize: 13, color: Colors.gray400 },
  chip: { minHeight: 32, paddingHorizontal: 10, borderRadius: 8, backgroundColor: Colors.chipBg, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipTinted: { backgroundColor: Colors.tinted },
  chipOpen: { borderColor: Colors.primary, backgroundColor: Colors.white },
  chipText: { fontFamily: Fonts.wantedMedium, fontSize: 13, color: Colors.gray600 },
  chipTextTinted: { color: Colors.action },
  chipIcon: { opacity: 0.6 },
  chipPlain: { backgroundColor: 'transparent', paddingHorizontal: 2 },
  chipPlainText: { fontFamily: Fonts.wantedMedium, fontSize: 13, color: Colors.gray400 },
  mini: { marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: Colors.fieldTint, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  fieldError: { fontFamily: Fonts.wantedMedium, fontSize: 13, color: Colors.negative, marginTop: 6, lineHeight: 18 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.homeBorder },
  barTotal: { flex: 1, minWidth: 0 },
  barLabel: { fontFamily: Fonts.wantedMedium, fontSize: 12.5, color: Colors.gray600 },
  barValue: { fontFamily: Fonts.geistBold, fontVariant: ['tabular-nums'], fontSize: 24, color: Colors.black, letterSpacing: -0.3 },
  barUnit: { fontFamily: Fonts.wantedSemiBold, fontSize: 15 },
  barPrimary: { minHeight: 52, paddingHorizontal: 24, borderRadius: 14, backgroundColor: Colors.action, alignItems: 'center', justifyContent: 'center' },
  barPrimaryText: { fontFamily: Fonts.wantedBold, fontSize: 16, color: Colors.white },
  barSecondary: { minHeight: 52, paddingHorizontal: 18, borderRadius: 14, backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  barSecondaryText: { fontFamily: Fonts.wantedBold, fontSize: 16, color: Colors.gray600 },
  barDisabled: { opacity: 0.45 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.pale },
  noticeText: { flex: 1, fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.action },
  noticeAction: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.white },
  noticeActionText: { fontFamily: Fonts.wantedBold, fontSize: 14, color: Colors.action },
  toast: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  toastText: { overflow: 'hidden', backgroundColor: Colors.black, color: Colors.white, fontFamily: Fonts.wantedSemiBold, fontSize: 14, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  amountBox: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, borderRadius: 10, backgroundColor: Colors.homeCanvas },
  amountBoxDisabled: { opacity: 0.5 },
  amountInput: { minWidth: 72, maxWidth: 140, paddingVertical: 0, textAlign: 'right', fontFamily: Fonts.geistSemiBold, fontVariant: ['tabular-nums'], fontSize: 16, color: Colors.black },
  amountUnit: { fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.gray600 },
  undoBox: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.black, borderRadius: 14, paddingLeft: 18, paddingRight: 6 },
  undoText: { flexShrink: 1, fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.white },
  undoButton: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  undoAction: { fontFamily: Fonts.wantedBold, fontSize: 14, color: Colors.pale },
  input: { minHeight: 44, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 10, paddingHorizontal: 10, backgroundColor: Colors.white, fontFamily: Fonts.geistSemiBold, fontVariant: ['tabular-nums'], fontSize: 15, color: Colors.black },
  hint: { width: '100%', fontFamily: Fonts.wantedRegular, fontSize: 12.5, color: Colors.gray600 },
  rowLine: { borderTopWidth: 1, borderTopColor: Colors.hairline },
});
