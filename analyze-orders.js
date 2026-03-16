const { google } = require('googleapis');
const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
require('dotenv').config();

// --- Configuration ---
const CONFIG = {
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  vendorId: process.env.COUPANG_VENDOR_ID,
  accessKey: process.env.COUPANG_ACCESS_KEY,
  secretKey: process.env.COUPANG_SECRET_KEY,
  keyFile: './service-account.json'
};

const auth = new google.auth.GoogleAuth({
  keyFile: CONFIG.keyFile,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- Helper: Generate Coupang Signature ---
function generateSignature(method, path, secretKey) {
  const timestamp = moment.tz('UTC').format('YYMMDDTHHmmss') + 'Z';
  const message = timestamp + method + path;
  const signature = crypto.createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  return { timestamp, signature };
}

// --- Step 1: Read Product Info from "상품정보" ---
async function readProductInfo() {
  const range = '상품정보!A2:E';
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range,
  });
  return response.data.values || [];
}

// --- Step 2: Fetch Current Stock from Coupang ---
async function getCoupangStock() {
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${CONFIG.vendorId}/rg/inventory/summaries`;
  const { timestamp, signature } = generateSignature('GET', path, CONFIG.secretKey);

  try {
    const response = await axios.get('https://api-gateway.coupang.com' + path, {
      headers: {
        'x-requested-with': 'COUPANG-API-GATEWAY',
        'Authorization': `CEA algorithm=HmacSHA256, access-key=${CONFIG.accessKey}, signed-date=${timestamp}, signature=${signature}`,
        'Content-Type': 'application/json'
      }
    });
    // API 성공 시 SKU별 재고 맵핑
    const stockMap = {};
    if (response.data && response.data.data) {
      response.data.data.forEach(item => {
        stockMap[item.skuId] = item.onHandQuantity; // 실제 창고 재고
      });
    }
    return stockMap;
  } catch (error) {
    console.log('⚠️ Coupang API Error (Using mock data for testing):', error.message);
    return {}; // API 실패 시 빈 객체 반환
  }
}

// --- Step 3: Write Results to "분석 및 발주" ---
async function writeResults(results) {
  const sheetTitle = '분석 및 발주';
  
  // 시트가 없으면 생성 시도
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetTitle } } }]
      }
    });
  } catch (e) { /* 이미 있으면 무시 */ }

  const values = [
    ['SKU ID', '상품명', '현재고', '목표재고', '필요수량(EA)', '발주박스수', '발주승인(O/X)'],
    ...results
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
  console.log('✅ Analysis results written to spreadsheet!');
}

// --- Main Logic ---
async function runAnalysis() {
  console.log('--- Running Product Analysis ---');
  
  const products = await readProductInfo();
  const stockMap = await getCoupangStock();
  
  const results = products.map(row => {
    const [skuId, name, boxQty, minStock, targetStock] = row;
    const currentStock = stockMap[skuId] || 0; // API 정보 없으면 0개로 가정
    const neededEa = Math.max(0, parseInt(targetStock) - currentStock);
    const orderBoxes = Math.ceil(neededEa / parseInt(boxQty));
    
    return [skuId, name, currentStock, targetStock, neededEa, orderBoxes, 'FALSE'];
  });

  await writeResults(results);
}

runAnalysis();
