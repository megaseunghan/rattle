# settings

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

계정·매장 단위 설정 화면 모음. 진입점은 탭 셸의 더보기 드로어(`lib/components/MoreDrawer.tsx`)와 매장 정보 화면 내부 링크다. 대부분 관리자 또는 매장 소유자 전용이며, 저장 성공과 이후 재조회 실패를 구분해 중복 쓰기를 막는 패턴을 쓴다.

## Key Files

| File | Description |
|---|---|
| `account.tsx` | 계정 정보(이름 등) 수정. `updateUserProfile` |
| `password.tsx` | 비밀번호 변경. `updateUserPassword` |
| `store.tsx` | 매장 정보(이름·주소) 수정(`updateStoreInfo`), `/settings/sales`·`/settings/financial-sharing`(소유자만) 이동, 소유자 전용 매장 삭제 — `"{매장명} 삭제하기"` 입력 확인 후 `deleteOwnedStore`(복구 기한 안내 `formatRestoreDeadline`), 완료 시 `/(auth)/select-store` |
| `sales.tsx` | 일 정산 마감 시간 설정(`ClosingTimeWheel`, `updateStoreClosingTime`). 관리자만 수정, 그 외에는 안내 문구 |
| `financial-sharing.tsx` | 손익 공유 범위(`FinancialSharingChoices`, `FINANCIAL_SHARE_OPTIONS`). 소유자 본인(`devPreviewMode === 'self'`)만 저장. 저장 후 `clearQueryData`·`refreshStore` |
| `members.tsx` | 멤버 관리. 참여 코드 생성, 합류 승인(`useMemberApproval` + `MemberApprovalModal`), 거절·내보내기, 소유권 이전(`transferStoreOwnership`, 소유자만) |
| `pos-sync.tsx` | TossPos 연동 상태 확인(`getStoreDetails`의 `toss_merchant_id`). 관리자 전용(루트 레이아웃에서도 차단). `?setup=1`이면 매장 생성 직후 흐름으로 보고 나가기 시 `/(tabs)`로 replace |
| `home-workflow.tsx` | 홈 업무(체크리스트) 편집 기존 URL 유지용 래퍼. `HomeWorkflowEditor`를 `initialPhase="open"`으로 재사용 |

## For AI Agents

### Working In This Directory

- 권한은 화면에서도 다시 확인한다: 관리자 `currentRole === 'admin'`, 소유자 `store.owner_id === user.id`. 메뉴 노출 조건(`MoreDrawer`)과 화면 조건을 함께 맞추고 서버 RLS/RPC 권한을 별도로 확인한다.
- 저장 흐름은 `saving` 잠금 ref + `useConfirmLeave(dirty || saving, { blockLeave: saving })`를 사용한다. 쓰기 성공 후 `refreshStore` 실패는 "저장됨, 새로고침 필요"로 표시하고 재저장을 유도하지 않는다(`savedNeedsRefresh`, `refreshFailed` 패턴).
- 매장 전환·계정 전환 중 늦게 온 응답이 다른 매장 화면에 반영되지 않도록 scope 객체·request 번호·`currentStoreId` ref 비교를 유지한다.
- 매장 삭제는 소프트 삭제 + 복구 기한 구조다(`lib/utils/storeDeletion.ts`, `select-store`의 복구 목록). 확인 문구·대상 매장 일치 검사를 약화하지 않는다.
- 손익 공유 기본값·기존 매장 값 정책은 루트 `AGENTS.md`「최초 설정·공유」를 따른다.
- POS 연동 화면은 안내·상태 확인이며 연결 성공을 임의로 표시하지 않는다. Toss 호출은 `toss-proxy` 경유.
- 탈퇴는 이 폴더가 아니라 `MoreDrawer`에서 시작된다.

### Testing Requirements

- `npm run typecheck`
- `__tests__/components/StoreSettingsRecovery.test.tsx`(store·sales), `FinancialSharingScreen.test.tsx`, `HomeWorkflowScreen.test.tsx`, `PosSetupScreen.test.tsx`, `MemberApprovalModal.test.tsx`
- 관련 서비스/훅: `__tests__/services/storeDeletion.test.ts`, `__tests__/services/account.test.ts`, `__tests__/hooks/useStoreMembers.test.ts`, `__tests__/hooks/useMemberApproval.test.ts`, `__tests__/utils/financialSharing.test.ts`
- 실행: `npm test -- --runInBand --no-coverage __tests__/components/StoreSettingsRecovery.test.tsx`
- 매장 삭제·소유권 이전·멤버 거절은 실제 DB 쓰기다. 가상 매장·QA 계정 범위를 먼저 정한다.

### Common Patterns

- 화면 구조: `SafeAreaView` + `GlassBackdrop` + `AppBar title onBack` + 설정 행(`TouchableOpacity`, `accessibilityRole="button"`).
- 오류 안내: `getErrorMessage(e, '<다음 행동 안내>')`, 목록 오류는 `ErrorMessage`.

## Dependencies

### Internal

- `lib/services/{stores,storeMembers,profile}`, `lib/hooks/{useStoreMembers,useMemberApproval,useConfirmLeave}`
- `lib/components/{FinancialSharingChoices,MemberApprovalModal,ClosingTimeWheel,HomeWorkflowEditor,GlassBackdrop,ErrorMessage,ui}`
- `lib/utils/{financialSharing,storeDeletion,error}`, `lib/query/client`, `lib/contexts/AuthContext`

### External

- `expo-router`(`useFocusEffect`, `useLocalSearchParams`), `react-native-safe-area-context`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.
