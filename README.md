# Rattle

소규모 식당/카페 사장님을 위한 모바일 관리 앱

## 주요 기능

- **발주 관리** — 거래처별 발주 등록 및 상태 추적
- **재고 관리** — 식자재 재고 현황 및 품절 임박 알림
- **레시피 관리** — 레시피별 원가/마진율 자동 계산
- **대시보드** — 매장 현황 한눈에 보기

## 기술 스택

- [Expo](https://expo.dev) SDK 55 + Expo Router
- React Native 0.83 / React 19
- TypeScript
- [Supabase](https://supabase.com) (Auth + PostgreSQL + RLS)

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env` 파일 생성:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. DB 스키마 적용

Supabase SQL Editor에서 `supabase/schema.sql` 실행

### 4. 앱 실행

```bash
npm start        # Expo dev server
npm run ios      # iOS 시뮬레이터
npm run android  # Android 에뮬레이터
```

## 프로젝트 구조

```
app/          # 라우트 (expo-router)
├── (auth)/   # 로그인, 매장 선택
└── (tabs)/   # 홈, 발주, 재고, 레시피
lib/
├── contexts/ # AuthContext
├── hooks/    # 도메인별 커스텀 훅
├── services/ # Supabase DB 접근 레이어
└── components/
types/        # 전역 타입 정의
supabase/     # DB 스키마
```

## 개발 가이드

[CLAUDE.md](./CLAUDE.md) 참고
