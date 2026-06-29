const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto('http://localhost:8000', { waitUntil:'networkidle' });
  await p.waitForTimeout(2500);
  const cv = await p.$('.pane[data-plane="3d"] canvas');
  const box = await cv.boundingBox();
  // big vertical drag to roll under (test 360)
  await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await p.mouse.down(); 
  for(let i=0;i<20;i++){ await p.mouse.move(box.x+box.width/2, box.y+box.height/2+i*15); }
  await p.mouse.up();
  await p.waitForTimeout(500);
  await p.screenshot({ path:'/tmp/rot.png' });
  // maximize axial
  await p.dblclick('.pane[data-plane="axial"] .head');
  await p.waitForTimeout(400); await p.screenshot({ path:'/tmp/max.png' });
  console.log('done'); await b.close();
})();
