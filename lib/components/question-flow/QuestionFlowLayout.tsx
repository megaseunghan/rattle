/* design-system: DESIGN.md — 질문 흐름 화면 틀: 흰 바탕, 위 왼쪽 뒤로 화살표, 한 줄 진행 막대, 아래 고정 행동. */
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { AppIcon } from '../../icons/AppIcon';
import { FlowProgress } from './FlowProgress';
import { useReduceMotion } from './useReduceMotion';

interface QuestionFlowContextValue {
  /** 스크롤 내용 맨 위 기준 y로 옮긴다(질문 블록의 onLayout y). */
  scrollToY: (y: number) => void;
  reduceMotion: boolean;
}

const QuestionFlowContext = createContext<QuestionFlowContextValue>({ scrollToY: () => {}, reduceMotion: true });
export const useQuestionFlow = (): QuestionFlowContextValue => useContext(QuestionFlowContext);

export interface QuestionFlowLayoutProps {
  /** 없으면 뒤로 화살표를 그리지 않는다(예: 완료 뒤 화면). */
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  /** 없으면 진행 막대를 그리지 않는다. */
  progress?: { step: number; total: number; label: string };
  /** 아래 고정 영역(보통 FlowNextButton). */
  footer?: ReactNode;
  /** 질문 블록들. onLayout y가 맞도록 스크롤 내용의 바로 아래 자식으로 둔다. */
  children: ReactNode;
}

export function QuestionFlowLayout({ onBack, backLabel = '뒤로', backDisabled, progress, footer, children }: QuestionFlowLayoutProps) {
  const scrollRef = useRef<ScrollView>(null);
  const reduceMotion = useReduceMotion();
  const value = useMemo<QuestionFlowContextValue>(() => ({
    reduceMotion,
    scrollToY: y => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: !reduceMotion }),
  }), [reduceMotion]);
  return <QuestionFlowContext.Provider value={value}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {(onBack || progress) && <View style={styles.head}>
        <View style={styles.top}>
          {onBack && <Pressable onPress={onBack} disabled={backDisabled} accessibilityRole="button" accessibilityLabel={backLabel}
            accessibilityState={{ disabled: !!backDisabled }} hitSlop={4}
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}>
            <AppIcon name="chevron-back" size={24} color={backDisabled ? Colors.gray300 : Colors.black} />
          </Pressable>}
        </View>
        {progress && <FlowProgress {...progress} />}
      </View>}
      <ScrollView ref={scrollRef} style={styles.root} contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {footer != null && <View style={styles.bottom}>{footer}</View>}
    </KeyboardAvoidingView>
  </QuestionFlowContext.Provider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.white },
  head: { paddingHorizontal: 20, paddingBottom: 8, backgroundColor: Colors.white },
  top: { height: 44, flexDirection: 'row', alignItems: 'center', marginHorizontal: -8 },
  back: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  backPressed: { backgroundColor: Colors.gray50 },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  bottom: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: Colors.white },
});
