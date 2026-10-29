import { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useNotificationSettings } from '../../lib/hooks/useNotificationSettings';
import { NOTIFICATION_SETTING_DEFS, NotificationSettingDef } from '../../lib/services/notifications';
import { AppBar } from '../../lib/components/ui';

const GROUPS: NotificationSettingDef['group'][] = ['재고', '매출·손익'];

export default function NotificationSettingsScreen() {
  const { settings, loading, refetch, toggle } = useNotificationSettings();

  useEffect(() => { refetch(); }, [refetch]);

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="알림 설정" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <>
            {GROUPS.map(group => (
              <View key={group} style={styles.group}>
                <Text style={styles.groupTitle}>{group}</Text>
                <View style={styles.card}>
                  {NOTIFICATION_SETTING_DEFS.filter(d => d.group === group).map((def, i) => (
                    <View key={def.key} style={[styles.row, i > 0 && styles.rowBorder]}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>{def.label}</Text>
                        <Text style={styles.rowDesc}>{def.description}</Text>
                      </View>
                      <Switch
                        value={settings[def.key] ?? def.default}
                        onValueChange={v => toggle(def.key, v)}
                        trackColor={{ false: Colors.gray200, true: Colors.primary }}
                        thumbColor={Colors.white}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}

            <Text style={styles.footnote}>알림은 매장 단위로 적용돼요. 매장을 전환하면 해당 매장 설정이 표시돼요</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 20 },

  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray600 },
  card: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  rowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.homeBorder },
  rowText: { flex: 1, gap: 3 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Colors.black },
  rowDesc: { fontSize: 11, fontWeight: '400', color: Colors.gray400 },

  footnote: { fontSize: 11, fontWeight: '400', color: Colors.gray400, lineHeight: 16 },
});
