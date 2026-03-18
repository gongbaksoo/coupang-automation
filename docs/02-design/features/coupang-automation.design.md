# PDCA Design: 쿠팡 발주 자동화 (Coupang Order Automation)

> Status: Updated | Date: 2026-03-12 | Updated: 2026-03-18 | Feature: Order Automation + n8n Scheduling

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
- **Total Nodes:** 8

### 6.2 Node Flow (v3 - Execute Command + 서비스 계정 JWT, 2026-03-18)
```
새벽2시 → 매출 수집(Execute Command) → 매출 파싱(Code) → 매출 분석 업데이트(Sheets OAuth2)
         → 반품 수집(Execute Command) → 반품 파싱(Code) → 반품 분석 업데이트(Sheets OAuth2)
         → 재고 전체 처리(Execute Command: 쿠팡 API + 상품명 매핑 + Sheets 서비스 계정 JWT로 Clear+Write)
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
| 재고 상품명 매핑 | 매출 분석 시트에서 옵션ID→상품명 조회 후 재고 데이터에 합침 |

### 6.4 Google Sheets Mapping
| 시트명 | GID | 동작 | 매칭 키 | 열 |
|--------|-----|------|---------|-----|
| 매출 분석 | 1050492672 | appendOrUpdate | 주문번호(Order ID) | A~J (판매금액, 결제일, 최근 수정일시 포함) |
| 반품 및 취소 분석 | 870651715 | appendOrUpdate | 접수번호 | A~I (최근 수정일시 포함) |
| 창고 실시간 재고 | 89346414 | Clear → Append (서비스 계정 JWT) | - | A~F (상품명, 최근 수정일시 포함) |

### 6.5 Architecture Evolution
| 버전 | 날짜 | 구조 | 문제 |
|------|------|------|------|
| v1 | 3/17 | Code Node (순수 JS HMAC + fetch) | `require()`, `fetch()`, `crypto` 모두 차단 |
| v1.5 | 3/17 | Code Node (순수 JS HMAC) + HTTP Request Node | 페이지네이션 불가, UTC 날짜 |
| v2 | 3/18 | Execute Command Node | OAuth2 할당량 초과 (매출 295건 Upsert가 분당 60회 한도 소진) |
| **v3** | **3/18** | **Execute Command + 서비스 계정 JWT** | **재고를 서비스 계정으로 분리, 8노드로 최적화** |

