// Fetch full BGG data for every game with a bggId, via BGG's internal JSON API
// (api.geekdo.com — the XML API now requires auth). Caches raw responses per
// game so normalization (5-enrich.js) can be re-run offline without re-fetching.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'bgg-cache');
fs.mkdirSync(CACHE, { recursive: true });

const games = require(path.join(ROOT, 'src/data/games.json')).games;
const targets = games.filter((g) => g.bggId);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  await page.goto('https://boardgamegeek.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const get = (url) =>
    page.evaluate(async (u) => {
      try {
        const r = await fetch(u);
        return { status: r.status, text: await r.text() };
      } catch (e) {
        return { status: 0, text: String(e) };
      }
    }, url);

  let done = 0, ok = 0, fail = 0;
  for (const g of targets) {
    done++;
    const id = g.bggId;
    const file = path.join(CACHE, id + '.json');
    if (fs.existsSync(file)) { ok++; continue; }

    const rec = { bggId: id, title: g.title };
    try {
      const m = await get(`https://api.geekdo.com/api/geekitems?objectid=${id}&objecttype=thing`);
      rec.meta = m.status === 200 ? JSON.parse(m.text).item : { _status: m.status };
      await sleep(200);

      const d = await get(`https://api.geekdo.com/api/dynamicinfo?objectid=${id}&objecttype=thing`);
      rec.dynamic = d.status === 200 ? JSON.parse(d.text).item : { _status: d.status };
      await sleep(200);

      const v = await get(
        `https://api.geekdo.com/api/geekitem/linkeditems?ajax=1&linkdata_index=boardgameversion&objectid=${id}&objecttype=thing&pageid=1&showcount=150&sort=yearpublished&subtype=boardgameversion`
      );
      rec.versions = v.status === 200 ? JSON.parse(v.text).items : [];
      await sleep(200);

      fs.writeFileSync(file, JSON.stringify(rec));
      ok++;
    } catch (e) {
      rec.error = String(e).slice(0, 200);
      fs.writeFileSync(file, JSON.stringify(rec));
      fail++;
    }

    if (done % 10 === 0 || done === targets.length) {
      fs.writeFileSync(path.join(CACHE, '_progress.txt'), `done ${done}/${targets.length} ok=${ok} fail=${fail}\n`);
      console.error(`done ${done}/${targets.length} ok=${ok} fail=${fail} last=${g.title}`);
    }
  }
  await browser.close();
  console.error(`FINISHED: ${ok} ok, ${fail} fail of ${targets.length}`);
})();
