# Implementation Plan: coupang-automation

> Feature: Coupang Order Automation | Phase: DO

## Current Status
- [x] Project Scaffolding (Node.js, Playwright, Axios)
- [x] API Helper for HMAC Signature
- [x] Basic .env setup
- [ ] Google Spreadsheet Integration (Read/Write)
- [ ] Playwright Workflow for Inbound Shipment
- [ ] User Approval Logic (Sheet-based)

## Next Steps
1. **Google Sheets Setup:** Use `googleapis` to read product info from a predefined sheet.
2. **API Data Sync:** Fetch real-time stock and update the spreadsheet.
3. **Playwright Scenario:** Detailed coding for `wing.coupang.com` navigation (Login -> Inbound management).
4. **Validation:** Test the logic with mock data.
