const { google } = require('googleapis');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// --- Setup ---
const CONFIG = {
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  keyFile: './service-account.json', // .env의 GOOGLE_APPLICATION_CREDENTIALS와 동일한지 확인
  vendorId: process.env.COUPANG_VENDOR_ID,
  accessKey: process.env.COUPANG_ACCESS_KEY,
  secretKey: process.env.COUPANG_SECRET_KEY,
};

async function testGoogleSheets() {
  console.log('--- Checking Google Sheets Connection ---');
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CONFIG.keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.get({
      spreadsheetId: CONFIG.spreadsheetId,
    });
    console.log(`✅ Success! Spreadsheet Title: "${response.data.properties.title}"`);
  } catch (error) {
    console.error('❌ Google Sheets Error:', error.message);
    if (error.message.includes('permission denied')) {
        console.log('💡 Tip: 시트에서 서비스 계정 이메일을 "편집자"로 추가했는지 확인해주세요!');
    }
  }
}

function generateSignature(method, path, query, secretKey) {
  const moment = require('moment-timezone');
  const timestamp = moment.tz('UTC').format('YYMMDDTHHmmss') + 'Z';
  // 쿼리 스트링이 있으면 포함, 없으면 빈 문자열
  const message = timestamp + method + path + (query || '');
  const signature = crypto.createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  return { timestamp, signature };
}

async function testCoupangAPI() {
  console.log('\n--- Checking Coupang API Connection ---');
  if (!CONFIG.accessKey || !CONFIG.secretKey || !CONFIG.vendorId) {
    console.log('❌ Coupang Credentials missing in .env');
    return;
  }

  // 1. 로켓그로스 재고 조회 시도
  const rgPath = `/v2/providers/rg_open_api/apis/api/v1/vendors/${CONFIG.vendorId}/rg/inventory/summaries`;
  const rgSign = generateSignature('GET', rgPath, '', CONFIG.secretKey);

  try {
    await axios.get('https://api-gateway.coupang.com' + rgPath, {
      headers: {
        'x-requested-with': 'COUPANG-API-GATEWAY',
        'Authorization': `CEA algorithm=HmacSHA256, access-key=${CONFIG.accessKey}, signed-date=${rgSign.timestamp}, signature=${rgSign.signature}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Success! Rocket Growth API is working.');
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.log(`⚠️ Rocket Growth API failed: ${errorMsg}`);
    
    // 2. 일반 마켓플레이스 API로 키 유효성 재점검
    console.log('--- Retrying with General Marketplace API ---');
    const mkPath = '/v2/providers/openapi/apis/api/v1/product/categories';
    const mkSign = generateSignature('GET', mkPath, '', CONFIG.secretKey);
    
    try {
      await axios.get('https://api-gateway.coupang.com' + mkPath, {
        headers: {
          'x-requested-with': 'COUPANG-API-GATEWAY',
          'Authorization': `CEA algorithm=HmacSHA256, access-key=${CONFIG.accessKey}, signed-date=${mkSign.timestamp}, signature=${mkSign.signature}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Success! Coupang Keys are valid (Marketplace API working).');
      console.log('💡 Tip: 로켓그로스 API 권한만 없는 상태인 것 같습니다. WING에서 RG API 사용 동의를 확인해주세요.');
    } catch (mkError) {
      console.error('❌ Both APIs failed. Please check your Access Key and Secret Key in .env');
    }
  }
}

async function runTest() {
  await testGoogleSheets();
  await testCoupangAPI();
}

runTest();
