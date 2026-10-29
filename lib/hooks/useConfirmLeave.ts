import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';

/**
 * 스와이프/뒤로가기로 작성 중인 폼이 확인 없이 사라지는 걸 막는다.
 * shouldWarn이 true인 동안 화면을 벗어나려 하면 확인 알림을 띄우고,
 * 저장 성공 등으로 의도적으로 나갈 때는 반환된 bypass()를 네비게이션 직전에 호출한다.
 */
export function useConfirmLeave(shouldWarn: boolean, opts?: { title?: string; message?: string; discardLabel?: string; blockLeave?: boolean }) {
  const navigation = useNavigation();
  const bypassRef = useRef(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (bypassRef.current || !shouldWarn) return;
      e.preventDefault();
      if (opts?.blockLeave) { Alert.alert('저장 중이에요', '처리가 끝난 뒤 이동해 주세요.'); return; }
      Alert.alert(
        opts?.title ?? '저장하지 않고 나가시겠어요?',
        opts?.message ?? '지금 나가면 입력한 내용이 저장되지 않아요.',
        [
          { text: '계속 작성', style: 'cancel' },
          { text: opts?.discardLabel ?? '나가기', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, shouldWarn, opts?.title, opts?.message, opts?.discardLabel, opts?.blockLeave]);

  return () => { bypassRef.current = true; };
}
