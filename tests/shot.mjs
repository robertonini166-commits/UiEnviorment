// Renders a document with the real renderer in headless Chromium and saves a PNG.
// usage: node tests/shot.mjs <doc.json> <out.png> [screenIndex]
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer(async (req, res) => {
  try {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = srv.address().port;
const [docPath, out, idx = '0'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/app/render.html?doc=/${path.relative(root, path.resolve(docPath))}&screen=${idx}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 15000 });
await page.waitForTimeout(300);
const warnings = await page.evaluate(() => window.__warnings);
if (warnings?.length) console.log('warnings:', warnings);
await page.locator('.rbx-screen').screenshot({ path: out });
await browser.close();
srv.close();
console.log('saved', out);
