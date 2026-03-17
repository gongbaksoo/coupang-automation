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
[잘못된 방식] Code Node에서 모든 것을 처리 (HTTP + 서명 + 파싱)
[올바른 방식] Code Node(서명) → HTTP Request Node(API 호출) → Code Node(파싱)
```
