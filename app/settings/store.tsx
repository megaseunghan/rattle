import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, TextInput, Image, Modal, KeyboardAvoidingView, Platform, Pressable, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../lib/icons/AppIcon';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Illustration } from '../../lib/icons/Illustration';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { getErrorMessage } from '../../lib/utils/error';
import { deleteOwnedStore, updateStoreInfo } from '../../lib/services/stores';
import { formatRestoreDeadline } from '../../lib/utils/storeDeletion';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { AppBar, Button, Field } from '../../lib/components/ui';

export default function StoreInfoScreen() {
  const { store, user, access, canManageStore, refreshStore } = useAuth();
  const [name, setName] = useState(store?.name ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const reconcile = useRef(false);
  const [reconcileVersion, setReconcileVersion] = useState(0);
  const scope = useMemo(() => ({}), [store?.id, user?.id]);
  const currentScope = useRef<object | null>(scope);
  currentScope.current = scope;
  useEffect(() => { currentScope.current = scope; return () => { currentScope.current = null; }; }, [scope]);
  const [savedNeedsRefresh, setSavedNeedsRefresh] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletionLock = useRef(false);
  const screenActive = useRef(true);
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;
  useFocusEffect(useCallback(() => { screenActive.current = true; return () => { screenActive.current = false; }; }, []));
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; userId: string; scope: object } | null>(null);
  const [deletePhrase, setDeletePhrase] = useState('');
  const isAdmin = canManageStore;
  const isOwner = access.can_delete_store && store?.owner_id === user?.id;
  const validDeleteTarget = !!deleteTarget && isOwner && deleteTarget.scope === scope
    && deleteTarget.id === store?.id && deleteTarget.name === store?.name;
  const expectedPhrase = deleteTarget ? `${deleteTarget.name} 삭제하기` : '';
  useEffect(() => { setDeleteTarget(null); setDeletePhrase(''); }, [scope, store?.name, store?.owner_id, canManageStore]);
  function closeDelete() { if (!deletionLock.current) { setDeleteTarget(null); setDeletePhrase(''); } }


  useEffect(() => {
    if (!store) return;
    setName(store.name ?? '');
    setAddress(store.address ?? '');
  }, [scope]);

  useEffect(() => {
    if (!reconcile.current || saving || savedNeedsRefresh || !store) return;
    setName(store.name ?? ''); setAddress(store.address ?? '');
    reconcile.current = false;
  }, [store, saving, savedNeedsRefresh, reconcileVersion]);

  useEffect(() => { setSavedNeedsRefresh(false); reconcile.current = false; }, [scope]);

  async function handleSave() {
    if (!store || savingLock.current || savedNeedsRefresh || deletionLock.current || !isAdmin) return;
    if (!name.trim()) { Alert.alert('입력 오류', '매장 이름을 입력해주세요.'); return; }

    savingLock.current = true;
    setSaving(true);
    try {
      await updateStoreInfo(store.id, { name: name.trim(), address: address.trim() || null });
      if (currentScope.current !== scope) return;
      setSavedNeedsRefresh(true);
      try {
        reconcile.current = true;
        await refreshStore();
        if (currentScope.current !== scope) return;
        setSavedNeedsRefresh(false);
        setReconcileVersion(n => n + 1);
      } catch {
        if (currentScope.current !== scope) return;
        Alert.alert('저장 완료 · 새로고침 필요', '내용은 저장됐어요. 화면을 다시 불러와 확인해주세요.');
        return;
      }
      Alert.alert('저장 완료', '매장 정보가 저장되었습니다.');
    } catch (e: unknown) {
      if (currentScope.current !== scope) return;
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  function handleDeleteStore() {
    if (!store || !isOwner || savingLock.current || savedNeedsRefresh || deletionLock.current) return;
    Keyboard.dismiss();
    setDeletePhrase('');
    setDeleteTarget({ id: store.id, name: store.name, userId: user!.id, scope });
  }

  async function confirmDeleteStore() {
    if (!validDeleteTarget || !deleteTarget || deletePhrase !== expectedPhrase || deletionLock.current || savingLock.current) return;
    const target = deleteTarget;
    deletionLock.current = true;
    setDeleting(true);
    Keyboard.dismiss();
    try {
      const result = await deleteOwnedStore(target.id);
      if (currentScope.current !== target.scope) return;
      setDeleteTarget(null);
      setDeletePhrase('');
      try { await refreshStore(); } catch { /* The list screen can retry refresh after a successful delete. */ }
      if (result.mode === 'scheduled') {
        Alert.alert('매장을 삭제했어요', `${formatRestoreDeadline(result.purgeAfter)}까지 매장 선택 화면에서 복구할 수 있어요.`);
      }
      if (screenActive.current && currentUserId.current === target.userId) router.replace('/(auth)/select-store');
    } catch (e: unknown) {
      if (currentScope.current === target.scope) Alert.alert('삭제 실패', getErrorMessage(e));
    } finally {
      deletionLock.current = false;
      setDeleting(false);
    }
  }

  async function retryRefresh() {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    try { reconcile.current = true; await refreshStore(); if (currentScope.current === scope) { setSavedNeedsRefresh(false); setReconcileVersion(n => n + 1); } }
    catch { if (currentScope.current !== scope) return; Alert.alert('새로고침 실패', '저장된 내용은 유지돼요. 잠시 후 다시 불러와 주세요.'); }
    finally { savingLock.current = false; setSaving(false); }
  }

  return (
    <SafeAreaView style={styles.container}>
      <GlassBackdrop />
      <AppBar transparent title="매장 정보" onBack={() => router.back()} />
      {!isAdmin ? <Text style={styles.help}>매장 정보는 관리자만 수정할 수 있어요.</Text> :
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Text style={styles.sectionTitle}>기본 정보</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>매장명</Text>
          <TextInput accessibilityLabel="매장명" style={styles.input} editable={!saving && !savedNeedsRefresh && !deleting} value={name} onChangeText={setName} placeholder="매장 이름" placeholderTextColor={Colors.gray400} />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>매장 주소</Text>
          <TextInput accessibilityLabel="매장 주소" style={styles.input} editable={!saving && !savedNeedsRefresh && !deleting} value={address} onChangeText={setAddress} placeholder="도로명 주소 입력" placeholderTextColor={Colors.gray400} />
        </View>
        <Text style={[styles.sectionTitle, styles.operationsTitle]}>운영 설정</Text>
        <TouchableOpacity style={styles.settingRow} accessibilityRole="button" disabled={saving || deleting} onPress={() => router.push('/settings/sales')} activeOpacity={0.7}>
          <Illustration name="schedule" size={28} />
          <Text style={styles.rowLabel}>일 정산 시간</Text>
          <Text style={styles.rowValue}>매일 {store?.closing_time?.slice(0, 5) ?? '23:00'}</Text>
          <AppIcon name="chevron-forward" size={16} color={Colors.gray400} />
        </TouchableOpacity>
        {isOwner && <TouchableOpacity style={styles.settingRow} accessibilityRole="button" disabled={saving || deleting} onPress={() => router.push('/settings/store-visibility')} activeOpacity={0.7}>
          <Illustration name="profit-loss" size={28} /><Text style={styles.rowLabel}>열람 설정</Text><Text style={styles.rowValue}>공유 대상 설정</Text><AppIcon name="chevron-forward" size={16} color={Colors.gray400} />
        </TouchableOpacity>}
        {isOwner && <TouchableOpacity style={styles.settingRow} accessibilityRole="button" accessibilityLabel="매장 삭제" disabled={saving || deleting || savedNeedsRefresh} accessibilityState={{ disabled: saving || deleting || savedNeedsRefresh }} onPress={handleDeleteStore} activeOpacity={0.7}>
          <Image source={require('../../assets/icons/runtime/business/store-delete.png')} style={styles.deleteIcon} resizeMode="contain" accessible={false} />
          <Text style={[styles.rowLabel, styles.danger]}>매장 삭제</Text><AppIcon name="chevron-forward" size={16} color={Colors.gray400} />
        </TouchableOpacity>}
        {savedNeedsRefresh && <View style={styles.recovery}><Button label="저장된 정보 다시 불러오기" variant="secondary" onPress={() => void retryRefresh()} loading={saving} /></View>}
        <View style={styles.saveButtonWrap}><Button label={saving ? '저장 중...' : '저장하기'} variant="primary" onPress={handleSave} loading={saving} disabled={deleting || savedNeedsRefresh} /></View>
      </ScrollView>
      </KeyboardAvoidingView>}
      <Modal visible={validDeleteTarget} transparent animationType="fade" onRequestClose={closeDelete}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDelete} accessible={false} />
          <View style={styles.dialog} accessibilityViewIsModal onAccessibilityEscape={closeDelete}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogContent}>
              <Text accessibilityRole="header" style={styles.dialogTitle}>매장 삭제</Text>
              <Text style={styles.help}>‘{deleteTarget?.name}’ 매장을 삭제할까요? 모든 구성원이 바로 이 매장을 볼 수 없게 돼요. 7일 동안은 매장 선택 화면에서 복구할 수 있고, 그 뒤에는 직원·급여·매출 등 모든 기록이 완전히 삭제돼요. POS가 연결된 매장은 연결을 먼저 해제해야 해요.</Text>
              <Field label={`“${expectedPhrase}”를 입력해주세요.`} accessibilityLabel="삭제 확인 문구" value={deletePhrase} onChangeText={setDeletePhrase} editable={!deleting} autoCapitalize="none" autoCorrect={false} />
              <View style={styles.dialogActions}>
                <View style={styles.action}><Button label="취소" variant="text" onPress={closeDelete} disabled={deleting} /></View>
                <View style={styles.action}><Button label="삭제" variant="danger" onPress={() => void confirmDeleteStore()} loading={deleting} disabled={!validDeleteTarget || deletePhrase !== expectedPhrase || saving} /></View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  scroll: { paddingHorizontal: Spacing.screenX, paddingTop: 20, paddingBottom: 40 },
  sectionTitle: { fontFamily: Fonts.wantedRegular, fontSize: 12, color: Colors.gray500, marginBottom: 10 },
  operationsTitle: { marginTop: 26, marginBottom: 4 },
  field: { paddingTop: 12, paddingBottom: 18 },
  fieldLabel: { fontFamily: Fonts.wantedRegular, fontSize: 12, color: Colors.gray500, marginBottom: 9 },
  input: { fontFamily: Fonts.wantedRegular, fontSize: 17, color: Colors.black, minHeight: 44, paddingVertical: 6, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: Colors.homeBorder },
  settingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 68, gap: 12, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: Colors.homeBorder },
  rowLabel: { flex: 1, fontFamily: Fonts.wantedRegular, fontSize: 14, color: Colors.black },
  rowValue: { flexShrink: 1, fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.gray500 },
  deleteIcon: { width: 28, height: 28 },
  danger: { color: Colors.negative },
  recovery: { marginTop: 16 },
  saveButtonWrap: { marginTop: 30 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: Colors.overlay },
  dialog: { width: '100%', maxWidth: 360, maxHeight: '90%', backgroundColor: Colors.homeCanvas, borderRadius: 20, overflow: 'hidden' },
  dialogContent: { padding: 24, gap: 18 },
  dialogTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: 18, color: Colors.black },
  help: { fontFamily: Fonts.wantedRegular, fontSize: 13, lineHeight: 21, color: Colors.gray500 },
  dialogActions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
});
