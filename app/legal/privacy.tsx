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

/** 개인정보처리방침 — 실제 서비스 배포 전 법률 검토가 필요한 초안입니다 */
export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="개인정보처리방침" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.updatedAt}>시행일 2026년 9월 14일</Text>

        <Section title="1. 수집하는 개인정보 항목">
          회원가입 시: 카카오 계정 이메일, 프로필 이름{'\n'}
          매장 운영 과정에서: 직원 이름·연락처·계좌정보(급여 지급용), 월별 입력 근무시간·급여 작성 및 수정 이력
        </Section>

        <Section title="2. 개인정보의 수집 및 이용목적">
          회원 식별 및 로그인, 근무시간 입력 및 급여·4대보험 계산, 매장 손익 집계, 서비스 개선을 위해
          이용합니다. 수집된 정보는 명시한 목적 범위를 초과하여 이용하지 않습니다.
        </Section>

        <Section title="3. 개인정보의 보유 및 이용기간">
          회원 탈퇴 시 지체 없이 파기합니다. 단, 근로기준법 등 관계 법령에 따라 급여·근태 관련 기록은
          해당 법령이 정한 기간(예: 3년) 동안 보존 후 파기합니다.
        </Section>

        <Section title="4. 개인정보의 제3자 제공">
          회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 근거가 있거나
          수사기관이 법령에 정해진 절차에 따라 요청하는 경우는 예외로 합니다.
        </Section>

        <Section title="5. 개인정보 처리 위탁">
          서비스 운영을 위해 클라우드 인프라(Supabase), 카카오 로그인, 토스플레이스 POS 연동 등
          외부 서비스에 처리를 위탁할 수 있으며, 위탁 시 관계 법령에 따라 필요한 사항을 규정합니다.
        </Section>

        <Section title="6. 이용자의 권리">
          이용자는 언제든지 자신의 개인정보를 조회·수정할 수 있으며, 회원 탈퇴를 통해 개인정보 삭제를
          요청할 수 있습니다. 앱에서 기기 위치와 출퇴근 기록을 새로 수집하지 않으며, 입력한 근무시간은 급여 작성과 수정 이력 확인에 사용됩니다.
        </Section>

        <Section title="7. 개인정보의 안전성 확보 조치">
          회사는 개인정보의 안전한 처리를 위해 접근권한 관리, 암호화 저장, 접속기록 보관 등의 조치를
          취하고 있습니다.
        </Section>

        <Section title="8. 문의처">
          개인정보 관련 문의는 서비스 내 고객센터 또는 등록된 이메일을 통해 접수받습니다.
        </Section>

        <Text style={styles.disclaimer}>
          ※ 이 정책은 서비스 준비 과정에서 작성된 초안이며, 정식 배포 전 법률 전문가의 검토를 받아야 합니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 20 },
  updatedAt: { fontSize: 12, fontWeight: '500', color: Colors.gray400 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.black },
  sectionBody: { fontSize: 13, fontWeight: '400', color: Colors.gray600, lineHeight: 20 },
  disclaimer: { fontSize: 11, fontWeight: '400', color: Colors.gray400, lineHeight: 16, marginTop: 8 },
});
