// The link-preview card: the authored picture with the piece's own title set
// over it, in the same face, weight and letter spacing the opening uses.
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
const source = process.argv[2] ?? 'tmp/burning-man.jpg';
const data = `data:image/jpeg;base64,${readFileSync(source).toString('base64')}`;
const browser = await chromium.launch({headless: true, channel: 'chromium'});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1200, height: 630}, deviceScaleFactor: 2});
await page.setContent(`<style>
  html, body {margin: 0; height: 100%; background: #10131c;}
  .card {position: relative; width: 1200px; height: 630px; overflow: hidden;}
  .card img {position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 50%;}
  /* A breath of shade under the words, so they hold on the pale sky as well as the dune. */
  .veil {position: absolute; inset: 0; background: linear-gradient(#0000 46%, #0000004d 78%, #00000026 100%);}
  h1 {
    position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center;
    /* A third of the way up from the bottom, measured to the middle of the line. */
    padding-bottom: 183px; box-sizing: border-box;
    margin: 0; color: #f2eade;
    font-family: system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 54px; font-weight: 700; letter-spacing: 0.24em; text-indent: 0.24em;
    white-space: nowrap; text-shadow: 0 2px 30px #0009, 0 0 90px #0006;
  }
</style>
<div class="card"><img src="${data}"><div class="veil"></div><h1>BURNING MAN 2026</h1></div>`);
await page.evaluate(() => document.fonts.ready);
 await page.waitForTimeout(400);
await page.locator('.card').screenshot({path: 'public/share.jpg', type: 'jpeg', quality: 88});
console.log('card written to public/share.jpg from', source);
await browser.close();
