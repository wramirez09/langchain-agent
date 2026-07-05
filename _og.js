const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless:'new', executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args:['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width:1200, height:630, deviceScaleFactor:2 });
  await p.goto('file://' + process.cwd() + '/_og.html', { waitUntil:'networkidle0' });
  await new Promise(r=>setTimeout(r,400));
  await p.screenshot({ path:'public/images/og-image.png' });
  console.log('og saved');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
