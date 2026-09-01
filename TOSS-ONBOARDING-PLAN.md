# Rattle — 토스 포스 연동 기반 온보딩 플로우 (기획)

> 작성: 2026-08-11 · 웹훅(서비스코드 방식)으로 받은 가맹점 데이터를 온보딩 자동화에 활용
> 선행 조건: 확인 매칭 방식 연동 완성 (아래 "선행 작업" 참고)

---

## 핵심 타이밍 원칙 ⚠️

회원가입 시점엔 아직 토스 데이터가 **없다**. 주소·좌표·영업시간은
가맹점이 포스에서 서비스코드(`BVH3TUFV`)를 입력해 **웹훅이 도착한 뒤에만** 생긴다.
→ 2·3번 자동화는 "회원가입 시"가 아니라 **"연동 완료(웹훅 도착) 직후"** 트리거.

---

## 온보딩 플로우

```
[회원가입]
 └ 1. "토스 포스 쓰시나요?" 분기
      ├ 사용 안 함 → 기존 수동 흐름 (주소·시간 직접 입력)
      └ 사용     → 서비스코드 BVH3TUFV 안내 → 연동 대기
                        │
              [가맹점이 포스에서 연동 → 웹훅 도착]
                        │
      ┌─────────────────┴─────────────────┐
      ▼                                    ▼
 2. 주소+좌표 자동 → 근태 매장위치 등록   3. 영업시간 자동 → 매출 시간대 설정
      │                                    │
      └─────────────┬──────────────────────┘
                    ▼
          [매출 첫 동기화 완료]
                    ▼
          4. 손익계산서 튜토리얼 노출
```

---

## 단계별 상세

### 1. 회원가입 시 토스 사용 분기
- 가입/매장 생성 흐름(`app/(auth)/signup.tsx`, `select-store.tsx`)에 "토스 포스 사용/미사용" 선택 추가
- 사용 → POS 연동 화면(서비스코드 안내)으로, 미사용 → 기존 수동 입력
- 웹훅 데이터: 없음 (순수 UI 분기) · 실현: ✅ 바로 가능

### 2. 주소·좌표 → 근태 매장 위치 자동 등록
- 웹훅 `data.merchant.address`, `latitude`, `longitude` 사용 (야미옥 실측 확인됨)
- 근태(`app/attendance`, `settings/store-location`, `KakaoMap`)에 매장 위치 자동 세팅
- 실현: ✅ 좌표 다 옴

### 3. 영업시간 → 매출 시간대(closing_time) 자동 설정
- 웹훅 `data.merchant.operatingHours` 사용
- ⚠️ **야미옥은 `operatingHours: null` 이었음** → 항상 오지 않음
- fallback: null이면 기존 기본값(23:00) 유지 + 사용자 조정 안내
- 실현: ⚠️ 조건부 (fallback 필수)

### 4. 매출 첫 동기화 후 손익계산서 튜토리얼
- 매출 첫 동기화 완료 감지 → 손익계산서 튜토리얼/코치마크 노출
- 웹훅 데이터: 없음 (UX 트리거) · 실현: ✅ 가능

---

## 구현 관점 (해야 할 것)

- **웹훅 함수 확장** (`supabase/functions/toss-webhook`)
  - 설치 이벤트 매칭 시 `toss_merchant_id`뿐 아니라
    `address` · `latitude` · `longitude` · `operatingHours`도 `stores`에 저장
- **stores 컬럼 확인/추가**
  - 좌표(`latitude`, `longitude`), 영업시간 저장 컬럼
- **온보딩 상태 플래그**
  - `stores.onboarding_step`(또는 유사) — 어디까지 왔는지 저장, 튜토리얼 재노출 제어

---

## 선행 작업 (이게 끝나야 온보딩 얹음)

1. **확인 매칭 SQL 적용** — `supabase/migrations/20260811_toss_confirm_matching.sql`
   (list_pending_toss_installations, confirm_toss_installation RPC) SQL Editor 실행 + `migration repair`
2. **야미옥 실연동 테스트** — 포스에서 서비스코드 입력 → 앱에서 확인 매칭 → 연동완료 확인

---

## 참고: 웹훅 이벤트 5종
앱 설치/설치해제 · 매장 · 카탈로그 · 주문 · 결제
설치 이벤트 실측 필드: id, name, displayName, businessNumber, ownerName,
phoneNumber, address, latitude, longitude, operatingHours(null 가능), attributes

## 참고: 이미 완료된 연동 인프라
- 웹훅 함수 `toss-webhook` 배포됨 (서명검증·멱등·자동매칭·해제)
- 서명 시크릿 등록됨 · 서비스코드 `BVH3TUFV` (전사 공용, 하드코딩)
- DB: toss_pending_installations, toss_webhook_events, normalize_biz_number, find_store_by_biznum
