import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { CardStyle, Spacing, Type } from '../../constants/designTokens';
import type { AttendancePunchWithEmployee } from '../../types';
export function AttendanceRecordCard({ start, end }: { start?: AttendancePunchWithEmployee; end?: AttendancePunchWithEmployee }) {
  const label = (value?: string) => value ? `${end ? `${new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })} · ` : ''}${new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: true })}` : '아직 기록이 없어요';
  return <View style={s.card}><Text style={s.heading}>오늘 내 기록</Text>
    {!start && !end ? <Text style={s.note}>아직 오늘 출퇴근 기록이 없어요</Text> : <>
      <View style={s.row}><Text style={s.label}>출근</Text><Text style={s.time}>{label(start?.punched_at)}</Text></View>
      <View style={s.row}><Text style={s.label}>퇴근</Text><Text style={s.time}>{label(end?.punched_at)}</Text></View>
    </>}
  </View>;
}
const s = StyleSheet.create({ card: { ...CardStyle, padding: Spacing.cardPadding, gap: 14 }, heading: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.gray600 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, label: { fontFamily: Fonts.wantedMedium, fontSize: Type.lg, color: Colors.black },
  time: { fontFamily: Fonts.geistMedium, fontSize: Type.base, color: Colors.gray700 }, note: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, color: Colors.gray600, lineHeight: 22 }, });
