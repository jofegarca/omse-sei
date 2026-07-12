const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  const filePath = 'file:///' + path.resolve('test.html').replace(/\\/g, '/');
  await page.goto(filePath);
  
  console.log("Clicking Draw Manually...");
  await page.click('#draw');
  
  console.log("Clicking Export...");
  await page.click('#export');
  
  console.log("Clicking Import...");
  await page.click('#import');
  
  await new Promise(r => setTimeout(r, 500));
  await browser.close();
})();
