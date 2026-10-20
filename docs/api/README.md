# Rattle API 문서

프로젝트 루트에서 `npm run docs:api`를 실행하고 http://127.0.0.1:8732 를 연다.
`openapi.yaml`이 원본이며 Swagger UI는 같은 파일을 직접 읽는다. UI 라이브러리는 버전을 고정한 CDN에서 불러오므로 인터넷 연결이 필요하다.

문서는 조회 전용이다. 계정 삭제나 연동 신청을 실수로 실행하지 않도록 Try it out을 비활성화했다. 외부 Claude 아티팩트나 로그인은 필요하지 않다.

## 범위

현재 Edge Functions 5개를 문서화한다. PostgREST 테이블 CRUD와 RPC 전체 명세는 아직 포함하지 않는다.

## Toss 프록시 권한

- 사용자 JWT를 함수 내부에서 검증한다.
- 요청 가맹점 ID에 연결된 매장의 소유자 또는 승인된 멤버만 조회할 수 있다.
- 주문 목록·주문 상세·카탈로그 GET만 허용한다.
- 사용자 JWT/RLS로 매장과 멤버를 조회하며 서비스 역할 키를 사용하지 않는다.
- 목록 쿼리는 from/to/page/size, 카탈로그는 page/size만 허용한다. 주문 상세에는 쿼리를 허용하지 않는다.
- 리다이렉트는 따라가지 않는다.

코드 수정만으로 배포된 함수는 바뀌지 않는다. 대상 프로젝트 확인 후 `supabase functions deploy toss-proxy`로 배포하고 실제 계정으로 권한을 확인해야 한다.

`toss-webhook`은 HMAC 인증을 사용하므로 gateway JWT 검증을 끈 배포가 필요하다. 실제 원격 배포 설정은 이 문서 작성 과정에서 확인하지 않았다.
