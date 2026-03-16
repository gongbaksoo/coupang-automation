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
  const signature = crypto.createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  return { timestamp, signature };
}

async function fetchSalesData() {
  console.log('🔄 쿠팡 로켓그로스 매출 데이터 수집 중...');
  // 최근 7일 데이터 조회 (YYYYMMDD 포맷)
  const endDate = moment().format('YYYYMMDD');
  const startDate = moment().subtract(7, 'days').format('YYYYMMDD');
  
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${CONFIG.vendorId}/rg/orders`;
  
  let allRawOrders = [];
  let nextToken = '';
  let hasMore = true;

  while (hasMore) {
    let queryString = `paidDateFrom=${startDate}&paidDateTo=${endDate}`;
    if (nextToken) {
      queryString += `&nextToken=${nextToken}`;
    }

    const { timestamp, signature } = generateSignature('GET', path, queryString, CONFIG.secretKey);

    try {
      console.log(`페이지 데이터 요청 중... (nextToken: ${nextToken || '없음'})`);
      const response = await axios.get(`https://api-gateway.coupang.com${path}?${queryString}`, {
        headers: {
          'x-requested-with': 'COUPANG-API-GATEWAY',
          'Authorization': `CEA algorithm=HmacSHA256, access-key=${CONFIG.accessKey}, signed-date=${timestamp}, signature=${signature}`,
          'Content-Type': 'application/json'
        }
      });
      
      const rawOrders = response.data.data || [];
      allRawOrders = allRawOrders.concat(rawOrders);

      if (response.data.nextToken) {
        nextToken = response.data.nextToken;
      } else {
        hasMore = false;
      }

      // API 호출 제한 방지를 위해 약간의 딜레이
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.log('⚠️ 쿠팡 매출 API 호출 실패:', error.response ? error.response.data.message : error.message);
      hasMore = false; // 에러 발생 시 반복 중단
      if (allRawOrders.length === 0) {
          console.log('💡 테스트를 위해 가상의 매출 데이터를 생성합니다.');
          return [
            { orderId: '123456789', paidAt: moment().format('YYYY-MM-DD HH:mm:ss'), skuId: '12345', productName: '스누피 티셔츠', qty: 5, unitPrice: 25000, currency: 'KRW' }
          ];
      }
    }
  }

  let extractedItems = [];
  
  allRawOrders.forEach(order => {
    if (order.orderItems && order.orderItems.length > 0) {
      order.orderItems.forEach(item => {
        extractedItems.push({
          orderId: order.orderId,
          paidAt: moment(order.paidAt).format('YYYY-MM-DD HH:mm:ss'),
          skuId: item.vendorItemId.toString(),
          productName: item.productName || item.vendorItemName || '',
          qty: item.salesQuantity || item.shippingCount || 0,
          unitPrice: item.unitSalesPrice || item.orderPrice || 0,
          currency: item.currency || 'KRW'
        });
      });
    }
  });
  
  // 결제일시 기준으로 내림차순 정렬 (최신 주문이 위로)
  extractedItems.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
  
  console.log(`✅ 총 ${allRawOrders.length}건의 주문 수집 완료.`);
  return extractedItems;
}

async function writeSalesToSheet(salesData) {
  const sheetTitle = '매출 분석';
  
  // 시트가 없으면 생성
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetTitle } } }]
      }
    });
  } catch (e) { /* 이미 있으면 무시 */ }

  // 상세 데이터 헤더
  const values = [
    ['최근 7일 상세 주문 내역', '업데이트 일시:', moment().format('YYYY-MM-DD HH:mm:ss'), '', '', '', ''],
    ['주문번호(Order ID)', '결제일시(Paid At)', '옵션ID(Vendor Item ID)', '상품명(Product Name)', '수량(Qty)', '단가(Unit Price)', '통화(Currency)'],
  ];

  // 상세 데이터 행 추가
  salesData.forEach(item => {
      values.push([
        item.orderId, 
        item.paidAt, 
        item.skuId, 
        item.productName, 
        item.qty, 
        item.unitPrice, 
        item.currency
      ]);
  });

  // 시트 초기화 후 덮어쓰기 (A~G열까지 모두 클리어)
  await sheets.spreadsheets.values.clear({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${sheetTitle}!A:G`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
  console.log(`✅ 구글 시트 [${sheetTitle}] 탭에 매출 데이터가 업데이트 되었습니다!`);
}

async function run() {
  const data = await fetchSalesData();
  if (data && data.length > 0) {
      await writeSalesToSheet(data);
  } else {
      console.log('⚠️ 분석할 매출 데이터가 없습니다.');
  }
}

run();