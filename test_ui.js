import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Log all requests
  page.on('request', request => {
    if (request.url().includes('worker_objects')) {
      console.log('>>', request.method(), request.url(), request.postData());
    }
  });

  page.on('response', response => {
    if (response.url().includes('worker_objects')) {
      console.log('<<', response.status(), response.url());
    }
  });

  console.log('Navigating...');
  await page.goto('https://app.reefa.pl');

  console.log('Logging in...');
  await page.fill('input[type="email"]', 'reefa@reefa.pl');
  await page.fill('input[type="password"]', '42fundyk');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);

  console.log('Going to workers...');
  await page.goto('https://app.reefa.pl/workers');

  await page.waitForTimeout(2000);

  console.log('Clicking Add Worker...');
  await page.click('text=Добавить работника');

  await page.waitForTimeout(1000);

  console.log('Filling form...');
  await page.fill('input[placeholder="Имя"]', 'Playwright');
  await page.fill('input[placeholder="Фамилия"]', 'Test');
  await page.fill('input[placeholder="Телефон"]', '999999999');

  // Click first checkbox
  await page.click('.space-y-2 label input[type="checkbox"]');

  console.log('Clicking Create...');
  await page.click('button:has-text("Создать")');

  await page.waitForTimeout(3000);
  console.log('Done.');
  await browser.close();
})();
