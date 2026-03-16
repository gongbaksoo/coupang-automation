# PDCA Design: 쿠팡 발주 자동화 (Coupang Order Automation)

> Status: Draft | Date: 2026-03-12 | Feature: brainstorming (Order Automation)

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
- **IP Whitelisting:** Registered current IP (1.215.255.114) in WING portal.
- **MFA Handling:** Saved browser session in `user_data` directory.
- **Excel Formatting:** Forced Number Type (Type 2) for order quantities to ensure Coupang validation passes.

