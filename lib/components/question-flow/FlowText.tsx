/* design-system: DESIGN.md — 질문 안의 작은 글자: 하위 질문 이름, 회색 안내, 현재 단계 오류. */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';

/** 같은 질문 안의 두 번째 물음(예: '수습 중 급여는 몇 %로 줄까요?'). */
export function FlowSubLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sub}>{children}</Text>;
}

/** 입력 아래 회색 안내. 바뀌면 화면 읽기에 알린다. */
export function FlowNote({ children }: { children: ReactNode }) {
  return <Text style={styles.note} accessibilityLiveRegion="polite">{children}</Text>;
}

/** 현재 단계의 저장 실패 안내. 입력은 그대로 두고 다시 시도하게 한다. */
export function FlowError({ message }: { message: string }) {
  return <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
    <Text style={styles.errorText}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  sub: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: Colors.gray600, marginTop: 20 },
  note: { fontSize: 12, lineHeight: 19, color: Colors.gray500, marginTop: 12 },
  error: { marginTop: 4, marginBottom: 16, padding: 16, borderRadius: 12, backgroundColor: Colors.fieldErrorBg },
  errorText: { fontSize: 14, lineHeight: 22, color: Colors.gray600 },
});
