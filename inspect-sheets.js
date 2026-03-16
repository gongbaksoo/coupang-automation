const { google } = require('googleapis');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  keyFile: './service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

async function inspectSheet() {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = meta.data.sheets.map(s => s.properties.title);
    console.log('--- Sheet Names ---');
    console.log(sheetNames);

    for (const name of sheetNames) {
      const rows = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${name}!A1:E5`,
      });
      console.log(`\n--- First 5 rows of [${name}] ---`);
      console.log(rows.data.values);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

inspectSheet();
