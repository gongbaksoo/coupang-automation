const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// --- Configuration ---
const CONFIG = {
  vendorId: process.env.COUPANG_VENDOR_ID,
  accessKey: process.env.COUPANG_ACCESS_KEY,
  secretKey: process.env.COUPANG_SECRET_KEY,
  baseUrl: 'https://api-gateway.coupang.com'
};

// --- API Helper: Generate HMAC Signature ---
function generateSignature(method, path, query = '') {
  const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const message = timestamp + method + path + query;
  const signature = crypto.createHmac('sha256', CONFIG.secretKey)
    .update(message)
    .digest('hex');
  return { timestamp, signature };
}

// --- Example: Fetch Rocket Growth Inventory ---
async function fetchInventory() {
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${CONFIG.vendorId}/rg/inventory/summaries`;
  const { timestamp, signature } = generateSignature('GET', path);

  try {
    const response = await axios.get(CONFIG.baseUrl + path, {
      headers: {
        'x-requested-with': 'COUPANG-API-GATEWAY',
        'Authorization': `CEA algorithm=HmacSHA256, access-key=${CONFIG.accessKey}, signed-date=${timestamp}, signature=${signature}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('--- Inventory Data ---');
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('API Error:', error.response ? error.response.data : error.message);
  }
}

// --- Placeholder for Playwright Automation ---
async function runPlaywrightOrder(orders) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: false }); // User needs to see for MFA
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to Coupang WING...');
  await page.goto('https://wing.coupang.com/login');

  // Logic for login and navigating to Rocket Growth Inbound Management will go here
  console.log('Please login and handle MFA manually if required.');

  // After login, simulate order entry based on 'orders' list
  // ...
}

// --- Main Execution ---
async function main() {
  console.log('--- Starting Coupang Order Automation ---');
  // 1. Fetch data from Google Sheets (To be implemented)
  // 2. Fetch current stock from Coupang API
  // await fetchInventory();
  // 3. Compare and suggest orders
  // 4. If approved, run Playwright
  console.log('System ready. Please configure .env and service-account.json');
}

main();
