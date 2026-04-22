# n8n 워크플로우 에러 해결 기록

> 날짜: 2026-03-17

## 에러 1: `Module 'https' is disallowed`
- **상황:** Code Node에서 `require('https')`로 HTTP 호출 시도
- **원인:** n8n Code Node 샌드박스에서 `require()` 전체 차단
- **해결:** `fetch()` API로 교체 시도 → 에러 2로 이어짐

## 에러 2: `Module 'crypto' is disallowed`
- **상황:** `require('https')` 제거 후 `require('crypto')`도 차단 확인
- **원인:** n8n Code Node에서 모든 `require()` 호출 불가
- **해결:** Web Crypto API (`crypto.subtle`) 시도 → 에러 3으로 이어짐

## 에러 3: `crypto is not defined`
- **상황:** `crypto.subtle.importKey()` 사용 시도
- **원인:** n8n Code Node 샌드박스에서 글로벌 `crypto` 객체도 차단
- **해결:** 순수 JavaScript로 SHA-256 + HMAC-SHA256 직접 구현

## 에러 4: `fetch is not defined`
- **상황:** 순수 JS HMAC 성공 후, `fetch()`로 API 호출 시도
- **원인:** n8n Code Node 샌드박스에서 `fetch()`도 차단
- **참고:** 동일 n8n 인스턴스의 다른 워크플로우(가격 트래커)에서는 `fetch()` 동작함. `mode: "runOnceForAllItems"` 파라미터와 관련 의심했으나, 파라미터 제거 후에도 동일 에러.
- **근본 해결:** Code Node에서 HTTP 호출 포기 → **HTTP Request Node**(n8n 네이티브)로 API 호출 분리
  - Code Node: 서명 생성만 (순수 JS)
  - HTTP Request Node: 실제 API 호출
  - Code Node: 응답 데이터 추출

## 에러 5: `403 FORBIDDEN - IP not allowed (110.12.64.124)`
- **상황:** HTTP Request Node로 API 호출 성공, but 403 응답
- **원인:** n8n 서버 IP(`110.12.64.124`)가 쿠팡 API 화이트리스트에 미등록
- **해결:** 쿠팡 WING 포털에서 `110.12.64.124` IP 추가 등록

## 에러 6: `Sheet with ID 매출_누적 not found`
- **상황:** Google Sheets Node가 시트를 찾지 못함
- **원인:** `sheetName` 파라미터에서 `mode: "list"`를 사용했으나, 시트 이름이 아닌 GID(숫자)로 인식
- **해결:** `mode: "id"`로 변경하고 시트 GID(숫자) 직접 지정

## 에러 7: `Column names were updated after the node's setup`
- **상황:** "매출 분석" 시트에 데이터 쓰기 실패
- **원인:** 시트 1행에 타이틀 행("최근 30일 상세 주문 내역...")이 있어서 헤더를 잘못 인식. `headerRow: 2` 옵션은 n8n Google Sheets Node에서 미지원.
- **해결:** 시트 1행 타이틀 삭제 → 헤더가 1행이 되도록 변경

## 에러 8: `Could not get parameter - columns.schema`
- **상황:** Google Sheets Node `appendOrUpdate` + `autoMapInputData` 조합 에러
- **원인:** `autoMapInputData` 모드에서 `appendOrUpdate` 사용 시 schema 정의 필수
- **해결:** `mappingMode: "defineBelow"`로 변경 + 명시적 column schema 및 value 매핑

## 에러 9: `Unable to parse range: ''` (재고 시트 초기화)
- **상황:** Google Sheets `clear` 작업에서 범위 파싱 실패
- **원인:** `clear: "belowHeader"` 파라미터가 올바르게 작동하지 않음
- **해결:** `clear: "specificRows"` + `startIndex: 2` 옵션으로 변경

## 에러 10: 결제일시 Unix Timestamp 표시
- **상황:** 구글 시트에 결제일시가 `1773532980000` 같은 숫자로 표시
- **원인:** 쿠팡 API가 `paidAt`을 밀리초 Unix timestamp로 반환
- **해결:** 매출 데이터 추출 Code Node에서 `new Date(timestamp)` → `YYYY-MM-DD HH:mm:ss` 포맷 변환

---

## 핵심 교훈

### n8n Code Node 샌드박스 제한 사항
n8n Code Node에서 사용 **불가능**한 것:
- `require()` - 모든 모듈 (crypto, https, http, fs 등)
- `fetch()` - 글로벌 fetch API
- `crypto` - Web Crypto API (crypto.subtle)
- `XMLHttpRequest`

n8n Code Node에서 사용 **가능**한 것:
- 순수 JavaScript (변수, 함수, 루프, 조건문)
- `$input`, `$json`, `$('노드명')` - n8n 데이터 참조
- `DateTime` (Luxon) - 날짜 처리
- `new Date()`, `Math`, `JSON`, `Array`, `String` 등 기본 객체
- `TextEncoder` / `TextDecoder`

### 올바른 n8n 아키텍처 패턴
```
[1차 시도 - 실패] Code Node에서 모든 것을 처리 (HTTP + 서명 + 파싱)
[2차 시도 - 부분 성공] Code Node(서명) → HTTP Request Node(API 호출) → Code Node(파싱)
  → 문제: 페이지네이션 불가, UTC 날짜 어긋남
[최종 해결] Execute Command Node(Node.js 직접 실행) → Code Node(파싱) → Google Sheets
  → require('crypto'), require('https') 사용 가능, 페이지네이션 완전 지원
```

---

## 추가 에러 기록 (2026-03-18)

## 에러 11: Execute Command 전환 후에도 `fetch is not defined` 지속
- **상황:** Execute Command 기반으로 전환했지만 여전히 fetch 에러
- **원인:** n8n UI 브라우저 캐시 - 사용자가 새로고침하지 않으면 이전 Code Node 버전이 실행됨
- **해결:** n8n 페이지 새로고침(F5) 후 재실행. n8n은 MCP API 업데이트와 UI 캐시가 별도로 동작.

## 에러 12: 날짜 범위 UTC 기준 (3/18 데이터 누락)
- **상황:** 새벽 2시(KST) 실행 시 3/18 데이터가 수집되지 않음
- **원인:** Code Node의 `new Date()`가 UTC 반환. KST 새벽 2시 = UTC 17:00(3/17). `endDate=20260317`이 되어 3/18 미포함.
- **해결:** Execute Command 스크립트에서 `new Date(Date.now() + 9 * 3600000)` → KST 기준 날짜 계산

## 에러 13: 페이지네이션 미동작 (매출 50건만 수집)
- **상황:** 2일치 매출 ~260건 중 50건(첫 페이지)만 수집
- **원인:** Code Node → HTTP Request Node 구조에서는 루프 불가. HMAC 서명이 매 요청마다 달라져야 하므로 HTTP Request Node의 내장 페이지네이션도 사용 불가.
- **근본 해결:** Execute Command Node로 전환. 스크립트 내 `while(hasMore)` 루프로 nextToken 자동 처리. 295건 수집 성공.

## 에러 14: 재고 시트 Clear 시 헤더 삭제
- **상황:** Google Sheets `clear` 작업 후 1행 헤더가 사라짐
- **원인:** `clear: "allSheetContent"` 옵션이 헤더 포함 전체 삭제
- **해결 1차:** `clear: "specificRows"` + `startIndex: 2` → `Bad request` 에러
- **해결 2차:** `clear: "belowHeader"` → `Unable to parse range` 에러
- **최종 해결:** 기본 `clear` 옵션(파라미터 없이)이 동작. 헤더도 삭제되지만, 재고 수집 스크립트가 한글 key로 데이터 출력 → Google Sheets append가 한글 헤더 자동 생성.

## 에러 15: 재고 저장 `Could not retrieve the column data`
- **상황:** 재고 시트 Clear 후 append 시 컬럼 데이터 조회 실패
- **원인:** Clear가 헤더까지 삭제한 후, 재고 수집(Execute Command)이 영문 key(`skuId` 등)로 출력. append가 영문 헤더를 생성했지만 Sheets 노드의 스키마는 한글 헤더 기대.
- **해결:** 재고 수집 스크립트의 JSON key를 한글로 변경 (`옵션ID(SKU)` 등) + Sheets 노드 매핑도 한글로 통일.

## 에러 16: 매출 H/I열(판매금액, 결제일) 미입력
- **상황:** n8n이 A~G열만 쓰고 H(판매금액), I(결제일)열은 비어있음
- **원인:** 초기 설계 시 H/I열을 매핑하지 않음. 기존 수동 스크립트에서도 H/I열은 구글 시트 수식이었음.
- **해결:** 매출 파싱 Code Node에서 `salesAmount = qty * unitPrice`, `paidDate = YYYY. M. D` 포맷 계산 추가. Sheets 노드에 판매금액/결제일 컬럼 매핑 추가.

---

## 최종 아키텍처 교훈

### n8n에서 외부 API 호출 시 최적 패턴
```
[최적] Execute Command Node (node << 'ENDSCRIPT' ... ENDSCRIPT)
  - require('crypto'), require('https') 자유 사용
  - 페이지네이션 루프 가능
  - 타임존 직접 제어
  - 단점: 인라인 스크립트가 길어짐

[차선] Code Node(서명) → HTTP Request Node(호출) → Code Node(파싱)
  - 단순 API 호출에는 적합
  - 페이지네이션 불가
  - HMAC 등 동적 서명 재생성 필요 시 루프 불가

[불가] Code Node에서 직접 HTTP 호출
  - require(), fetch(), crypto 모두 차단
```

---

## 추가 에러 기록 (2026-03-23)

## 에러 17: n8n MCP updateNode 시 Google Sheets 노드 operation 초기화
- **상황:** n8n MCP API의 `updateNode`로 매출 분석 업데이트 노드의 `columns` 스키마만 업데이트했더니, 노드가 `read: sheet`로 표시되며 에러 발생
- **원인:** `updateNode`에서 `parameters.columns`만 전달하면 `operation`, `documentId`, `sheetName` 등 기존 파라미터가 덮어씌워져 기본값(`read`)으로 초기화됨
- **해결:** `updateNode` 시 `columns`뿐 아니라 `operation: "appendOrUpdate"`, `documentId`, `sheetName` 등 모든 필수 파라미터를 함께 전달
- **교훈:** n8n MCP `updateNode`의 `parameters`는 **부분 업데이트가 아닌 전체 교체(replace)**로 동작함. 변경하지 않는 파라미터도 반드시 포함해야 함. (2026-04-22 보강: dot-path 표기 `"parameters.authentication": "serviceAccount"` 형태로 전달 시에는 해당 필드만 갱신되고 나머지 parameters는 보존됨)

---

## 추가 에러 기록 (2026-04-22)

## 에러 18: Google Sheets OAuth2 refresh token 만료로 인한 무음 실패
- **상황:** n8n 워크플로우 `쿠팡 로켓그로스 매출/반품/재고 자동 수집 (매일 2시)` 가 매일 새벽 2시(KST) 정상적으로 트리거되고 실행 status도 `success`로 기록되지만, 구글 시트 `매출 분석` / `반품 및 취소 분석` 탭이 며칠간 업데이트되지 않음. 실행 리스트 화면상 오류 표시 없음.
- **탐지 방법:** 실행 ID 66735 (2026-04-21 17:00 UTC) 로그를 `mode: filtered`로 세부 조사 → `매출 분석 업데이트` 노드의 output JSON 내부에 `NodeApiError` 객체가 임베드돼 있는 것을 발견.
  ```
  "error": "The provided authorization grant (e.g., authorization code, resource owner
  credentials) or refresh token is invalid, expired, revoked, does not match the
  redirection URI used in the authorization request, or was issued to another client."
  "name": "NodeApiError"
  ```
- **원인 (3중 문제):**
  1. **OAuth refresh token 만료** — Google Sheets 노드의 `googleSheetsOAuth2Api` credential이 사용하던 refresh token이 Google 측에서 무효화됨. OAuth refresh token은 장기 미사용, 권한 변경, 특정 기간 경과 등으로 자동 폐기 가능.
  2. **n8n 노드의 silent error** — Google Sheets 노드가 `continueOnFail: true` 상태였고, 인증 오류를 throw하지 않고 output 객체에 담음 → n8n 실행 wrapper는 `success`로 마킹.
  3. **실행 조기 종료** — 매출 분석 업데이트 실패 후 다운스트림 `반품 분석 업데이트`, `재고 전체 처리`, `상품정보 업데이트` 등 7개 노드가 아예 실행되지 않음 (3/10만 실행). 병렬 구조여도 특정 브랜치 실패가 공유 Merge 노드(`대기`)에서 이어지는 하류 노드 실행을 막음.
- **해결 (Service Account 전환, 영구적 fix):**
  1. 기존 프로젝트에 이미 존재하던 서비스 계정 `coupang-gross@gen-lang-client-0189633150.iam.gserviceaccount.com` 재활용 (타겟 스프레드시트에 이미 편집자 권한 부여되어 있음).
  2. n8n UI에서 `Google Service Account API` 타입 credential 신규 등록 (ID: `WPlIfwYpUx3h0TpV`). Private Key는 `service-account.json`의 `private_key` 값을 파이썬 `json.load`로 추출해 실제 줄바꿈 포함 PEM 형식으로 변환 후 붙여넣기 (에스케이프된 `\n` 문자열 그대로 붙이면 `secretOrPrivateKey must be an asymmetric key when using RS256` 에러 발생).
  3. 매출 분석 업데이트 / 반품 분석 업데이트 두 노드에 `parameters.authentication = "serviceAccount"` 추가 + `credentials.googleApi` (신규 SA credential) 로 교체. MCP `n8n_update_partial_workflow`의 `updateNode` **dot-path 업데이트** 사용으로 기존 columns/schema/mapping 필드는 보존.
- **검증:** 실행 66741 (2026-04-22 05:55 UTC, 수동 트리거) — 전체 10/10 노드 모두 success. 매출 분석 42 rows, 반품 분석 2 rows 실제 시트 반영 확인.
- **교훈:**
  - **Service Account JWT 인증은 refresh token이 없어 만료 자체가 발생하지 않음.** 서비스 계정 키 파일만 유지되면 반영구적으로 동작 → 장기 배치 자동화에 OAuth2보다 적합.
  - n8n 실행 status "success"는 **워크플로우 wrapper 수준의 성공**이며, 노드 output 내부의 에러까지 보장하지 않음. 장기 자동화는 반드시 실제 데이터 적재 결과를 별도 모니터링해야 함 (시트 타임스탬프 / 행 증가 등).
  - `continueOnFail: true` 옵션이 설정된 노드는 인증 오류조차 조용히 넘어가므로, 중요 경로(쓰기 작업)에서는 이 옵션을 재고해야 함.
  - PEM private key를 UI에 붙여넣을 때 JSON 인코딩된 상태(`\n` 이스케이프)가 아닌 **실제 개행 포함 원본 PEM** 포맷이 필요. 파이썬 `json.load` 또는 `jq -r .private_key` 로 변환 후 사용.
