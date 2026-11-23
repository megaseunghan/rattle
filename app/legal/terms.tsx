import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { AppBar } from '../../lib/components/ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

/** 앱 내 이용약관 화면 */
export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="이용약관" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.updatedAt}>공지일 2026년 11월 20일 · 시행일 2026년 11월 27일</Text>
        <Text style={styles.notice}>
          1.1.0 개정 안내: 탈퇴 후 매장에 남는 공용 업무 기록의 범위와 개별 삭제 요청 방법을 제6조에 명시했습니다.
        </Text>

        <Section title="제1조 (목적)">
          이 약관은 Rattle 운영자(이하 "운영자")이 제공하는 매장 손익관리 서비스(이하 "서비스")의 이용과 관련하여
          운영자와 이용자 간의 권리, 의무 및 책임사항을 정함을 목적으로 합니다.
        </Section>

        <Section title="제2조 (정의)">
          "이용자"란 이 약관에 따라 운영자가 제공하는 서비스를 이용하는 매장 운영자 및 소속 직원을 말합니다.
          "매장"이란 이용자가 서비스 내에 등록한 사업장 단위를 말합니다.
        </Section>

        <Section title="제3조 (약관의 효력 및 변경)">
          운영자는 이 약관의 내용을 이용자가 쉽게 알 수 있도록 서비스 초기 화면에 게시합니다.
          운영자는 관련 법령을 위반하지 않는 범위에서 이 약관을 변경할 수 있으며, 변경된 약관은 적용일자 및
          변경사유를 명시하여 최소 7일 전 서비스 내 공지합니다.
        </Section>

        <Section title="제4조 (서비스의 제공)">
          운영자는 매출·매입·인건비·재고 등 매장 운영에 필요한 정보를 기록·집계·조회할 수 있는 기능을 제공합니다.
          운영자는 시스템 점검, 설비 장애 등 부득이한 사유가 있는 경우 서비스 제공을 일시적으로 중단할 수 있습니다.
        </Section>

        <Section title="제5조 (이용자의 의무)">
          이용자는 서비스에 등록하는 정보(매출·매입·직원 정보 등)의 정확성에 대한 책임을 집니다.
          이용자는 타인의 계정을 도용하거나 서비스를 부정한 목적으로 이용해서는 안 됩니다.
        </Section>

        <Section title="제6조 (계약 해지)">
          이용자는 언제든지 서비스 내 회원 탈퇴 기능을 통해 이용계약을 해지할 수 있습니다.
          회원이 탈퇴하면 개인 계정 정보를 파기하고 매장 구성원 연결을 해제합니다. 매장 공용 업무 기록(거래·증빙·직원·급여·출퇴근)은
          사업주의 매장 관리를 위해 해당 매장에 남습니다. 개별 기록의 삭제를 원하면 rattle.support@gmail.com 으로 요청해 주세요.
          운영자가 요청을 접수하고 해당 사업주와 협의하여 처리합니다. 개인정보의 보관과 파기는 개인정보처리방침을 따릅니다.
        </Section>

        <Section title="제7조 (책임의 제한)">
          운영자는 천재지변, 통신 장애 등 운영자의 귀책사유가 없는 사유로 서비스를 제공할 수 없는 경우
          책임을 지지 않습니다. 서비스에 기록된 정보를 바탕으로 한 이용자의 경영 판단에 대해서는
          운영자가 책임을 지지 않습니다.
        </Section>

        <Section title="제8조 (문의처)">
          약관에 대한 문의는 rattle.support@gmail.com 으로 접수받습니다.
        </Section>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 20 },
  notice: { fontSize: 13, fontWeight: '500', color: Colors.gray600, lineHeight: 20 },
  updatedAt: { fontSize: 12, fontWeight: '500', color: Colors.gray400 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.black },
  sectionBody: { fontSize: 13, fontWeight: '400', color: Colors.gray600, lineHeight: 20 },
});
