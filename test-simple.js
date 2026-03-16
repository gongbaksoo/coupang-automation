const crypto = require('crypto');
const axios = require('axios');
const moment = require('moment-timezone');
require('dotenv').config();

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;
const VENDOR_ID = process.env.COUPANG_VENDOR_ID;

function generateSignature(method, path, query, secretKey) {
  const timestamp = moment.tz('UTC').format('YYMMDDTHHmmss') + 'Z';
  // 쿠팡 API 버전에 따라 query를 서명에 포함하거나 제외해야 함. 일단 제외하고 테스트
  const message = timestamp + method + path + query;
  const signature = crypto.createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  return { timestamp, signature };
}

async function testSimpleAPI() {
  const method = 'GET';
  const endDate = moment().format('YYYYMMDD');
  const startDate = moment().subtract(1, 'days').format('YYYYMMDD');
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${VENDOR_ID}/rg/orders`;
  const queryString = `paidDateFrom=${startDate}&paidDateTo=${endDate}`;

  const { timestamp, signature } = generateSignature(method, path, queryString, SECRET_KEY);
  const authorization = `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${timestamp}, signature=${signature}`;

  console.log('Sending Request to Rocket Growth API...');

  try {
    const response = await axios.get(`https://api-gateway.coupang.com${path}?${queryString}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
        'X-EXTENDED-TIMEOUT': '90000',
        'x-requested-with': 'COUPANG-API-GATEWAY'
      }
    });
    console.log('✅ Success! Data fetched:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('❌ Failed Response Data:', error.response.data);
    } else {
      console.log('❌ Error:', error.message);
    }
  }
}

testSimpleAPI();
