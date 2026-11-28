import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** 시스템 '동작 줄이기'를 따른다. 켜져 있으면 질문 흐름의 이동·나타남 효과를 끈다. */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (alive) setReduced(value); })
      .catch(() => { /* 알 수 없으면 기본 동작을 유지한다. */ });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; subscription?.remove?.(); };
  }, []);
  return reduced;
}
