# QR·성능 통합 병합 결과 (2026-11-19)

작업 ID: task_94b94dcd9ccc. 담당: Codex, 프론트엔드·통합·DBA 관점 자체 검토 겸임. 사용자 지시로 다른 에이전트는 사용하지 않았으며 독립 검토 완료를 주장하지 않는다.

- 경로: `/Users/cookhan/rattle/.worktrees/release-20261119`
- 브랜치: `release/qr-perf-20261119`
- 병합 전 HEAD: `44a70269e21003b5cb14856fae6ea8974b3fd7c8`
- 병합 대상: `feature/qr-attendance`, `5d2e394daf7f558051609fc7965aee64f91146b8`
- 기준: 이미 진행 중이던 merge의 staged 변경 및 19개 unmerged 파일. 시작 시 별도 untracked 파일은 없었다. 원격 Git 최신 여부는 fetch로 재검증하지 않았다.
- 범위: 양쪽 기능 보존, 충돌 해결, 의존성 합집합, 로컬 검증, merge commit. push·PR·원격 쓰기·EAS·기기 조작은 실행하지 않았다.
- 공통 Notion 시작 페이지·최근 맥락 페이지는 연결 도구로 직접 조회했다. 이번 작업은 주어진 통합 지시와 실제 Git stage 2/3을 기준으로 수행했다.

## 충돌 파일별 해결

| 파일 | 해결 방식 |
|---|---|
| `__tests__/components/MoreDrawerMotion.test.tsx` | PR의 소제목/모션 검사와 QR의 미리보기 계정 변경·탈퇴 차단 검사를 모두 보존 |
| `__tests__/components/PurchaseSupplierFilters.test.tsx` | PR의 item_count 표시 및 0개 숨김 검사와 QR의 capability 회수 시 분류 관리 숨김 검사를 분리해 모두 보존 |
| `__tests__/components/StoreSettingsRecovery.test.tsx` | 저장 후 refresh 실패/복구·7일 삭제 검사는 보존하고 Auth mock에 QR canManageStore 및 owner capability 추가 |
| `__tests__/contexts/AuthContext.test.tsx` | bootstrap RPC/토큰 갱신 성능 검사와 QR 역할·회수·미리보기·기기 비밀 정리 검사를 모두 보존 |
| `__tests__/hooks/useHomeAlerts.test.ts` | 오늘 매출 변경 시 원본 재조회 방지와 memoized 경고 재계산 검사 모두 보존; 중복 mock 정의 제거 |
| `__tests__/hooks/useHomeFinancialCard.test.ts` | 요약 선행 및 idle 대기 두 검사 모두 보존 |
| `__tests__/services/homeFinancialTimeline.test.ts` | RPC 집계 동등성·권한 오류 차단 검사와 QR의 미정렬 원본 누적 검사 모두 보존 |
| `app/(auth)/select-store.tsx` | 7일 복구 동작 유지, QR 미리보기 쓰기/연속 요청 방어 추가 |
| `app/(tabs)/payroll.tsx` | PR의 useStoreWageHistory 재사용으로 중복 refetchHist 제거, QR 역할/실패 안내/자기 급여 관리 차단 보존; 아래 범위 격리 추가 |
| `app/settings/sales.tsx` | PR의 저장 후 읽기 복구·폼 동기화 보존, 관리자 판정은 QR canManageStore 적용 |
| `app/settings/store.tsx` | soft delete 확인 문구·7일 복구·저장 후 refresh 보존, QR canManageStore/can_delete_store 및 열람 설정 연결 |
| `docs/개인정보처리방침-보완안-2026-11-14.md` | 양쪽 변경 문안 보존; 초안·법적 미확인·공개 방침 미적용 상태 유지 |
| `lib/components/MoreDrawer.tsx` | PR의 드로어 구조/모션 보존, QR 열람 설정·점장 지정·매장폰 등록·미리보기 차단 통합 |
| `lib/contexts/AuthContext.tsx` | loadMyStores bootstrap으로 목록/원시 역할을 받은 후 QR 서버 access/visibility를 확인; 실패 시 owner 포함 닫힘; 요청 번호/AbortController·기기 정리·동일 사용자 TOKEN_REFRESHED 생략 결합 |
| `lib/hooks/useHomeAlerts.ts` | QR 날짜 경계/읽음/memoized 계산과 PR의 todaySales 변경 시 네트워크 재조회 방지 결합 |
| `lib/hooks/useHomeFinancialCard.ts` | QR capability·useMemo·idle과 PR의 summary.isSuccess 선행 조건 모두 사용; NULL labor/profit 보존 |
| `lib/services/stores.ts` | 양쪽 import와 bootstrap/soft-delete 서비스 및 revision 기반 열람 설정 저장 호환 API 보존 |
| `package.json` | test:sql 18개 최상위 명령의 중복 없는 합집합; 양쪽 dependencies/devDependencies 모두 대조 |
| `supabase/AGENTS.md` | 양쪽 지침과 PR의 RLS auth wrapping·RPC/앱 동등성 지침 모두 보존 |

## 중복 및 의미 충돌 조정

- payroll의 자체 wage-history 요청을 PR의 공용 훅 하나로 통합했다. 같은 범위의 탭 재방문은 기존 이력을 유지하며, 계정·권한 revision이 바뀌면 즉시 숨기고 이전 요청 응답을 버리도록 훅의 accessScope를 추가했다. 권한 없는 경우 조회용 storeId도 주지 않는다. 회귀 테스트는 변경 전 실패를 확인했다.
- bootstrap은 기존 함수 한 번으로 목록/원시 역할/구형 재무 허용값을 받는 계약을 유지한다. 실제 UI 권한은 QR의 access/visibility 두 RPC로 확인한다. 따라서 전체 인증 초기화가 단일 RPC라는 뜻은 아니다. 원시 admin/financial_access만으로 QR capability를 추정하지 않는다.
- posSyncCoordinator는 같은 파일의 자동 동기화 gate 하나를 유지하고 QR의 완료 구독/최근 30분·과거 6시간 정책을 결합했다. 별도 coordinator를 만들지 않았다.
- pos_skip_unchanged는 `20261117100000_pos_skip_unchanged.sql` 한 파일만 존재한다. 초기·탭 성능 코드는 QR에 이미 이식된 부분을 중복 추가하지 않았다. Tabs의 lazy mount/비활성 화면 동작과 스캐너 루트 분리·lazy Supabase facade를 보존했다.
- 홈 차트는 서버 get_home_daily_sources RPC와 기존 미배포(PGRST202) 호환 경로를 유지한다. 권한/서버 오류를 호환 경로로 우회하지 않는다. 차트 시작은 요약 성공과 idle 모두 필요하다.
- 요구 의존성: expo-camera `~55.0.23`, react-native-qrcode-svg `^6.3.54`, expo-keep-awake `~55.0.8`. npm install로 lockfile을 재생성했다. 자동 audit fix나 추가 버전 업그레이드는 하지 않았다.

## 마이그레이션 순서·덮어쓰기와 원격 증거

원격은 기존 감사 파일이 지목한 대상 프로젝트를 Supabase 연결로 **읽기만** 조회했다. migration 이력뿐 아니라 pg_proc 본문 해시/존재와 pg_policies를 대조했다. 이력 누락은 수동 SQL 적용 여부를 단정하는 근거가 아니므로 별도 확인했다.

| 대상 | 순서 및 최종 상태 |
|---|---|
| `get_daily_labor_sources` | 20261105020000 기본 → 20261118120000 QR daily_work → 20261118150000 labor_read_models. 최종 함수는 approved 일별 근무·월 명세 우선·자동 반영 실패 보존을 포함한다. 원격 body MD5 `379fa1a683afd124b7a5e5de954085e2`가 최종 로컬과 일치 |
| `get_financial_summaries_v2` | 기존 임금/반복 고정비 체인 → 20261118150000. 최종본은 QR daily fallback 및 미확인 labor NULL과 반복 고정비를 함께 보존한다. 원격 body MD5 `5f9e8e1df759ec365976c32add676f89` 일치. 150000 guard는 이전 body 해시를 요구하므로 이미 적용된 대상에 재실행하면 실패한다 |
| bootstrap | `20261118131000_store_bootstrap.sql` 단일 정의. 원격 함수 존재 및 body MD5 `57f6b4257c75777684cb9450fa8061be` 일치. 이력 목록에는 없지만 수동 적용된 것으로 판단 |
| 홈 daily sources | `20261118141000_home_daily_sources.sql` 단일 정의. 원격 함수 존재. 공백 제거 body MD5 `748a93c08c5382ec2d6eea983dfa7c0e` 일치(원격 들여쓰기만 다름). 수동 적용된 것으로 판단 |
| soft delete 복구 | 원격 restore_deleted_store 본문 MD5 `81fa3cbcc6d571ff4afc1c6d82557523`가 20261114120000 로컬과 일치. cron 스케줄 활성 여부는 이번 범위에서 확인하지 않음 |
| POS upsert | 최종 pos_skip_unchanged 정의 하나. 원격 이력에 같은 버전/이름 확인. 원격에는 별도 legacy Toss RPC의 revoke_anon_toss_order_upsert 이력(20261119100000)이 있으며, 아래 원문 보존 파일을 추가했다 |
| RLS auth initPlan | QR role_model_core·store_visibility·manager_rpc_policy가 직접 auth.uid 정책을 도입했다. 원격 5개 정책에서 bare call 확인. 기존 20261118120000 보정의 현재 효과는 확인되지 않아 새 `20261119120000_release_rls_auth_initplan.sql`을 추가했다. 의미·역할·명령을 바꾸지 않고 현재 정책 auth 호출만 감싼다. 이번 세션 미적용 |

조정자의 추가 지시(msg_9acb430f4db4, 2026-11-19)에 따라 타임스탬프 충돌 3쌍을 해결했다. QR 파일명은 원격 이력과 같게 유지하고, SQL Editor로 수동 적용된 PR 3개만 이름 변경했다. 세 파일 모두 병합 전 HEAD와 **본문 바이트가 동일**함을 비교했다.

| 기존 PR 파일 | 변경 후 파일 | 새 체인 위치 |
|---|---|---|
| `20261118120000_rls_auth_initplan.sql` | `20261118121000_rls_auth_initplan.sql` | QR daily_work 다음, scanner_pairing 이전 |
| `20261118130000_store_bootstrap.sql` | `20261118131000_store_bootstrap.sql` | scanner_pairing 다음, auto_apply 이전 |
| `20261118140000_home_daily_sources.sql` | `20261118141000_home_daily_sources.sql` | auto_apply 다음, labor_read_models 이전 |

스크립트 참조 및 baseline의 설명 문구만 새 이름으로 갱신했다(baseline files 목록은 보존). 현재 14자리 버전 중복은 0개다. 기존 8자리 중복 접두/수동 SQL 관행까지 CLI용으로 정비한 것은 아니다. PR/QR 세 파일은 원격에서 다시 실행하지 않았다. 조정자는 실제 수동 적용 순서가 #132·#134 이후 QR 140000 이전임을 확인했다. 파일 이름 변경은 적용 상태 변경이 아니다.

전달받은 `/private/tmp/.../scratchpad/toss-revoke.sql`은 `20261119100000_revoke_anon_toss_order_upsert.sql`로 원문 그대로 복사했다. 원격 이력의 같은 이름/버전을 확인했고, 실제 대상은 legacy `upsert_toss_order_with_items`의 PUBLIC/anon EXECUTE 회수다. `upsert_pos_order_batch` 함수 변경으로 해석하지 않는다.

새 순서의 QR PGlite 통합 체인에 121000 initPlan → scanner_pairing → 131000 bootstrap → auto_apply → 141000 home_daily_sources → 최종 labor_read_models → join_wage → 신규 forward repair를 연결했다. 초기 보정 후 QR 정책의 bare auth가 0개이며 최종 보정 뒤에도 정책 이름·역할·명령·permissive·USING/WITH CHECK 존재 여부가 유지되고 bare auth 0개임을 확인했다. RPC 생성/실행과 기존 QR 자동 급여·POS 호환 검사가 같은 fixture에서 통과했다.


이번 세션에서 추가한 SQL 중 원격 미적용은 `20261119120000_release_rls_auth_initplan.sql` 한 개다. QR 17100000 및 17130000~18160000 이력은 조회로 확인했다. 초기 QR/fixes/retry_guard 등 이력에 없는 파일 전체의 과거 실행 여부는 추가 정의 대조 없이 미적용으로 단정하지 않았다. 기존 파일 전체 재적용은 권하지 않는다.

RLS 정적 검사는 기존 baseline JSON을 늘리지 않았다. 이미 배포된 QR 3개 파일은 SHA-256으로 원본을 고정하고, 새 forward repair가 검증된 원래 변환을 정확히 포함하며 뒤 순서인지 검사한다. 그 외 파일의 bare auth 정책은 계속 실패한다. PGlite에서 보정 뒤 추가된 bare 정책을 새 파일로 다시 보정하고 재실행 안전성·행 접근·정책 속성을 확인했다.

DBA 관점 자체 검토: 새 보정은 자료/급여 원본을 쓰거나 권한을 넓히지 않고 현재 public 정책 식만 ALTER한다. 기존 USING/WITH CHECK·역할·명령을 보존하고 재실행 시 추가 변경이 없다. 실제 운영 잠금 시간과 동시 트랜잭션은 검증하지 않았으며 원격 적용 전 별도 검토가 필요하다.

## 검증

홈 NULL 회귀도 직접 확인했다. 월 summary의 laborCost/operatingProfit과 일별 차트의 labor/profit이 NULL일 때 카드·차트 모두 NULL을 유지한다. 기존 SQL 체인은 저장 명세 우선, approved daily fallback, 자동 반영 실패의 NULL을 함께 검증한다.

환경: macOS 로컬, Node v20.20.1 / npm 10.8.2, 2026-11-19 KST, 위 두 parent와 충돌 해결 dirty 기준. DB 검증은 PGlite 축약 스키마·가상 데이터이며 운영 DB 쓰기/실기기 검증을 대신하지 않는다.

| 명령 | 결과 |
|---|---|
| `npm install` | 통과, lockfile 재생성. 기존 의존성 audit 안내 39건(자동 수정 안 함) |
| `npm run typecheck` | 통과 |
| `npx jest --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/' '/__tests__/setup\.ts' '<rootDir>/supabase/functions/' '<rootDir>/dev/'` | 통과: 180 suites, 1434 tests, 0 snapshots, 43.503s; `jest.log` 참조 |
| `npm run test:sql` | 통과, 최상위 18명령과 내부 연결 QR/자동 반영/합류 검증 통과 |
| `node scripts/validate-screen-coverage.mjs` | 알려진 S45 `app/attendance/review.tsx`, S46 `app/settings/attendance-devices.tsx` 미존재로 실패. 별도 대조 결과 그 외 unmapped route/중복 ID/필수 필드 누락 없음 |
| `git diff --check` | 통과 |

보관 로그는 줄 끝 공백/빈 끝줄만 정리했다(원본 `/tmp/rattle-release-*.log`). 전체 Jest 로그의 React act 경고 등은 테스트 실패와 구분한다. 네이티브 화면·기기·실제 로그인·동시성·EAS 수신은 명시 금지 범위여서 미실행이다. S45/S46은 이번 통합에서 구현하지 않았다.

후속: 별도 승인된 적용 작업에서 “Supabase에서 SQL 적용을 진행해줘”와 함께 `20261119120000_release_rls_auth_initplan.sql` **한 파일만** 전달하고, 적용 후 5개 정책의 auth wrapping과 역할별 접근을 재조회한다. 이번 보고는 적용 승인을 대신하지 않는다.
