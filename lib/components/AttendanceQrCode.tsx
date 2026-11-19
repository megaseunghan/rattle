import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '../../constants/colors';
export function AttendanceQrCode({ value, label }: { value: string; label: string }) {
  return <View style={s.qr} accessible accessibilityLabel={label}><QRCode value={value} size={172} color={Colors.black} backgroundColor={Colors.white} quietZone={16} /></View>;
}
const s = StyleSheet.create({ qr: { width: 220, height: 220, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, justifyContent: 'center', alignItems: 'center', marginBottom: 20 } });
