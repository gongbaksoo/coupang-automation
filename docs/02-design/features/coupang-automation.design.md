# PDCA Design: 쿠팡 발주 자동화 (Coupang Order Automation)

> Status: Updated | Date: 2026-03-12 | Updated: 2026-03-23 | Feature: Order Automation + n8n Scheduling

## 1. System Architecture
The system consists of three main components:
1.  **Data Source (Google Sheets):** User-defined product info and automated analysis results.
2.  **Data Collector (Coupang WING API):** Fetches real-time stock and sales data.
3.  **Automation Engine (Playwright):** Executes the actual inbound shipment (order) on the WING portal.

## 2. Data Schema (Google Spreadsheet)

### Sheet 1: [Product Info] (User Input)
| Column | Description | Example |
| :--- | :--- | :--- |
| SKU ID | Coupang SKU Identifier | 12345678 |
| Product Name | Name of the product | A-Product |
| Box Quantity (EA) | Units per box | 20 |
| Min Stock Level | Safety stock threshold | 100 |
| Max Stock Level | Target stock level | 500 |

### Sheet 2: [Analysis & Order] (Automated)
| Column | Description | Source |
| :--- | :--- | :--- |
| SKU ID | Product Identifier | API |
| Current Stock | Stock in Coupang FC | API |
| 7-Day Sales | Sales for the last 7 days | API |
| Predicted Out-of-Stock | Estimated days left | Calculation |
| Required Quantity (EA) | (Max - Current) | Calculation |
| **Order Boxes** | **Required / Box Qty (Rounded)** | **Calculation** |
| **Order Status** | **[Pending / Approved / Done]** | **User/Bot** |

## 3. Automation Flow (Playwright)

1.  **Login:** Access WING portal -> User handles MFA (Session saved).
2.  **Navigation:** Move to `로켓그로스 > 입고관리 > 입고 생성`.
3.  **Data Entry:**
    *   Read Google Sheet where `Order Status == 'Approved'`.
    *   Search SKU -> Input `Order Boxes` quantity.
    *   Select FC (Fulfillment Center) based on Coupang's recommendation.
4.  **Confirmation:** Bot pauses at the final "Submit" screen for user review.
5.  **Logging:** Update Google Sheet `Order Status` to 'Done' after success.

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
| 재고 상품명 2단계 매핑 | 1순위: 상품정보 시트(B열 옵션ID → E+F열 상품명), 2순위: 매출 분석 시트(C열→D열) 보충 |
| **병렬 실행 구조 (v4)** | **순차 실행 시 반품 0건이면 n8n이 다음 노드를 스킵 → 재고 미실행 버그. 트리거에서 3갈래 병렬로 해결** |
| **Merge 대기 노드 (v5)** | **매출/재고 두 브랜치 완료를 대기한 후 상품정보 업데이트 실행. 최신 데이터로 계산 보장** |
| 상품정보 자동 업데이트 | 매출 분석 시트에서 30일/7일 판매량 집계, 재고 시트에서 현 재고량 조회, 품절 예상일 = 현 재고 ÷ 7일 일평균 |
| 매출 분석 SKU ID 컬럼 | C열에 삽입. 옵션ID 매칭 시트(A:옵션ID → C:SKU ID)에서 매핑하여 매출 수집 시 자동 입력 |
| **상품정보 SKU ID 기준 매핑 (v6)** | **상품정보 C열(SKU ID) ↔ 매출분석 C열(SKU ID) ↔ 재고 B열(판매자상품코드)로 통일** |

### 6.4 Google Sheets Mapping
| 시트명 | GID | 동작 | 매칭 키 | 열 |
|--------|-----|------|---------|-----|
| 매출 분석 | 1050492672 | appendOrUpdate | 주문번호(Order ID) | A~K (SKU ID, 판매금액, 결제일, 최근 수정일시 포함) |
| 반품 및 취소 분석 | 870651715 | appendOrUpdate | 접수번호 | A~I (최근 수정일시 포함) |
| 창고 실시간 재고 | 89346414 | Clear → Append (서비스 계정 JWT) | - | A~F (상품명, 최근 수정일시 포함) |
| 상품정보 | - | PUT 덮어쓰기 (서비스 계정 JWT) | SKU ID (C열 기준) | H~K (30일 일평균, 7일 일평균, 현 재고량, 품절 예상일) |

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

