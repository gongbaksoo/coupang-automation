# 쿠팡 발주 및 매출 분석 자동화 프로젝트 히스토리 (Handoff Document)

## 📅 프로젝트 개요
- **목표:** 쿠팡 로켓그로스(제트배송) 발주 프로세스 자동화 및 API를 활용한 실시간 매출/재고/반품 데이터 구글 시트 연동.
- **최종 업데이트 일자:** 2026-03-16
- **저장소:** [gongbaksoo/coupang-automation](https://github.com/gongbaksoo/coupang-automation)

---

## 🛠️ 구현 완료된 기능 (Key Deliverables)

### 1. 🚀 발주 UI 자동화 (`order-automation.js`)
- **도구:** Playwright (Headless/Persistent Context 사용)
- **로직:** 
    - 쿠팡 WING 자동 로그인 (세션 유지형)
    - 입고 관리 메뉴 진입 -> '엑셀 업로드' 선택 -> 템플릿 다운로드
    - `process-excel.js`를 호출하여 구글 시트 데이터 기반 엑셀 가공
    - **핵심 수정사항:** 쿠팡 시스템이 엑셀의 22번 컬럼(입고수량)을 '숫자 형식(Type 2)'으로만 인식하므로, ExcelJS를 이용해 데이터 타입을 강제 변환함.
    - 가공된 엑셀 업로드 후 사용자 검토를 위해 대기.

### 2. 📊 매출 및 반품 데이터 수집 (`analyze-sales.js`, `analyze-returns.js`)
- **API:** Coupang Rocket Growth Open API
- **매출 분석:** 최근 30일치 데이터 수집. `nextToken`을 이용한 페이지네이션 구현 (총 3,700여 건 수집 성공).
- **반품 분석:** 최근 31일치 반품(RU) 및 취소 완료(CC) 건 수집 (약 9건 수집).
- **기술적 해결:** 
    - API 호출 시 1.5초 딜레이(`setTimeout`)를 추가하여 'Too many requests' 에러 방지.
    - HMAC-SHA256 서명(Signature) 생성 로직 구현 완료.

### 📦 3. 창고 실시간 재고 수집 (`analyze-inventory.js`)
- 로켓그로스 물류센터(CFS)의 실시간 판매 가능 재고 및 불량/보류 재고를 구글 시트 '창고 실시간 재고' 탭에 동기화.

---

## 📁 주요 파일 구조
- `.env`: API 키(ACCESS/SECRET), VENDOR_ID, GOOGLE_SHEET_ID 관리
- `service-account.json`: 구글 시트 연동용 인증 키
- `analyze-sales.js`: 매출 수집 스크립트
- `analyze-returns.js`: 반품/취소 수집 스크립트
- `analyze-inventory.js`: 창고 재고 수집 스크립트
- `order-automation.js`: 발주 자동화 메인 스크립트
- `process-excel.js`: 엑셀 매핑 및 데이터 타입 변환 로직
- `docs/USER_GUIDE.md`: 운영자 매뉴얼

---

## ⚠️ 핵심 제약 사항 및 팁 (For Claude Code)
1. **IP 화이트리스트:** 쿠팡 API 호출 시 반드시 등록된 IP(`1.215.255.114`) 환경에서 실행해야 함.
2. **날짜 제한:** 쿠팡 API는 한 번에 최대 31일까지만 조회가 가능함. 그 이상의 데이터 축적은 매일 데이터를 쌓는 방식(Incremental Append)이 필요함.
3. **엑셀 데이터 타입:** 입고수량 컬럼은 반드시 엑셀 상에서 '숫자'여야 하며, 문자열 형태의 숫자는 쿠팡 [다음] 버튼을 비활성화시킴.

---

## 🔜 향후 계획 (Next Steps)
- **n8n 자동화 연동 (방법 A):** 
    - n8n의 `Code Node`를 사용하여 서명(Signature)을 생성.
    - 매일 새벽 2시에 최근 2일치 데이터를 가져와 구글 시트에 **'Upsert(업데이트 또는 추가)'** 하여 장기 데이터를 축적하는 워크플로우 구축 예정.
- **n8n JSON 데이터:** Gemini CLI가 작성해둔 n8n 워크플로우 JSON이 세션 기록에 남아 있음.

---
**Claude Code님, 위 히스토리를 바탕으로 n8n 자동화 고도화 및 시스템 안정화 작업을 이어가 주시기 바랍니다.**
