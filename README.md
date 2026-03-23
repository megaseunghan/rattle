# Rattle — 초기 프로젝트 파일

## 파일 복사 방법

`npx create-expo-app rattle --template blank-typescript` 로 프로젝트 생성 후,
아래 파일들을 rattle 폴더에 복사하세요.

### 폴더 구조
```
rattle/
├── app/
│   ├── _layout.tsx           # 루트 레이아웃
│   ├── (auth)/
│   │   ├── _layout.tsx       # 인증 레이아웃
│   │   ├── login.tsx         # 로그인 화면
│   │   └── select-store.tsx  # 매장 선택 화면
│   └── (tabs)/
│       ├── _layout.tsx       # 탭 네비게이션
│       ├── index.tsx         # 홈 대시보드
│       ├── orders.tsx        # 발주
│       ├── stock.tsx         # 재고
│       └── recipes.tsx       # 레시피
├── constants/
│   └── colors.ts             # 브랜드 컬러
├── lib/
│   └── supabase.ts           # Supabase 클라이언트
├── types/
│   └── index.ts              # TypeScript 타입 정의
├── supabase/
│   └── schema.sql            # DB 스키마 (SQL Editor에서 실행)
├── .env.example              # 환경변수 템플릿
└── README.md
```

### 환경변수 설정
1. `.env.example`을 `.env`로 복사
2. Supabase 프로젝트의 URL과 anon key를 입력
3. `.gitignore`에 `.env` 추가 확인

### DB 세팅
1. Supabase 대시보드 → SQL Editor
2. `supabase/schema.sql` 내용을 붙여넣고 실행
3. 테이블 7개 + RLS 정책 자동 생성됨

### 실행
```bash
npx expo start
```
