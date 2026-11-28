/* design-system: DESIGN.md — 질문 하나. 활성(큰 제목·설명·입력) / 답함(작게 줄고 눌러 고침) / 대기(제목만). */
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Colors } from '../../../constants/colors';
import { useQuestionFlow } from './QuestionFlowLayout';

export type QuestionBlockState = 'active' | 'answered' | 'waiting';

export interface QuestionBlockProps {
  title: string;
  description?: string;
  /** 제목 옆 작은 꼬리표(예: '선택'). 활성일 때만 보인다. */
  badge?: string;
  state: QuestionBlockState;
  /** 답함 상태에서 한 줄로 보여 줄 값. */
  answer?: string;
  /** 답함 상태에서 줄을 누르면 부른다. 없거나 editDisabled면 누를 수 없다. */
  onEdit?: () => void;
  editDisabled?: boolean;
  /** 첫 질문이면 위 구분 띠를 그리지 않는다. */
  first?: boolean;
  /** 처음 나타날 때 아래에서 떠오르게 한다(동작 줄이기면 없음). */
  animateIn?: boolean;
  /** 활성 상태의 입력 영역. */
  children?: ReactNode;
}

const ENTER_MS = 450;

export function QuestionBlock({ title, description, badge, state, answer, onEdit, editDisabled, first, animateIn, children }: QuestionBlockProps) {
  const { scrollToY, reduceMotion } = useQuestionFlow();
  const appear = useRef(new Animated.Value(animateIn && !reduceMotion ? 0 : 1)).current;
  const pendingScroll = useRef(state === 'active' && !first);
  const previousState = useRef(state);
  if (previousState.current !== state) {
    if (state === 'active') pendingScroll.current = true;
    previousState.current = state;
  }
  useEffect(() => {
    if (!animateIn || reduceMotion) { appear.setValue(1); return; }
    const animation = Animated.timing(appear, { toValue: 1, duration: ENTER_MS, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
    // 처음 나타날 때 한 번만 움직인다.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function handleLayout(event: LayoutChangeEvent) {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    scrollToY(event.nativeEvent.layout.y - 8);
  }
  const active = state === 'active';
  const translateY = appear.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  return <Animated.View onLayout={handleLayout} style={[styles.block, !first && styles.divided, { opacity: appear, transform: [{ translateY }] }]}>
    <View style={styles.titleRow}>
      <Text accessibilityRole="header" style={[active ? styles.title : styles.titleSmall, styles.titleText]}>{title}</Text>
      {active && badge ? <Text style={styles.badge}>{badge}</Text> : null}
    </View>
    {active && description ? <Text style={styles.description}>{description}</Text> : null}
    {active ? children : null}
    {state === 'answered' && <AnswerRow title={title} answer={answer ?? ''} onEdit={onEdit} disabled={editDisabled || !onEdit} />}
  </Animated.View>;
}

function AnswerRow({ title, answer, onEdit, disabled }: { title: string; answer: string; onEdit?: () => void; disabled: boolean }) {
  return <Pressable onPress={onEdit} disabled={disabled} accessibilityRole="button"
    accessibilityLabel={`${title}, ${answer}`} accessibilityHint={disabled ? undefined : '눌러서 고칠 수 있어요'}
    accessibilityState={{ disabled }} style={({ pressed }) => [styles.answer, pressed && !disabled && styles.answerPressed]}>
    <Text style={styles.answerText} numberOfLines={2}>{answer}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  block: { paddingTop: 20, paddingBottom: 28 },
  divided: { borderTopWidth: 8, borderTopColor: Colors.gray50, marginHorizontal: -20, paddingHorizontal: 20 },
  title: { fontSize: 22, lineHeight: 31, fontWeight: '700', color: Colors.black },
  titleSmall: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: Colors.gray500 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  titleText: { flexShrink: 1 },
  badge: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: Colors.gray500, backgroundColor: Colors.gray100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  description: { fontSize: 14, lineHeight: 22, color: Colors.gray600, marginTop: 6 },
  answer: { minHeight: 44, marginTop: 8, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: Colors.gray200, paddingHorizontal: 2 },
  answerPressed: { backgroundColor: Colors.gray50 },
  answerText: { fontSize: 18, lineHeight: 26, fontWeight: '600', color: Colors.black },
});
