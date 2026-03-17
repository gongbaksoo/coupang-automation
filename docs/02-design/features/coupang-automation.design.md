# PDCA Design: 쿠팡 발주 자동화 (Coupang Order Automation)

> Status: Updated | Date: 2026-03-12 | Updated: 2026-03-17 | Feature: Order Automation + n8n Scheduling

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
- **Total Nodes:** 15

### 6.2 Node Flow
```
새벽2시 → 설정값(API키)
  → 매출 서명(Code) → 매출 API(HTTP Request) → 매출 추출(Code) → 매출 분석 업데이트(Sheets)
  → 반품 서명(Code) → 반품 API(HTTP Request) → 반품 추출(Code) → 반품 분석 업데이트(Sheets)
  → 재고 시트 초기화(Sheets Clear) → 재고 서명(Code) → 재고 API(HTTP Request) → 재고 추출(Code) → 재고 저장(Sheets Append)
```

### 6.3 Key Design Decisions
| 결정 | 이유 |
|------|------|
| Code Node → 순수 JS HMAC-SHA256 | n8n 샌드박스에서 `require('crypto')`, `fetch()`, `crypto.subtle` 모두 차단 |
| HTTP Request Node → API 호출 | Code Node에서 HTTP 호출 불가, n8n 네이티브 노드 사용 |
| 매출/반품: appendOrUpdate | 주문번호/접수번호 기준 중복 방지 Upsert |
| 재고: Clear + Append | 매번 최신 스냅샷으로 교체 (누적 불필요) |
| 서명 노드 분리 | 서명 생성(Code) → API 호출(HTTP Request) → 데이터 추출(Code) 3단계 분리 |

### 6.4 Google Sheets Mapping
| 시트명 | GID | 동작 | 매칭 키 |
|--------|-----|------|---------|
| 매출 분석 | 1050492672 | appendOrUpdate | 주문번호(Order ID) |
| 반품 및 취소 분석 | 870651715 | appendOrUpdate | 접수번호 |
| 창고 실시간 재고 | 89346414 | Clear → Append | - |

### 6.5 Limitations
- **페이지네이션 미지원:** 현재 API 첫 페이지만 수집 (매출 ~50건). 전체 수집하려면 루프 구현 필요.
- **반품 RU 상태만:** CC(취소완료) 상태는 별도 API 호출 필요.

