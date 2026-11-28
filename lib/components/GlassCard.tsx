import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { CardStyle } from '../../constants/designTokens';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * 흰 카드 표면. 2026-11-28(S04 확정 시안 적용)부터 블러·틴트·그림자 없는 불투명 흰 카드다.
 * 이름은 기존 화면 호환을 위해 그대로 둔다.
 */
export function GlassCard({ children, style, contentStyle }: GlassCardProps) {
  return <View style={[styles.card, style]}>
    <View style={[styles.content, contentStyle]}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  card: { ...CardStyle, overflow: 'hidden' },
  content: { padding: 18 },
});
