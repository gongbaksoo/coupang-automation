const { google } = require('googleapis');
const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment-timezone');
require('dotenv').config();

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

function generateSignature(method, path, query, secretKey) {
  const timestamp = moment.tz('UTC').format('YYMMDDTHHmmss') + 'Z';
  const message = timestamp + method + path + query;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return { timestamp, signature };
}

async function fetchInventoryData() {
  console.log('🔄 쿠팡 창고 실시간 재고 데이터 수집 중...');
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${CONFIG.vendorId}/rg/inventory/summaries`;
  let allInventory = [];
  let nextToken = '';
  let hasMore = true;

  while (hasMore) {
    let queryString = nextToken ? `nextToken=${nextToken}` : '';
    const { timestamp, signature } = generateSignature('GET', path, queryString, CONFIG.secretKey);

    try {
      const response = await axios.get(`https://api-gateway.coupang.com${path}${queryString ? '?' + queryString : ''}`, {
        headers: {
          'x-requested-with': 'COUPANG-API-GATEWAY',
          'Authorization': `CEA algorithm=HmacSHA256, access-key=${CONFIG.accessKey}, signed-date=${timestamp}, signature=${signature}`,
          'Content-Type': 'application/json'
        }
      });
      
      const invData = response.data.data || [];
      allInventory = allInventory.concat(invData);

      if (response.data.nextToken) {
        nextToken = response.data.nextToken;
      } else {
        hasMore = false;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log('⚠️ API 호출 실패 (재고):', error.response ? error.response.data.message : error.message);
      hasMore = false;
    }
  }

  let extractedInventory = [];
  allInventory.forEach(item => {
      let sellableQty = 0;
      let holdingQty = 0;
      
      if (item.inventoryDetails) {
          sellableQty = item.inventoryDetails.totalOrderableQuantity || 0;
      }

      extractedInventory.push({
          skuId: item.vendorItemId ? item.vendorItemId.toString() : '',
          externalSkuId: item.externalSkuId || '',
          sellableQty: sellableQty,
          holdingQty: holdingQty,
      });
  });

  console.log(`✅ 총 ${extractedInventory.length}개 상품의 재고 수집 완료.`);
  return extractedInventory;
}

async function writeInventoryToSheet(data) {
  const sheetTitle = '창고 실시간 재고';
  
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] }
    });
  } catch (e) { /* 무시 */ }

  const values = [
    ['로켓그로스 창고 실시간 재고', '업데이트 일시:', moment().format('YYYY-MM-DD HH:mm:ss'), '', ''],
    ['옵션ID(SKU)', '판매자상품코드(External SKU)', '판매가능 재고(정상)', '판매불가 재고(불량/보류)'],
  ];

  data.forEach(item => {
      values.push([
        item.skuId, item.externalSkuId, item.sellableQty, item.holdingQty
      ]);
  });

  await sheets.spreadsheets.values.clear({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${sheetTitle}!A:D`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
  console.log(`✅ 구글 시트 [${sheetTitle}] 업데이트 완료!`);
}

async function run() {
  const data = await fetchInventoryData();
  if (data.length > 0) await writeInventoryToSheet(data);
}
run();