import React from 'react';
import { View, StyleSheet, Platform, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors } from '../../constants/colors';

interface GlassCardProps {
  children: React.ReactNode;
  /** 매장 컬러 기반 틴트(rgba). 없으면 기본 glass.tint */
  tint?: string;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Glassmorphism — frosted glass 카드.
 * iOS는 expo-blur BlurView로 정확한 블러, Android는 BlurView 렌더링이 부정확해
 * 반투명 솔리드 + 틴트 오버레이로 폴백한다.
 * 그림자는 바깥 래퍼, 블러는 overflow:hidden 내부 래퍼로 분리해 둘 다 살린다.
 */
export function GlassCard({ children, tint, intensity = 40, style, contentStyle }: GlassCardProps) {
  const overlayTint = tint ?? Colors.glass.tint;

  return (
    <View style={[styles.shadowWrap, style]}>
      <View style={styles.clip}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.androidFill]} />
        )}
        {/* 매장 컬러 틴트 오버레이 */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayTint }]} pointerEvents="none" />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: 20,
    shadowColor: Colors.deeper,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  clip: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.background,
  },
  androidFill: { backgroundColor: Colors.glass.background },
  content: { padding: 18 },
});
