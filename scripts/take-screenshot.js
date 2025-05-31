const puppeteer = require('puppeteer');

(async () => {
  console.log('Starting Puppeteer...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({ width: 1280, height: 800 });
  
  // Navigate to the page
  console.log('Navigating to http://localhost:8080...');
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
  
  // Wait a bit for any dynamic content
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Get console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  // Take screenshot
  const screenshotPath = '/tmp/streamcaster-screenshot.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved to: ${screenshotPath}`);
  
  // Get page content
  const content = await page.content();
  console.log('\nPage HTML (first 500 chars):');
  console.log(content.substring(0, 500));
  
  // Get any errors
  const errors = await page.evaluate(() => {
    return window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ? 
      'React DevTools detected' : 
      'React DevTools not found';
  });
  console.log('\n' + errors);
  
  await browser.close();
})();