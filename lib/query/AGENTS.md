# query

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

TanStack Query 기반 조회 캐시의 공용 기반이다. 단일 `queryClient`, 매장 범위 쿼리 키, 권한 거절 판정, 저장 후 취소·무효화, 로그아웃 시 전체 정리, 재무 요약 배치 조회, 알림 폴링, 레거시 POS 금액 캐시 정리를 담당한다. `app/_layout.tsx`에서 `RattleQueryProvider`가 `AuthProvider` 바깥을 감싼다.

## Key Files

| File | Description |
|------|-------------|
| `client.ts` | `queryClient`(staleTime 30초, 재시도 없음, 테스트 시 gc 무한), `queryKeys.store(scope, storeId, domain, ...)` = `['rattle', scope, storeId, domain, ...]`, `isAccessDenied`(42501/PGRST30x/401/403/권한 문구), `invalidateStoreData`(먼저 cancel 후 invalidate, `meta.storeIds` 지원), `clearQueryData` |
| `index.tsx` | `RattleQueryProvider`(AppState 기반 focusManager 연결), `useQueryScope()`(사용자·실제/현재 역할·미리보기·재무 권한·멤버 역할을 직렬화한 범위 문자열), `client.ts` 재수출 |
| `financial.ts` | 재무 요약 `financialSummaryOptions`/`fetchFinancialSummary`. 같은 tick의 요청을 `getFinancialSummaries`로 묶어 조회하고, 지난 달은 staleTime 5분 |
| `notificationPolling.ts` | 알림 쿼리 키별 30초 타이머·앱 활성 리스너를 하나만 유지하는 구독 관리자 |
| `legacyPosCache.ts` | 이전 버전이 AsyncStorage에 남긴 `pos_summaries_*` 금액 캐시만 삭제 |

## For AI Agents

### Working In This Directory

- 이 폴더는 공유 파일이다. 루트 규칙대로 한 작업에서 단일 소유자만 수정한다.
- 쿼리 키 구조(`'rattle'`, scope, storeId, domain 순서)를 바꾸면 `invalidateStoreData`의 위치 기반 필터와 모든 훅이 깨진다. 변경 시 사용처(`useQueryScope`/`queryKeys.store` 사용 파일 23곳)를 함께 검토한다.
- 저장 후 무효화는 반드시 cancel → invalidate 순서를 유지한다. 저장 전에 시작된 응답이 이전 값을 복원하면 안 된다.
- 범위(`useQueryScope`)에 계정·역할·미리보기·재무 권한을 빠뜨리지 않는다. 범위가 섞이면 다른 권한의 금액이 노출될 수 있다.
- 금액 캐시를 AsyncStorage 등 영속 저장소에 새로 두지 않는다(persist 플러그인 도입 금지). `legacyPosCache`는 정리 전용이다.
- 권한 거절(`isAccessDenied`)을 빈 데이터나 0원으로 바꾸지 않는다.

### Testing Requirements

- 대응 테스트: `__tests__/query/client.test.ts`, `__tests__/query/notificationPolling.test.ts`. 재무 요약 옵션·배치는 `__tests__/hooks/useProfitLossTrendChart.test.ts`, `__tests__/services/weeklyDashboardBatch.test.ts`, `__tests__/services/adminFinancialCoverage.test.ts`, 레거시 캐시는 `__tests__/hooks/usePosAnalyticsLoading.test.ts`.
- 실행: `npm test -- --runInBand --no-coverage __tests__/query`, `npm run typecheck`.

### Common Patterns

- 훅: `const scope = useQueryScope(); useQuery({ queryKey: queryKeys.store(scope, store.id, '<domain>', ...), enabled })`.
- 서비스 저장 후: `invalidateCachedStore(storeId, ['<domain>'])`(`lib/services/cacheInvalidation.ts`) → `invalidateStoreData`.

## Dependencies

### Internal

- `../contexts/AuthContext`(`useQueryScope`), `../services/homeFinancialSummary`(`financial.ts`)

### External

- `@tanstack/react-query`, `react-native`(`AppState`), `@react-native-async-storage/async-storage`(`legacyPosCache`)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.
