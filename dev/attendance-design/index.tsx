import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FONT_ASSETS } from '../../constants/fonts';
import AttendanceDesign from './AttendanceDesign';
function DesignPreview() {
  const [loaded, error] = useFonts(FONT_ASSETS);
  if (!loaded && !error) return <ActivityIndicator />;
  return <SafeAreaProvider><AttendanceDesign /></SafeAreaProvider>;
}
registerRootComponent(DesignPreview);
