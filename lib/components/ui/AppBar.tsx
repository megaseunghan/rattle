import { AppIcon } from '../../icons/AppIcon';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Spacing, Type } from '../../../constants/designTokens';

interface AppBarProps {
  /** Let a parent GlassBackdrop continue behind this header. */
  transparent?: boolean;
  title: string;
  /** 메인 탭 화면: 좌측 메뉴 아이콘 눌렀을 때 (뒤로가기와 동시 사용 불가) */
  onMenuPress?: () => void;
  /** 하위 화면: 뒤로가기 chevron 눌렀을 때. 지정 시 하위 화면 변형으로 렌더링된다 */
  onBack?: () => void;
  /** 우측 슬롯 (프로필/알림 아이콘 등 자유 배치) */
  rightSlot?: React.ReactNode;
  /** 하위 화면 우측 액션 텍스트 (예: "저장") */
  rightActionLabel?: string;
  onRightActionPress?: () => void;
  /** 홈 화면처럼 제목 위에 작은 캡션(매장명 등)을 둘 때 */
  caption?: string;
}

export function AppBar({
  title,
  transparent = false,
  onMenuPress,
  onBack,
  rightSlot,
  rightActionLabel,
  onRightActionPress,
  caption,
}: AppBarProps) {
  const isSubScreen = !!onBack;

  return (
    <View style={[styles.container, transparent && { backgroundColor: 'transparent' }]}>
      {isSubScreen ? (
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <AppIcon name="chevron-back" size={20} color={Colors.gray700} />
        </Pressable>
      ) : (
        onMenuPress && (
          <Pressable accessibilityRole="button" accessibilityLabel="더보기" onPress={onMenuPress} style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
            <AppIcon name="menu" size={22} color={Colors.black} />
          </Pressable>
        )
      )}

      <View style={styles.titleWrap}>
        {caption && <Text style={styles.caption}>{caption}</Text>}
        <Text style={isSubScreen ? styles.subTitle : styles.mainTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {isSubScreen && rightActionLabel ? (
        <Pressable onPress={onRightActionPress} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.rightAction}>{rightActionLabel}</Text>
        </Pressable>
      ) : (
        rightSlot
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: Spacing.sectionTop,
    paddingHorizontal: Spacing.screenX,
    backgroundColor: Colors.homeCanvas,
  },
  menuButton: {
    marginRight: -2,
    minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  backButton: {
    marginRight: -2,
    minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  actionButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pressed: { opacity: 0.7 },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  caption: {
    fontSize: Type.sm,
    fontWeight: '500',
    color: Colors.gray400,
    marginBottom: 2,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.black,
  },
  subTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.black,
  },
  rightAction: {
    fontSize: Type.xs + 1,
    fontWeight: '700',
    color: Colors.action,
  },
});
