import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Intercept dialogs (alerts)
  page.on('dialog', async dialog => {
    console.log('Dialog message:', dialog.message());
    await dialog.accept();
  });

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
    // Find button containing "Copiar Vínculo"
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Copiar Vínculo'));
    if (btn) btn.click();
  });

  // Wait for clipboard to be populated
  await new Promise(r => setTimeout(r, 1000));
  
  // We used a textarea fallback! Let's intercept the clipboard or textarea text.
  const url = await page.evaluate(() => {
    return new Promise(resolve => {
      navigator.clipboard.readText().then(resolve).catch(() => {
        // Find if a textarea was used
        resolve(document.querySelector('textarea')?.value || "FAIL");
      });
    });
  });
  
  console.log("Copied URL:", url.substring(0, 100) + "...");
  
  if (!url || url === 'FAIL' || url.startsWith('http://localhost:5173') === false) {
    console.error("Failed to copy URL");
    await browser.close();
    return;
  }

  // Open the copied URL
  const page2 = await browser.newPage();
  page2.on('console', msg => console.log('PAGE 2 LOG:', msg.text()));
  await page2.goto(url);
  
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
