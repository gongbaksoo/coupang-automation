# PDCA Design: 쿠팡 발주 자동화 (Coupang Order Automation)

> Status: Updated | Date: 2026-03-12 | Updated: 2026-03-24 | Feature: Order Automation + n8n Scheduling

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
| Q | 최종 발주량 | n8n 자동 | ceil((P열 - K열) / H열) × H열, 0 이하면 0 |
| R | 최종 발주량 (BOX) | n8n 자동 | Q열 ÷ H열 (박스 수) |

## 3. Order Automation Flow (Playwright + Excel)

### 3.1 전체 흐름
```
[1] 구글 시트에서 발주 대상 계산 (n8n 자동 계산)
    상품정보 시트 I~R열 (A열=운영여부 추가로 한 칸 이동):
    → N열: 30일 일평균(I) × 30, O열: 7일 일평균(J) × 30
    → P열: max(N, O), Q열: ceil((P - 현재고(K)) / 입수량(H)) × H
    → M열: 운영 가능일(숫자), Q열 > 0이고 A열=운영인 상품이 발주 대상, R열: 박스 수
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

[Step 3] 최종 발주량 (입수량 단위 올림)
  필요수량 = P열 - 현재고량(K열)
  if 필요수량 ≤ 0 → 최종 발주량 = 0 (발주 불필요)
  if 필요수량 > 0 → 최종 발주량 = ceil(필요수량 / 입수량(H열)) × 입수량(H열)

[제약]
  쿠팡 엑셀 업로드: 1 ≤ 입고 수량 ≤ 5,000
  발주 대상: A열(운영여부) = "운영" AND Q열 > 0

[예시] 30일 일평균=5, 7일 일평균=8, 현재고=131, 입수량=10
  N = 5×30 = 150, O = 8×30 = 240
  P = max(150, 240) = 240
  필요수량 = 240-131 = 109
  최종 발주량 = ceil(109/10) × 10 = 110개 (11박스)
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

## 5. Security & Safety
- **IP Whitelisting:** Registered IPs in WING portal: `1.215.255.114` (local), `110.12.64.124` (n8n server).
- **MFA Handling:** Saved browser session in `user_data` directory.
- **Excel Formatting:** Forced Number Type (Type 2) for order quantities to ensure Coupang validation passes.

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

### 6.4 Google Sheets Mapping
| 시트명 | GID | 동작 | 매칭 키 | 열 |
|--------|-----|------|---------|-----|
| 매출 분석 | 1050492672 | appendOrUpdate | 주문번호(Order ID) | A~K (SKU ID, 판매금액, 결제일, 최근 수정일시 포함) |
| 반품 및 취소 분석 | 870651715 | appendOrUpdate | 접수번호 | A~I (최근 수정일시 포함) |
| 창고 실시간 재고 | 89346414 | Clear → Append (서비스 계정 JWT) | - | A~F (상품명, 최근 수정일시 포함) |
| 상품정보 | - | PUT 덮어쓰기 (서비스 계정 JWT) | SKU ID (D열 기준) | I~R (일평균, 재고, 품절예상일, 운영가능일, 기준재고, 발주참고, 발주량, BOX) |

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

