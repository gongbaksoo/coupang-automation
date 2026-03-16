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

async function fetchReturnsData() {
  console.log('🔄 쿠팡 반품/취소 데이터 수집 중...');
  const endDate = moment().format('YYYY-MM-DD');
  const startDate = moment().subtract(31, 'days').format('YYYY-MM-DD'); // 최근 31일 (최대치)
  
  const path = `/v2/providers/openapi/apis/api/v6/vendors/${CONFIG.vendorId}/returnRequests`;
  let allReturns = [];
  const statuses = ['RU', 'CC']; // 반품완료, 취소완료

  for (const status of statuses) {
    let nextToken = '';
    let hasMore = true;

    while (hasMore) {
      let queryString = `createdAtFrom=${startDate}&createdAtTo=${endDate}&maxPerPage=50&status=${status}`;
      if (nextToken) queryString += `&nextToken=${nextToken}`;

      const { timestamp, signature } = generateSignature('GET', path, queryString, CONFIG.secretKey);

      try {
        const response = await axios.get(`https://api-gateway.coupang.com${path}?${queryString}`, {
          headers: {
            'x-requested-with': 'COUPANG-API-GATEWAY',
            'Authorization': `CEA algorithm=HmacSHA256, access-key=${CONFIG.accessKey}, signed-date=${timestamp}, signature=${signature}`,
            'Content-Type': 'application/json'
          }
        });
        
        const returns = response.data.data || [];
        allReturns = allReturns.concat(returns);

        if (response.data.nextToken) {
          nextToken = response.data.nextToken;
        } else {
          hasMore = false;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`⚠️ API 호출 실패 (상태: ${status}):`, error.response ? error.response.data.message : error.message);
        hasMore = false;
      }
    }
  }

  let extractedReturns = [];
  allReturns.forEach(req => {
    const items = req.returnItems || [];
    items.forEach(item => {
        extractedReturns.push({
            receiptId: req.receiptId,
            orderId: req.orderId,
            receiptStatus: req.receiptStatus,
            createdAt: moment(req.createdAt).format('YYYY-MM-DD HH:mm:ss'),
            cancelReason: req.cancelReasonCategory1 + (req.cancelReason ? ` - ${req.cancelReason}` : ''),
            skuId: item.vendorItemId ? item.vendorItemId.toString() : '',
            productName: item.vendorItemName || '',
            qty: item.cancelCount || 0
        });
    });
  });

  extractedReturns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  console.log(`✅ 총 ${extractedReturns.length}건의 반품/취소 수집 완료.`);
  return extractedReturns;
}

async function writeReturnsToSheet(data) {
  const sheetTitle = '반품 및 취소 분석';
  
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] }
    });
  } catch (e) { /* 무시 */ }

  const values = [
    ['최근 31일 반품/취소 내역', '업데이트 일시:', moment().format('YYYY-MM-DD HH:mm:ss'), '', '', '', '', ''],
    ['접수번호', '주문번호', '접수일시', '상태', '사유', '옵션ID(SKU)', '상품명', '수량'],
  ];

  data.forEach(item => {
      values.push([
        item.receiptId, item.orderId, item.createdAt, item.receiptStatus,
        item.cancelReason, item.skuId, item.productName, item.qty
      ]);
  });

  await sheets.spreadsheets.values.clear({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${sheetTitle}!A:H`,
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
  const data = await fetchReturnsData();
  if (data.length > 0) await writeReturnsToSheet(data);
}
run();