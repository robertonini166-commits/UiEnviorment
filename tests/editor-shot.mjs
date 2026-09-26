// Opens the editor in headless Chromium, reports console errors and saves a screenshot.
// usage: node tests/editor-shot.mjs out.png [script.js-to-eval-after-load]
import { chromium } from 'playwright';
import { serve } from '../cli/serve.mjs';
import { readFileSync } from 'node:fs';
const [out = '/tmp/editor.png', script] = process.argv.slice(2);
const srv = await serve(0);
const port = srv.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto(`http://localhost:${port}/index.html?fresh=1`);
await page.waitForTimeout(2500);
if (script) {
  const res = await page.evaluate(readFileSync(script, 'utf8'));
  if (res !== undefined) console.log('eval result:', typeof res === 'string' ? res : JSON.stringify(res));
  await page.waitForTimeout(800);
}
await page.screenshot({ path: out });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
srv.close();
