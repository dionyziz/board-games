const { chromium } = require('playwright-core');
const fs = require('fs');

const URL = 'https://airtable.com/appH80uhZrvloxhPR/shr0voHGILzVY9jj5/tblE2VmNGZHgZERaJ/viwKLNmIpWARSZ1nv';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    viewport: { width: 1400, height: 1000 },
  });
  const page = await ctx.newPage();

  let jsonBody = null;
  await page.route('**/v0.3/application/**/read?**', async (route) => {
    const orig = route.request().url();
    const jsonUrl = orig
      .replace('%22allowMsgpackOfResult%22%3Atrue', '%22allowMsgpackOfResult%22%3Afalse')
      .replace('allowMsgpackOfResult%22:true', 'allowMsgpackOfResult%22:false');
    try {
      const response = await route.fetch({ url: jsonUrl });
      const ct = (response.headers()['content-type']) || '';
      const buf = await response.body();
      console.error('routed(json) status', response.status(), ct, buf.length);
      if (response.status() === 200 && ct.includes('json') && (!jsonBody || buf.length > jsonBody.length)) {
        jsonBody = buf;
      }
      // fulfill original request with msgpack so the app keeps working
      await route.fulfill({ response });
    } catch (e) {
      console.error('route err', e.message);
      await route.continue();
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.error('goto:', e.message));
  await page.waitForTimeout(9000);
  await browser.close();

  if (!jsonBody) { console.error('NO JSON'); return; }
  const obj = JSON.parse(jsonBody.toString('utf8'));
  fs.writeFileSync(__dirname + '/airtable-raw.json', JSON.stringify(obj, null, 2));
  console.error('wrote data.json', fs.statSync('data.json').size, 'bytes');
  console.error('top keys:', Object.keys(obj));
})();
