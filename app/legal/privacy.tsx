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

/** 앱 내 개인정보처리방침 화면 */
export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="개인정보처리방침" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.updatedAt}>공지일 2026년 11월 20일 · 시행일 2026년 11월 27일</Text>
        <Text style={styles.notice}>
          1.1.0 개정 안내: QR 출퇴근과 증빙 첨부 기능에 맞춰 처리하는 정보와 이용 목적을 추가하고, 회원 탈퇴 및 매장 삭제 시 기록의 처리 방법을 명시했습니다.
        </Text>

        <Section title="1. 수집하는 정보">
          계정 정보: 이메일 또는 카카오·Google·Apple 로그인에 사용하는 계정 식별자, 제공에 동의한 이메일과 프로필 이름{'\n'}
          매장 정보: 매장명, 사업자번호, 대표자명·연락처, 주소 (POS 연결 시 가맹점 정보 수신){'\n'}
          직원·급여 정보: 매장 참여 또는 직원 등록 시 입력하는 이름·연락처·고용형태·입사일·급여 조건·은행·계좌정보, 일별·월별 입력 근무시간과 급여 작성·수정·확인 이력{'\n'}
          매장 업무 데이터: 매출·매입(품목별 또는 금액별 입력)·비용, 재고·레시피, 체크리스트·스케줄과 관련 작성·확인 이력{'\n'}
          QR 출퇴근: 직원과 매장 식별정보, 출근·퇴근 구분과 시각, 근무일, 입력 방식 및 정정 사유·처리 이력{'\n'}
          기기 등록: 직원 기기와 매장폰의 등록 식별자·이름, 등록·해제 이력, QR 인증에 필요한 값과 매장폰의 마지막 사용 시각{'\n'}
          거래 증빙: 매입·비용에 첨부한 사진 또는 PDF, 파일명·형식, 연결된 거래와 매장 정보. 파일 내용에 거래 상대방 등의 개인정보가 포함될 수 있습니다.{'\n\n'}
          매장폰은 카메라로 등록용 QR과 직원의 출퇴근 QR을 읽습니다. QR 출퇴근에는 기기 위치정보(GPS·Wi-Fi·기지국)를 수집하지 않습니다.
          증빙을 직접 촬영할 때는 카메라 접근을 요청합니다. 기존 사진이나 파일은 기기의 선택 화면에서 이용자가 선택한 항목만 첨부합니다.
          첨부 전 업무에 필요하지 않은 개인정보는 가려 주세요.
        </Section>

        <Section title="2. 정보의 이용 목적">
          회원 식별, 로그인, 매장 참여 신청·승인 및 권한 관리{'\n'}
          등록된 기기의 출퇴근 확인, 정정 처리, 근무시간과 급여 관리{'\n'}
          매입·비용과 증빙 대조, 매장 업무 기록과 손익 집계{'\n'}
          Toss Place POS 가맹점 연결과 매출 조회{'\n'}
          서비스 개선 및 오류 대응
        </Section>

        <Section title="3. 정보의 보관 및 파기">
          회원이 탈퇴하면 개인 계정 정보를 파기하고 매장 구성원 연결을 해제합니다. 매장 공용 업무 기록(거래·증빙·직원·급여·출퇴근)은
          사업주의 매장 관리를 위해 해당 매장에 남습니다.{'\n'}
          개별 기록의 삭제·열람·정정은 rattle.support@gmail.com 으로 요청할 수 있습니다. 운영자가 요청을 접수하고 해당 사업주와 협의하여 처리합니다.{'\n'}
          외부 로그인 연결 해제가 지연되면 처리에 필요한 식별자를 완료 시까지 보관합니다.{'\n'}
          소유자가 매장을 삭제할 때 업무 자료와 다른 구성원이 없는 빈 매장은 즉시 삭제됩니다. 그 밖의 매장은 삭제 신청 후 7일 안에
          소유자가 복구할 수 있습니다. 유예기간 안에 복구하지 않은 매장은 증빙 원본과 미리보기 파일을 파기 대상으로 예약하고,
          파일 삭제를 확인한 뒤 매장 기록을 파기합니다.{'\n'}
          처리 목적을 달성하거나 보유기간이 지난 개인정보는 파기합니다. 관계 법령에 따라 보존할 필요가 있으면 그 기간 동안 보관합니다.
        </Section>

        <Section title="4. 개인정보 처리 위탁 및 외부 연동">
          Supabase: 회원 인증, 매장 데이터 보관 및 증빙 파일의 비공개 저장. 증빙 열람 권한을 확인한 뒤 5분 동안 유효한 서명 링크를 발급합니다.{'\n'}
          Toss Place: 이용자가 POS를 연결하면 가맹점 식별정보를 받아 매장을 연결하고 매출 자료를 조회합니다.{'\n'}
          Kakao·Google·Apple: 소셜 로그인{'\n\n'}
          개인정보의 국외 이전에 해당하면 이전에 관한 사항을 고지합니다. 앱은 사용자의 동의나 법령상 근거 없이 위 목적을 벗어나
          개인정보를 제공하지 않습니다.
        </Section>

        <Section title="5. 사용자 권리">
          더보기 → 회원 탈퇴에서 계정 삭제를 요청할 수 있습니다. 아직 매장이 없거나 참여 승인을 기다리는 중이면 매장 선택 화면의
          회원 탈퇴를 이용해 주세요. 매장 소유자는 먼저 더보기 → 설정 → 멤버 관리에서 소유권을 이전하거나 매장을 삭제해야 합니다.
          Apple 로그인 계정은 본인 확인을 위한 재인증이 필요할 수 있습니다.{'\n'}
          앱을 이용하기 어려우면 문의 이메일로 삭제를 요청할 수 있습니다. 본인 확인 후 처리합니다.
        </Section>

        <Section title="6. 문의">
          개인정보 관련 문의: rattle.support@gmail.com{'\n'}
          비밀번호·인증번호·주민등록번호·전체 계좌번호는 이메일로 보내지 마세요.
        </Section>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 20 },
  updatedAt: { fontSize: 12, fontWeight: '500', color: Colors.gray400 },
  notice: { fontSize: 13, fontWeight: '500', color: Colors.gray600, lineHeight: 20 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.black },
  sectionBody: { fontSize: 13, fontWeight: '400', color: Colors.gray600, lineHeight: 20 },
});
