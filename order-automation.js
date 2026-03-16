const { chromium } = require('playwright');
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
      skuId: row[0],
      name: row[1],
      orderBoxes: row[5],
    }));
}

async function runAutomation() {
  const orders = await getApprovedOrders();
  if (orders.length === 0) {
    console.log('❌ 승인된 발주 항목이 없습니다.');
    return;
  }

  console.log('✅ 승인된 항목 수:', orders.length);
  
  // 쿠키와 로그인 세션을 저장할 폴더 지정 (한 번 로그인하면 다음엔 자동 로그인됨)
  const userDataDir = path.join(__dirname, 'user_data');
  const context = await chromium.launchPersistentContext(userDataDir, { 
    headless: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();

  try {
    console.log('🚀 쿠팡 윙 접속 중...');
    
    // 1. 입고 관리 페이지로 바로 접속 시도 (세션이 살아있다면 로그인 없이 바로 들어감)
    const inboundUrl = 'https://wing.coupang.com/tenants/rfm-inbound/inbound/list';
    await page.goto(inboundUrl, { waitUntil: 'domcontentloaded' });
    
    // 2. 현재 주소가 로그인 페이지로 리다이렉트 되었는지 확인
    if (page.url().includes('login')) {
        console.log('🔒 로그인이 필요합니다. 자동 로그인을 시도합니다...');
        if (process.env.COUPANG_ID && process.env.COUPANG_PW) {
            await page.fill('#username', process.env.COUPANG_ID);
            await page.fill('#password', process.env.COUPANG_PW);
            await page.click('#kc-login');
            console.log('💡 아이디/비밀번호 입력 완료.');
        }
        
        console.log('⏳ 로그인 완료 후 대시보드 또는 입고 페이지가 뜰 때까지 대기합니다. (2차 인증 필요 시 브라우저에서 진행해주세요)');
        // 어떤 페이지든 wing.coupang.com 내부의 로그인 화면이 아닌 곳으로 가면 성공
        await page.waitForFunction(() => {
            return window.location.href.includes('wing.coupang.com') && !window.location.href.includes('login');
        }, { timeout: 300000 });
        
        console.log('✅ 로그인 성공!');
        console.log('📦 입고 관리 페이지로 다시 이동합니다...');
        await page.goto(inboundUrl, { waitUntil: 'domcontentloaded' });
    }

    console.log('✅ 입고 관리 페이지 도착 완료!');
    
    // 3. 엑셀 파일 다운로드 자동화
    console.log('💡 1. [새로운 입고 생성] 버튼 클릭');
    await page.click('text="새로운 입고 생성"');
    await page.waitForTimeout(2000); // 팝업이나 화면 전환 대기

    console.log('💡 2. [엑셀로 업로드하기] 옵션 선택');
    // '엑셀로 업로드하기' 텍스트 주변을 클릭하여 라디오 버튼 활성화
    await page.click('text="엑셀로 업로드하기"');
    await page.waitForTimeout(1000);

    console.log('📥 3. [엑셀 다운로드] 버튼 클릭 및 파일 다운로드 대기...');
    // Playwright의 다운로드 이벤트 캐치 준비
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.click('button:has-text("엑셀 다운로드")');
    const download = await downloadPromise;
    
    // 파일 저장
    const downloadPath = path.join(__dirname, 'coupang_template.xlsx');
    await download.saveAs(downloadPath);
    console.log(`✅ 엑셀 양식 다운로드 완료! 저장 위치: ${downloadPath}`);

    // --- 4. 엑셀 데이터 가공 (외부 스크립트 실행 또는 내부 함수 호출) ---
    console.log('🔄 엑셀 데이터 가공 중...');
    const { execSync } = require('child_process');
    try {
      // 좀 전에 만든 process-excel.js 스크립트를 실행하여 데이터 채우기
      // 주의: 실제 환경에서는 coupang_template.xlsx를 읽어서 가공하도록 process-excel.js를 수정해야 함
      execSync('node process-excel.js', { stdio: 'inherit' });
    } catch (err) {
      console.error('❌ 엑셀 가공 실패. 업로드를 중단합니다.');
      return;
    }

    // --- 5. 엑셀 업로드 자동화 ---
    const uploadPath = path.join(__dirname, 'coupang_upload_ready.xlsx');
    console.log(`📤 5. 가공된 엑셀 파일 업로드 시도: ${uploadPath}`);
    
    // 쿠팡 화면에서 [엑셀 업로드] 버튼에 연결된 file input 요소 찾기
    // 보통 <input type="file">이 숨겨져 있습니다.
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
        await fileInput.setInputFiles(uploadPath);
        console.log('✅ 파일 첨부 완료!');
    } else {
        console.log('⚠️ 파일 첨부 영역을 찾지 못했습니다. 수동으로 업로드해 주세요.');
    }

    console.log('\n💡 봇 대기 중: 여기까지 잘 작동하는지 확인하기 위해 창을 영구적으로 열어둡니다. (종료하려면 터미널에서 Ctrl+C를 누르세요)');
    
    // 무한 대기 (사용자가 직접 닫거나 터미널에서 종료할 때까지 유지)
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 자동화 오류 발생:', error.message);
  }
}

runAutomation();
