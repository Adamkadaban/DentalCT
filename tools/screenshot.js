const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('console', m => m.type()==='error' && errs.push(m.text()));
  p.on('pageerror', e => errs.push('PAGEERR: '+e.message));
  await p.goto('http://localhost:8000', { waitUntil:'networkidle' });
  await p.waitForTimeout(3500);
  await p.screenshot({ path:'/tmp/viewer.png' });
  console.log('errors:', errs.length?errs.join('\n'):'none');
  await b.close();
})();
