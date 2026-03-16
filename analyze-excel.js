const ExcelJS = require('exceljs');

async function analyzeExcel() {
  const filePath = '/Users/jeongjihye/Desktop/Vibe Coding/쿠팡 발주 자동화/generated_excel.xlsx';
  const workbook = new ExcelJS.Workbook();
  
  try {
    await workbook.xlsx.readFile(filePath);
    console.log(`✅ 엑셀 파일 로드 성공: ${filePath}`);
    
    workbook.eachSheet((worksheet, sheetId) => {
      console.log(`\n--- 시트 이름: [${worksheet.name}] (ID: ${sheetId}) ---`);
      
      // 첫 5줄 정도만 읽어서 헤더 구조 파악
      const maxRowsToRead = Math.min(worksheet.rowCount, 5);
      for (let i = 1; i <= maxRowsToRead; i++) {
        const row = worksheet.getRow(i);
        console.log(`Row ${i}:`, row.values);
      }
    });

  } catch (err) {
    console.error('❌ 엑셀 분석 오류:', err.message);
  }
}

analyzeExcel();
