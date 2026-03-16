const ExcelJS = require('exceljs');

async function analyzeTestExcel() {
  const filePath = '/Users/jeongjihye/Desktop/Vibe Coding/쿠팡 발주 자동화/generated_excel_test.xlsx';
  const workbook = new ExcelJS.Workbook();
  
  try {
    await workbook.xlsx.readFile(filePath);
    console.log(`✅ 테스트 파일 로드 성공: ${filePath}`);
    
    const sheet = workbook.getWorksheet('로켓그로스 입고');
    if (!sheet) {
        console.log('❌ "로켓그로스 입고" 시트를 찾을 수 없습니다.');
        return;
    }

    console.log(`\n--- [${sheet.name}] 상세 분석 (5행 데이터) ---`);
    const row5 = sheet.getRow(5);
    
    row5.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // 실제 값이 있거나 수식이 있는 셀만 출력
        if (cell.value !== null && cell.value !== undefined) {
            console.log(`[열 ${colNumber}] 타입: ${cell.type}, 값:`, cell.value);
        }
    });

  } catch (err) {
    console.error('❌ 엑셀 분석 오류:', err.message);
  }
}

analyzeTestExcel();
