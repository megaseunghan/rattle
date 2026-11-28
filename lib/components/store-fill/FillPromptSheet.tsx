import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../icons/AppIcon';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { STORE_FILL_GROUPS, type StoreFillGroup } from '../../utils/storeFill';
import { GROUP_LABELS } from './storeFillCopy';
import { FillSheet } from './FillSheet';

export interface FillPromptSheetProps {
  visible: boolean;
  filledCount: number;
  doneGroups: Record<StoreFillGroup, boolean>;
  onFill(): void;
  onLater(): void;
}

/** 홈 유도 시트(fill-v5): 그날 처음 홈을 열 때 사장님에게 띄운다. 바깥을 누르면 '나중에 할게요'와 같다. */
export function FillPromptSheet({ visible, filledCount, doneGroups, onFill, onLater }: FillPromptSheetProps) {
  const fillLabel = filledCount > 0 ? `이어서 채우기 · 4개 중 ${filledCount}개` : '채우기';
  return (
    <FillSheet visible={visible} onClose={onLater} title="매장 정보를 마저 채워 주세요"
      description="급여 날짜를 정하면 월급날 3일 전과 당일에 알려 드릴게요." accessibilityLabel="매장 정보 마저 채우기">
      <View style={styles.chips} accessibilityLabel={`4개 중 ${filledCount}개 채웠어요`}>
        {STORE_FILL_GROUPS.map(group => {
          const done = doneGroups[group];
          return (
            <View key={group} style={[styles.chip, done && styles.chipOn]}
              accessibilityLabel={`${GROUP_LABELS[group]}, ${done ? '채웠어요' : '아직 안 채웠어요'}`}>
              {done ? <AppIcon name="check" size={13} color={Colors.action} /> : null}
              <Text style={[styles.chipText, done && styles.chipTextOn]}>{GROUP_LABELS[group]}</Text>
            </View>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" onPress={onFill} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
        <Text style={styles.goText}>{fillLabel}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onLater} style={({ pressed }) => [styles.later, pressed && styles.laterPressed]}>
        <Text style={styles.laterText}>나중에 할게요</Text>
      </Pressable>
    </FillSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.gray50 },
  chipOn: { backgroundColor: Colors.bg },
  chipText: { fontFamily: Fonts.wantedSemiBold, fontSize: 13, color: Colors.gray600 },
  chipTextOn: { color: Colors.action },
  go: { marginTop: 20, minHeight: 52, borderRadius: 14, backgroundColor: Colors.action, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  goText: { fontFamily: Fonts.wantedBold, fontSize: 16, color: Colors.white },
  pressed: { opacity: 0.85 },
  later: { alignSelf: 'center', marginTop: 4, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 12 },
  laterPressed: { backgroundColor: Colors.gray50 },
  laterText: { fontFamily: Fonts.wantedMedium, fontSize: 15, color: Colors.gray600 },
});
