import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:5173');
  
  // Wait for canvas
  await page.waitForSelector('canvas');
  const canvas = await page.$('canvas');
  
  // Draw on canvas
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, box.y + 50, { steps: 10 });
  await page.mouse.up();
  
  console.log("Drawn signature");

  // Fill in nombre
  await page.type('input[name="nombre"]', "Test User");

  // Click Copy Link
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Copiar Vínculo'));
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 1000));
  
  const url = await page.evaluate(() => {
    return document.querySelector('textarea')?.value || "FAIL";
  });
  
  console.log("Copied URL:", url.substring(0, 150) + "...");
  
  if (!url || url === 'FAIL') {
    console.error("Failed to copy URL");
    await browser.close();
    return;
  }

  // Open the copied URL
  const page2 = await browser.newPage();
  page2.on('console', msg => console.log('PAGE 2 LOG:', msg.text()));
  await page2.goto(url);
  
  await new Promise(r => setTimeout(r, 2000));

  // Check if canvas is empty
  const isEmpty = await page2.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return true;
    
    // Check react-signature-canvas API if possible
    // We can just check pixel data
    const ctx = canvas.getContext('2d');
    const pixelBuffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    return !pixelBuffer.some(color => color !== 0);
  });
  
  console.log("PAGE 2 Canvas is empty?", isEmpty);
  
  await browser.close();
})();
