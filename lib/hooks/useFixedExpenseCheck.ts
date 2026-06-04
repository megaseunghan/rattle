import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';

const CHECKED_KEY = 'FIXED_EXPENSE_CHECKED_DATE';

export function useFixedExpenseCheck() {
  const { store } = useAuth();

  const check = useCallback(async () => {
    if (!store) return;

    const today = new Date();
    if (today.getDate() !== 1) return;

    // 오늘 이미 확인했으면 스킵
    const todayStr = today.toISOString().slice(0, 10);
    const lastChecked = await AsyncStorage.getItem(CHECKED_KEY);
    if (lastChecked === todayStr) return;

    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    // 이번 달 고정비 있으면 스킵
    const { data: existing } = await supabase
      .from('expenses')
      .select('id')
      .eq('store_id', store.id)
      .eq('year_month', yearMonth)
      .eq('category', '고정비')
      .limit(1);

    if (existing && existing.length > 0) {
      await AsyncStorage.setItem(CHECKED_KEY, todayStr);
      return;
    }

    // 전월 고정비 조회
    const prevDate = new Date(year, month - 2, 1);
    const prevYearMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const { data: prevItems } = await supabase
      .from('expenses')
      .select('name, amount, category')
      .eq('store_id', store.id)
      .eq('year_month', prevYearMonth)
      .eq('category', '고정비');

    await AsyncStorage.setItem(CHECKED_KEY, todayStr);

    const hasPrev = prevItems && prevItems.length > 0;

    Alert.alert(
      `${month}월 고정비 확인`,
      hasPrev
        ? `이번 달 고정비가 없어요.\n전월(${prevDate.getMonth() + 1}월) 내역을 그대로 적용할까요?`
        : `이번 달 고정비가 없어요.\n비용 탭에서 등록해주세요.`,
      hasPrev
        ? [
            { text: '수정하기', onPress: () => router.push('/(tabs)/expenses') },
            {
              text: '전월과 동일',
              onPress: async () => {
                await supabase.from('expenses').insert(
                  prevItems.map(e => ({
                    store_id: store.id,
                    year_month: yearMonth,
                    category: e.category,
                    name: e.name,
                    amount: e.amount,
                  })),
                );
              },
            },
            { text: '나중에', style: 'cancel' },
          ]
        : [
            { text: '등록하기', onPress: () => router.push('/(tabs)/expenses') },
            { text: '나중에', style: 'cancel' },
          ],
    );
  }, [store]);

  return { check };
}
