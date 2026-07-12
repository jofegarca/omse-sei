const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  let copiedUrl = 'FAIL';
  page.on('console', msg => {
    const text = msg.text();
    console.log('PAGE LOG:', text);
    if (text.startsWith('GENERATED_URL:')) {
      copiedUrl = text.replace('GENERATED_URL: ', '').trim();
    }
  });

  await page.goto('http://localhost:5173/omse-sei/'); // the dev server
  
  // click Siguiente to go to step 2
  console.log("Clicking Siguiente");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const sig = btns.find(b => b.textContent.includes('Siguiente'));
    if (sig) sig.click();
  });

  await new Promise(r => setTimeout(r, 1000));
  
  const canvas = await page.$('canvas');
  if (!canvas) {
    console.log("Canvas not found!");
    return await browser.close();
  }

  // Draw on canvas
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 100, { steps: 10 });
  await page.mouse.up();
  
  console.log("Drawn signature");

  // Click Copy Link
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Copiar Vínculo'));
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 1000));
  
  console.log("Copied URL:", copiedUrl);
  
  if (!copiedUrl || copiedUrl === 'FAIL') {
    console.error("Failed to copy URL");
    await browser.close();
    return;
  }

  // Open the copied URL
  const page2 = await browser.newPage();
  page2.on('console', msg => console.log('PAGE 2 LOG:', msg.text()));
  await page2.goto(copiedUrl);
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log("PAGE 2: Clicking Siguiente");
  await page2.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const sig = btns.find(b => b.textContent.includes('Siguiente'));
    if (sig) sig.click();
  });

  await new Promise(r => setTimeout(r, 1000));

  // Check if canvas is empty
  const isEmpty = await page2.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    const pixelBuffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    return !pixelBuffer.some(color => color !== 0);
  });
  
  console.log("PAGE 2 Canvas is empty?", isEmpty);
  
  await browser.close();
})();
