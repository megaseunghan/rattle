# 토스 포스 연동 기반 온보딩 자동화

기획 원문(2026-08-11)을 화면과 구현 순서에 매핑한 문서입니다.

## 핵심 타이밍 원칙 ⚠️

회원가입 시점엔 아직 토스 데이터가 **없습니다.** 주소·좌표·영업시간은 가맹점이 포스에서 서비스코드(`BVH3TUFV`)를 입력해 **웹훅이 도착한 뒤에만** 생깁니다. 따라서 자동화(2·3번)는 "회원가입 시"가 아니라 **"연동 완료(웹훅 도착) 직후"** 트리거해야 합니다.

## 플로우 → 화면 매핑

```
[회원가입 37]
 └ 1. "토스 포스 쓰시나요?" 분기            → 화면 43
      ├ 사용 안 함 → 기존 수동 흐름          → 화면 17 (주소·시간 직접 입력)
      └ 사용     → 서비스코드 안내·연동 대기  → 화면 44
                        │                     (10분 초과 → 화면 48)
              [가맹점이 포스에서 연동 → 웹훅 도착]
                        │
      ┌─────────────────┴─────────────────┐
      ▼                                    ▼
 2. 주소+좌표 자동 → 근태 매장위치 등록   3. 영업시간 자동 → 매출 시간대 설정
      │                                    │
      └─────────────┬──────────────────────┘
                    ▼
          자동입력 결과 확인               → 화면 45
                    ▼
          [매출 첫 동기화 완료]
                    ▼
          4. 손익계산서 튜토리얼 노출       → 화면 46
```

## 단계별 상세

### 1. 회원가입 시 토스 사용 분기 — 화면 43
- 가입/매장 생성 흐름(`app/(auth)/signup.tsx`, `select-store.tsx`)에 "토스 포스 사용/미사용" 선택 추가
- 사용 → 화면 44(서비스코드 안내), 미사용 → 화면 17(수동 입력)
- 웹훅 데이터: 없음 (순수 UI 분기) · 실현: ✅ 바로 가능

### 2. 주소·좌표 → 근태 매장 위치 자동 등록 — 화면 45 상단 카드
- 웹훅 `data.merchant.address`, `latitude`, `longitude` 사용 (야미옥 실측 확인됨)
- 근태(`app/attendance`, `settings/store-location`, `KakaoMap`)에 매장 위치 자동 세팅
- 화면 45에서 `자동입력` 뱃지(positive)로 표시
- 실현: ✅ 좌표 다 옴

### 3. 영업시간 → 매출 시간대(closing_time) 자동 설정 — 화면 45 하단 카드
- 웹훅 `data.merchant.operatingHours` 사용
- ⚠️ **야미옥은 `operatingHours: null` 이었음** → 항상 오지 않습니다
- fallback: null이면 기본값(23:00) 유지 + 사용자 조정 안내 → 화면 45에서 `기본값` 뱃지(중립) + 안내 문구("포스에서 영업시간 정보를 받지 못해 기본값으로 설정했어요. 매장 설정에서 바꿀 수 있어요")
- 값이 온 경우엔 `자동입력` 뱃지 + 안내 문구 제거
- 실현: ⚠️ 조건부 (fallback 필수)

### 4. 매출 첫 동기화 후 손익계산서 튜토리얼 — 화면 46
- 매출 첫 동기화 완료 감지 → 코치마크 3단계 노출 (1회만)
- `stores.onboarding_step`으로 재노출 제어
- 웹훅 데이터: 없음 (UX 트리거) · 실현: ✅ 가능

## 구현 관점 (해야 할 것)

- **웹훅 함수 확장** (`supabase/functions/toss-webhook`)
  - 설치 이벤트 매칭 시 `toss_merchant_id`뿐 아니라 `address` · `latitude` · `longitude` · `operatingHours`도 `stores`에 저장
- **stores 컬럼 확인/추가**
  - 좌표(`latitude`, `longitude`), 영업시간 저장 컬럼
- **온보딩 상태 플래그**
  - `stores.onboarding_step`(또는 유사) — 어디까지 왔는지 저장, 튜토리얼 재노출 제어
- **연동 대기 처리** (화면 44)
  - 웹훅 도착 감지: 폴링 또는 Supabase realtime 구독. 10분 타임아웃 → 화면 48

## 선행 작업 (이게 끝나야 온보딩 얹음)

1. **확인 매칭 SQL 적용** — `supabase/migrations/20260811_toss_confirm_matching.sql` (list_pending_toss_installations, confirm_toss_installation RPC) SQL Editor 실행 + `migration repair`
2. **야미옥 실연동 테스트** — 포스에서 서비스코드 입력 → 앱에서 확인 매칭 → 연동완료 확인

## 참고: 웹훅 이벤트 5종
앱 설치/설치해제 · 매장 · 카탈로그 · 주문 · 결제

설치 이벤트 실측 필드: `id`, `name`, `displayName`, `businessNumber`, `ownerName`, `phoneNumber`, `address`, `latitude`, `longitude`, `operatingHours`(null 가능), `attributes`

## 참고: 이미 완료된 연동 인프라
- 웹훅 함수 `toss-webhook` 배포됨 (서명검증·멱등·자동매칭·해제)
- 서명 시크릿 등록됨 · 서비스코드 `BVH3TUFV` (전사 공용, 하드코딩)
- DB: `toss_pending_installations`, `toss_webhook_events`, `normalize_biz_number`, `find_store_by_biznum`
