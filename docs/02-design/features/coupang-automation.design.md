# PDCA Design: 쿠팡 발주 자동화 (Coupang Order Automation)

> Status: Updated | Date: 2026-03-12 | Updated: 2026-04-22 | Feature: Order Automation + n8n Scheduling

## 1. System Architecture
The system consists of three main components:
1.  **Data Source (Google Sheets):** User-defined product info and automated analysis results.
2.  **Data Collector (Coupang WING API):** Fetches real-time stock and sales data.
3.  **Automation Engine (Playwright):** Executes the actual inbound shipment (order) on the WING portal.

## 2. Data Schema (Google Spreadsheet)

### Sheet: 상품정보 (Product Info)
| 열 | 컬럼명 | 소스 | 설명 |
| :--- | :--- | :--- | :--- |
| **A** | **운영여부** | **사용자** | **운영 / 미운영 (수동 입력)** |
| B | 등록상품ID | 사용자 | 쿠팡 등록상품 ID |
| C | 옵션ID | 사용자 | 쿠팡 옵션 ID |
| D | SKU ID | 사용자 | 쿠팡 SKU 식별자 (매핑 키) |
| E | 바코드 | 사용자 | 상품 바코드 |
| F | 등록상품명 | 사용자 | 상품명 |
| G | 옵션명 | 사용자 | 옵션명 |
| H | 입수량 | 사용자 | 박스당 수량 (EA) |
| I | 30일 일평균 | n8n 자동 | 최근 30일 일평균 판매량 |
| J | 7일 일평균 | n8n 자동 | 최근 7일 일평균 판매량 |
| K | 현 재고량 | n8n 자동 | 쿠팡 FC 현재 재고 |
| L | 품절 예상일 | n8n 자동 | 현 재고 ÷ 7일 일평균 |
| M | 운영 가능일 | n8n 자동 | 품절 예상일 - 오늘 (숫자만, 단위 없음) |
| N | 최근 30일 기준 재고 | n8n 자동 | I열 × 30 (30일치 재고량) |
| O | 최근 7일 기준 재고 | n8n 자동 | J열 × 30 (7일 트렌드 기반 30일치) |
| P | 최종 발주 참고 수량 | n8n 자동 | max(N열, O열) |
| Q | 최종 발주량 | n8n 자동 | 운영가능일 ≥ 30이면 "발주X", 아니면 ceil((P열 - K열) / H열) × H열 |
| R | 최종 발주량 (BOX) | n8n 자동 | 운영가능일 ≥ 30이면 "발주X", 아니면 Q열 ÷ H열 |
| **S** | **사용자 확정** | **n8n 초기값 + 사용자 수정** | **R열이 "발주X"면 0, 아니면 R열 값. 사용자가 최종 수정 → Playwright 발주 시 이 값 사용** |

## 3. Order Automation Flow (Playwright + Excel)

### 3.1 전체 흐름
```
[1] 구글 시트에서 발주 대상 계산 (n8n 자동 계산)
    상품정보 시트 I~R열 (A열=운영여부 추가로 한 칸 이동):
    → N열: 30일 일평균(I) × 30, O열: 7일 일평균(J) × 30
    → P열: max(N, O), Q열: ceil((P - 현재고(K)) / 입수량(H)) × H
    → M열: 운영 가능일(숫자), M열 ≥ 30이면 Q·R열="발주X" S열=0
    → M열 < 30이면 Q열: 발주량, R열: 박스 수, S열: R열 복사 (사용자 수정용)
            ↓
[2] Playwright: 쿠팡 WING 접속 (세션 저장으로 자동 로그인, MFA 시 수동 대기)
            ↓
[3] 입고관리 > 새로운 입고 생성 > 엑셀로 업로드하기 > 엑셀 다운로드
    → coupang_template.xlsx 저장
            ↓
[4] 엑셀 가공 (Node.js + ExcelJS)
    - coupang_template.xlsx 읽기
    - SKU ID(36열) 매칭 → 입고 수량(22열)에 발주수량 입력
    - 유통기한 필요 상품: 유통기한/제조일자 입력
    - coupang_upload_ready.xlsx 저장
            ↓
[5] Playwright: 가공된 엑셀 업로드 (input[type="file"])
            ↓
[6] 사용자 리뷰 대기 (봇 일시정지, 최종 확인 후 수동 제출)
            ↓
[7] 구글 시트 상태 업데이트 (Order Status → Done)
```

### 3.2 기존 스크립트
| 파일 | 역할 | 상태 |
|------|------|------|
| `order-automation.js` | Playwright 메인 (로그인→다운로드→가공→업로드) | 기본 동작 확인됨 |
| `process-excel.js` | ExcelJS로 발주수량 입력 (SKU ID 매칭) | 기본 동작 확인됨 |
| `index.js` | API 호출 + Playwright 통합 진입점 | 스켈레톤 |

### 3.3 엑셀 양식 구조 (`coupang_template.xlsx`)
- **시트 1: 로켓그로스 입고** (80개 상품, 데이터 5행~)
- **시트 2: 엑셀 일괄 입고요청 사용법 및 유의사항**

| 열 번호 | 컬럼명 | 용도 |
|---------|--------|------|
| 1 | No. | 순번 |
| 2 | 등록상품명 | 상품명 |
| 3 | 옵션명 | 옵션 |
| 7 | 옵션 ID | 쿠팡 옵션 식별자 |
| **22** | **입고 수량 입력 (필수)** | **발주수량 (1~5,000 정수)** |
| 24 | 유통기간 입력 (일) | 해당 시 필수 |
| 25 | 유통(소비)기한 | YYYY-MM-DD |
| 26 | 제조일자 | YYYY-MM-DD |
| 27 | 생산년도 | YYYY |
| **36** | **SKU ID** | **상품정보 시트 매칭 키** |

### 3.4 업로드 규칙 (쿠팡 유의사항)
| 규칙 | 내용 |
|------|------|
| 입고 수량 | 1~5,000 정수만. 미입력/유효하지 않으면 자동 누락 |
| 최대 옵션 | 200개까지 업로드 가능 (초과 시 오류) |
| 중복 입력 | 동일 옵션ID 중복 시 먼저 입력된 것만 적용 |
| 재업로드 | 기존 데이터 삭제, 최종 업로드 파일로 대체 |
| 유통기한 | 실물에 표기된 상품은 반드시 정확한 일자 입력 |

### 3.5 발주수량 계산 로직
```
[Step 1] 기준 재고 계산
  최근 30일 기준 재고(N열) = 30일 일평균(I열) × 30
  최근 7일 기준 재고(O열) = 7일 일평균(J열) × 30

[Step 2] 최종 발주 참고 수량
  최종 발주 참고 수량(P열) = max(N열, O열)

[Step 3] 운영가능일 필터
  if 운영가능일(M열) ≥ 30 또는 판매없음 → Q열="발주X", R열="발주X", S열=0
  if 운영가능일 < 30 → Step 4로

[Step 4] 최종 발주량 (입수량 단위 올림)
  필요수량 = P열 - 현재고량(K열)
  if 필요수량 ≤ 0 → 최종 발주량 = 0 (발주 불필요)
  if 필요수량 > 0 → 최종 발주량 = ceil(필요수량 / 입수량(H열)) × 입수량(H열)

[Step 5] 사용자 확정 (S열)
  S열 초기값 = R열(최종 발주량 BOX) 값 복사
  사용자가 S열을 검토/수정 → Playwright 발주 시 S열 값 사용

[발주 트리거 조건]
  운영여부="운영" 상품 중 운영가능일 < 7인 상품이 1개 이상 존재
  → 운영가능일 < 30인 모든 운영 상품을 한꺼번에 발주

[제약]
  쿠팡 엑셀 업로드: 1 ≤ 입고 수량 ≤ 5,000
  발주 대상: A열(운영여부) = "운영" AND S열 > 0

[예시] 30일 일평균=5, 7일 일평균=8, 현재고=131, 입수량=10, 운영가능일=16
  N = 5×30 = 150, O = 8×30 = 240
  P = max(150, 240) = 240
  필요수량 = 240-131 = 109
  최종 발주량 = ceil(109/10) × 10 = 110개 (11박스)
  S열(사용자 확정) = 11 (초기값, 사용자 수정 가능)
```

### 3.6 Safety
- **사용자 리뷰 필수:** 엑셀 업로드 후 최종 제출은 사용자가 수동으로 진행
- **세션 저장:** `user_data/` 디렉토리에 브라우저 세션 유지
- **Excel Number Type:** 입고 수량은 `Number()` 타입으로 강제 (Type 2)

## 4. API Integration (Node.js)
- **Endpoint:** `https://api-gateway.coupang.com`
- **Auth:** HMAC-SHA256 Signature (Custom Signature generator).
- **Rate Limiting:** Implemented 1.5s delay between requests to avoid 429 errors.
- **Pagination:** Automatic loop using `nextToken` to fetch thousands of records.
- **Key Methods:**
    - `GET /v2/providers/rg_open_api/apis/api/v1/vendors/{vendorId}/rg/orders` (Sales)
    - `GET /v2/providers/openapi/apis/api/v6/vendors/{vendorId}/returnRequests` (Returns/Cancellations)
    - `GET /v2/providers/rg_open_api/apis/api/v1/vendors/{vendorId}/rg/inventory/summaries` (Stock)

### 4.1 Inventory API 반환 필드 (2026-03-29 실측)
n8n 테스트 워크플로우로 실제 API 응답을 확인한 결과, 아이템당 반환 필드:
```json
{
  "vendorItemId": 92858936621,       // 옵션ID
  "vendorId": "A00003300",           // 벤더ID (고정)
  "salesCountMap": {
    "SALES_COUNT_LAST_THIRTY_DAYS": 399  // 최근 30일 판매수량 (현재 미수집)
  },
  "inventoryDetails": {
    "totalOrderableQuantity": 798     // 판매가능 재고 (수집 중)
  },
  "externalSkuId": 3570188           // 판매자상품코드 (수집 중)
}
```
- `inventoryDetails`에는 `totalOrderableQuantity` 1개 필드만 존재 (불량/보류 재고 필드 없음)
- 상품정보 시트 D열 "판매불가 재고(불량/보류)" 컬럼은 API 미제공으로 항상 0
- `salesCountMap.SALES_COUNT_LAST_THIRTY_DAYS`는 추가 수집 가능한 유일한 미수집 필드

### 4.2 WING 엑셀 다운로드 전용 데이터 (API 미제공)
쿠팡 WING > 재고 현황 > 엑셀 다운로드(`inventory_health_sku_info_*.xlsx`)에서만 제공되는 27개 컬럼:
| 컬럼 | API 제공 | 비고 |
|------|---------|------|
| 등록상품명 / 옵션명 | ❌ | |
| 상품등급 (NEW 등) | ❌ | |
| 입고예정재고 | ❌ | 발주 판단에 중요 |
| 아이템위너 | ❌ | |
| 최근 매출 7일/30일 (금액) | ❌ | |
| 최근 판매수량 7일 | ❌ | API는 30일만 |
| 추가입고 추천수량 | ❌ | 쿠팡 자체 추천 |
| 추가입고날짜 (입고예정일) | ❌ | |
| 재고예상 소진일 | ❌ | |
| 이번달 누적보관료 | ❌ | 비용 관리 |
| 보관기간별 재고 (6구간: 1~30일, 31~45일, 46~60일, 61~120일, 121~180일, 181일+) | ❌ | 장기재고 관리 |
| 고객반품 지난 30일 | ❌ | |
| 시즌관리 / 상품등록일 | ❌ | |

## 5. Security & Safety
- **IP Whitelisting:** Registered IPs in WING portal: `1.215.255.114` (local), `110.12.64.124` (n8n server).
- **MFA Handling:** Saved browser session in `user_data` directory.
- **Excel Formatting:** Forced Number Type (Type 2) for order quantities to ensure Coupang validation passes.
- **Google Sheets Auth (2026-04-22 unified):** 모든 Sheets 쓰기 노드는 **Service Account JWT** 방식으로 통일. Credential ID `WPlIfwYpUx3h0TpV` (n8n `Google Service Account API` 타입), Service Account `coupang-gross@gen-lang-client-0189633150.iam.gserviceaccount.com`. OAuth2 refresh token 만료로 인한 무음 실패 영구 차단 (에러 18 참고). 서비스 계정은 Sheets에 편집자 권한 부여 필수.
- **Service Account Key File:** `service-account.json` 로컬 보관 (`.gitignore` 등록됨, 권한 600 권장). n8n 서버에는 파일 없이 **n8n credential 저장소에만 보존** — Docker 컨테이너 재빌드 영향 없음.

## 6. n8n Workflow Architecture (Added 2026-03-17)

### 6.1 Overview
- **Workflow ID:** `n3KuSwGA5SfO7oV0`
- **Schedule:** 매일 새벽 2시 (KST)
- **n8n Instance:** `https://n8n.gongbaksoo.com` (Mac Mini, IP: `110.12.64.124`)
- **Total Nodes:** 10

### 6.2 Node Flow (v5 - 병렬 수집 + Merge 대기 + 상품정보 업데이트, 2026-03-22)
```
            ┌→ 매출 수집 → 매출 파싱 → 매출 분석 업데이트 ──┐
            │                                                  │
새벽2시 ───┼→ 반품 수집 → 반품 파싱 → 반품 분석 업데이트     ├→ 대기(Merge) → 상품정보 업데이트
            │                                                  │
            └→ 재고 전체 처리(2단계 상품명 매핑) ─────────────┘
```

### 6.3 Key Design Decisions
| 결정 | 이유 |
|------|------|
| **Execute Command Node** | Code Node 샌드박스에서 `require()`, `fetch()`, `crypto` 모두 차단 → 셸에서 Node.js 직접 실행으로 우회 |
| heredoc 스크립트 | `node << 'ENDSCRIPT'` 방식으로 인라인 Node.js 실행, 따옴표 이스케이프 문제 해결 |
| KST 날짜 계산 | `Date.now() + 9*3600000`으로 UTC → KST 보정 |
| 페이지네이션 완전 지원 | Execute Command 내 while 루프로 nextToken 자동 처리 |
| 매출 판매금액/결제일/수정일시 | 매출 파싱 Code Node에서 `qty * unitPrice` 계산 + 날짜 포맷 변환 + KST 수정 시간 |
| 매출/반품: appendOrUpdate | 주문번호/접수번호 기준 중복 방지 Upsert |
| 반품: RU + CC | 두 상태 모두 순차 수집 |
| 재고: 서비스 계정 JWT 직접 호출 | OAuth2 할당량과 분리. Execute Command에서 JWT 인증 → Sheets API Clear + Append 직접 수행 |
| 재고 상품명 2단계 매핑 | 1순위: 상품정보 시트(C열 옵션ID → F+G열 상품명), 2순위: 매출 분석 시트(D열→E열) 보충 |
| **병렬 실행 구조 (v4)** | **순차 실행 시 반품 0건이면 n8n이 다음 노드를 스킵 → 재고 미실행 버그. 트리거에서 3갈래 병렬로 해결** |
| **Merge 대기 노드 (v5)** | **매출/재고 두 브랜치 완료를 대기한 후 상품정보 업데이트 실행. 최신 데이터로 계산 보장** |
| 상품정보 자동 업데이트 | 매출 분석 시트에서 30일/7일 판매량 집계, 재고 시트에서 현 재고량 조회, 품절 예상일 = 현 재고 ÷ 7일 일평균 |
| 매출 분석 SKU ID 컬럼 | 매출 분석 C열에 삽입. 옵션ID 매칭 시트(A:옵션ID → C:SKU ID)에서 매핑하여 매출 수집 시 자동 입력 |
| **상품정보 SKU ID 기준 매핑 (v6)** | **상품정보 D열(SKU ID) ↔ 매출분석 C열(SKU ID) ↔ 재고 B열(판매자상품코드)로 통일** |
| **Service Account 단일화 (v7, 2026-04-22)** | **매출/반품 분석 업데이트 노드의 OAuth2 credential을 Service Account JWT로 교체. OAuth2 refresh token 만료 무음 실패 영구 해결. `parameters.authentication = "serviceAccount"` + `credentials.googleApi` 로 전환, 재고/상품정보 이미 SA JWT 사용 중이었으므로 워크플로우 전체 인증 방식 통일.** |

### 6.4 Google Sheets Mapping
| 시트명 | GID | 동작 | 매칭 키 | 열 |
|--------|-----|------|---------|-----|
| 매출 분석 | 1050492672 | appendOrUpdate | 주문번호(Order ID) | A~K (SKU ID, 판매금액, 결제일, 최근 수정일시 포함) |
| 반품 및 취소 분석 | 870651715 | appendOrUpdate | 접수번호 | A~I (최근 수정일시 포함) |
| 창고 실시간 재고 | 89346414 | Clear → Append (서비스 계정 JWT) | - | A~F (상품명, 최근 수정일시 포함) |
| 상품정보 | - | PUT 덮어쓰기 (서비스 계정 JWT) | SKU ID (D열 기준) | I~S (일평균, 재고, 품절예상일, 운영가능일, 기준재고, 발주참고, 발주량, BOX, 사용자확정) |

### 6.5 Architecture Evolution
| 버전 | 날짜 | 구조 | 문제 |
|------|------|------|------|
| v1 | 3/17 | Code Node (순수 JS HMAC + fetch) | `require()`, `fetch()`, `crypto` 모두 차단 |
| v1.5 | 3/17 | Code Node (순수 JS HMAC) + HTTP Request Node | 페이지네이션 불가, UTC 날짜 |
| v2 | 3/18 | Execute Command Node | OAuth2 할당량 초과 (매출 295건 Upsert가 분당 60회 한도 소진) |
| v3 | 3/18 | Execute Command + 서비스 계정 JWT | 재고를 서비스 계정으로 분리, 8노드로 최적화 |
| v4 | 3/22 | 병렬 실행 + 2단계 상품명 매핑 | 반품 0건 시 체인 끊김 해결, 상품정보 시트 우선 매핑 |
| v5 | 3/22 | 병렬 + Merge 대기 + 상품정보 업데이트 | 매출/재고 완료 후 일평균 판매량·품절 예상일 자동 계산, 10노드 |
| **v6** | **3/23** | **SKU ID 컬럼 추가 + SKU 기준 매핑** | **매출 분석 C열 SKU ID 삽입, 상품정보 업데이트 SKU ID 기준으로 통일** |
| **v7** | **4/22** | **Service Account 인증 단일화** | **매출/반품 분석 업데이트 OAuth2 → Service Account JWT. 에러 18의 refresh token 만료 무음 실패 영구 차단. 재고/상품정보와 동일 방식으로 통합** |

