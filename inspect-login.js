const { chromium } = require('playwright');

async function inspectLogin() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    await page.goto('https://wing.coupang.com/login', { waitUntil: 'domcontentloaded' });
    
    // Give it some time to render
    await page.waitForTimeout(5000);
    
    const title = await page.title();
    console.log('Title:', title);
    
    const frames = page.frames();
    console.log('Total frames:', frames.length);
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      console.log(`\n--- Frame [${i}] URL: ${frame.url()} ---`);
      
      try {
        const inputs = await frame.evaluate(() => {
          return Array.from(document.querySelectorAll('input, button')).map(el => ({
            tag: el.tagName,
            id: el.id,
            name: el.name,
            type: el.type,
            text: el.innerText || el.value || ''
          }));
        });
        console.log(inputs);
      } catch(err) {
        console.log('Could not read frame:', err.message);
      }
    }

  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}

inspectLogin();
