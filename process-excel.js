const ExcelJS = require('exceljs');
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

const CONFIG = {
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  keyFile: './service-account.json',
};

async function getApprovedOrders() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CONFIG.keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: '분석 및 발주!A2:G',
  });
  
  const rows = response.data.values || [];
  return rows
    .filter(row => row[6] && row[6].toUpperCase() === 'TRUE')
    .map(row => ({
      skuId: row[0].toString().trim(),
      name: row[1],
      orderBoxes: parseInt(row[5], 10),
    }));
}

async function processExcel() {
  console.log('🔄 엑셀 가공 시작...');
  // 쿠팡에서 갓 다운로드받은 원본 템플릿 사용
  const templatePath = path.join(__dirname, 'coupang_template.xlsx');
  const outputPath = path.join(__dirname, 'coupang_upload_ready.xlsx');
  
  const orders = await getApprovedOrders();
  if (orders.length === 0) {
    console.log('❌ 승인된 발주가 없어 엑셀 가공을 취소합니다.');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  
  const sheet = workbook.getWorksheet('로켓그로스 입고');
  if (!sheet) {
    console.error('❌ "로켓그로스 입고" 시트를 찾을 수 없습니다.');
    return;
  }

  // 사용자 테스트 파일 분석 결과:
  // 열 22: '입고 수량 입력(필수)'
  // 열 36: 'SKU ID'
  const qtyColIndex = 22;
  const skuColIndex = 36;
  let updatedCount = 0;

  // 5행부터 실제 데이터 시작
  for (let i = 5; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const skuCell = row.getCell(skuColIndex);
    const skuValue = skuCell.value ? skuCell.value.toString().trim() : '';

    if (!skuValue) continue;

    const order = orders.find(o => o.skuId === skuValue);
    if (order) {
      const qtyCell = row.getCell(qtyColIndex);
      // 숫자 타입(Type 2)으로 명시적 할당
      qtyCell.value = Number(order.orderBoxes); 
      console.log(`✅ [업데이트 완료] SKU: ${skuValue}, 수량: ${order.orderBoxes}`);
      updatedCount++;
    }
  }

  await workbook.xlsx.writeFile(outputPath);
  console.log(`🎉 엑셀 가공 완료! (${updatedCount}개 항목 업데이트)`);
  console.log(`저장 위치: ${outputPath}`);
}

processExcel();
