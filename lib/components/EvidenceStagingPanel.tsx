import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { EvidenceSelection } from '../types/evidence';
import { pickEvidenceSelections } from '../media/evidencePicker';
import { getErrorMessage } from '../utils/error';
import { EvidenceLocalPreview } from './EvidenceLocalPreview';

/** Local-only controlled draft. Its parent owns cache lifetime across review steps/save. */
export function EvidenceStagingPanel({ files, onChange, disabled = false, onPickingChange, edit = false }: {
  files: EvidenceSelection[]; onChange: (files: EvidenceSelection[]) => void; disabled?: boolean; edit?: boolean; onPickingChange?: (picking: boolean) => void;
}) {
  const [picking, setPicking] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onPickingChange?.(false); }; }, []);
  async function pick() {
    if (disabled || lock.current) return;
    lock.current = true; setPicking(true); onPickingChange?.(true); setError('');
    try {
      const selected = await pickEvidenceSelections(files.length, () => alive.current, true);
      if (alive.current && selected.length) onChange([...files, ...selected]);
    } catch (error) { if (alive.current) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      setError(/PERMISSION|DENIED/i.test(code) ? '사진 접근을 허용하거나 다른 파일을 선택해주세요.' : getErrorMessage(error));
    } }
    finally { lock.current = false; if (alive.current) { setPicking(false); onPickingChange?.(false); } }
  }
  return <View style={styles.container}>
    <Text style={styles.title}>증빙 자료</Text>
    <Text style={styles.help}>{edit ? '품목 수정 저장 후 사진을 증빙으로 올려요.' : '등록 전에는 기기에만 보관해요. 매입 등록 후 자동으로 업로드해요.'}</Text>
    <Text style={styles.help}>최대 10개 · 이미지 원본 25MiB · 사진·이미지만 선택</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <FlatList horizontal data={files} keyExtractor={file => file.id} initialNumToRender={3} maxToRenderPerBatch={3} windowSize={3} renderItem={({ item }) => <View style={styles.file}>
      <EvidenceLocalPreview selection={item} /><Text numberOfLines={2} style={styles.help}>{item.name}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.name} 선택 삭제`} disabled={disabled || picking} style={styles.button} onPress={() => onChange(files.filter(file => file.id !== item.id))}><Text style={styles.error}>삭제</Text></TouchableOpacity>
    </View>} />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="등록 전 증빙 선택" accessibilityState={{ disabled: disabled || picking }} disabled={disabled || picking} style={styles.button} onPress={pick}><Text style={styles.link}>{picking ? '파일 선택 중…' : '증빙 파일 선택'}</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 8, paddingVertical: 12 }, title: { fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.black },
  help: { fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.gray600 }, file: { width: 136, marginRight: 12 },
  button: { minHeight: 44, padding: 8, justifyContent: 'center' }, link: { color: Colors.action }, error: { color: Colors.danger },
});
