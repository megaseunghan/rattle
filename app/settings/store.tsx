import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getErrorMessage } from '../../lib/utils/error';

export default function StoreInfoScreen() {
  const { store, refreshStore } = useAuth();
  const [name, setName] = useState(store?.name || '');
  const [laborTarget, setLaborTarget] = useState(String(store?.labor_ratio_target ?? 30));
  const [cogsTarget, setCogsTarget] = useState(String(store?.cogs_ratio_target ?? 40));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (store) {
      setName(store.name || '');
      setLaborTarget(String(store.labor_ratio_target ?? 30));
      setCogsTarget(String(store.cogs_ratio_target ?? 40));
    }
  }, [store?.id]);

  async function handleSave() {
    if (!store || !name.trim()) return;
    const laborNum = Number(laborTarget);
    const cogsNum = Number(cogsTarget);
    if (!laborTarget || Number.isNaN(laborNum) || laborNum <= 0) {
      Alert.alert('입력 오류', '목표 인건비율을 올바르게 입력해주세요.'); return;
    }
    if (!cogsTarget || Number.isNaN(cogsNum) || cogsNum <= 0) {
      Alert.alert('입력 오류', '목표 매출원가율을 올바르게 입력해주세요.'); return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('stores')
        .update({ name: name.trim(), labor_ratio_target: laborNum, cogs_ratio_target: cogsNum })
        .eq('id', store.id);
      if (error) throw error;
      await refreshStore();
      Alert.alert('성공', '매장 정보가 저장되었습니다.');
    } catch (e: unknown) {
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>매장 정보</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>매장 이름</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="매장 이름"
          placeholderTextColor={Colors.gray400}
        />

        <Text style={styles.label}>목표 인건비율 (%)</Text>
        <TextInput
          style={styles.input}
          value={laborTarget}
          onChangeText={setLaborTarget}
          placeholder="30"
          placeholderTextColor={Colors.gray400}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>목표 매출원가율 (매입 비중, %)</Text>
        <TextInput
          style={styles.input}
          value={cogsTarget}
          onChangeText={setCogsTarget}
          placeholder="40"
          placeholderTextColor={Colors.gray400}
          keyboardType="decimal-pad"
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.disabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Text style={styles.saveBtnText}>저장</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 8, marginTop: 6 },
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: Colors.black,
  },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
