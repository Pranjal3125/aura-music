import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST_DIR = path.resolve('dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.wav': 'audio/wav',
};

function makeSilentWav(seconds = 4, sampleRate = 8000) {
  const numSamples = seconds * sampleRate;
  const buf = Buffer.alloc(44 + numSamples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + numSamples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const val = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 1800);
    buf.writeInt16LE(val, 44 + i * 2);
  }
  return buf;
}

function startStaticServer() {
  const wav = makeSilentWav(8);
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      if (urlPath === '/mock-audio.wav') {
        res.writeHead(200, {
          'Content-Type': 'audio/wav',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(wav);
        return;
      }
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const fullPath = path.join(DIST_DIR, rel);
      const target = existsSync(fullPath) ? fullPath : path.join(DIST_DIR, 'index.html');
      const ext = path.extname(target);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(readFileSync(target));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method && this.handlers.has(msg.method)) {
        for (const fn of this.handlers.get(msg.method)) fn(msg.params);
      }
    });
  }
  on(method, fn) {
    const list = this.handlers.get(method) || [];
    list.push(fn);
    this.handlers.set(method, list);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evalExpr(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Page eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }
  close() {
    this.ws.close();
  }
}

async function waitForJson(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const { server, port } = await startStaticServer();
const userDataDir = mkdtempSync(path.join(tmpdir(), 'aura-chrome-e2e-'));
const cdpPort = 9330 + Math.floor(Math.random() * 400);
const baseUrl = `http://127.0.0.1:${port}/`;

const chrome = spawn(
  CHROME_PATH,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1440,900',
    baseUrl,
  ],
  { stdio: 'ignore' }
);

let client = null;
const pageErrors = [];

try {
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  assert.ok(pageTarget?.webSocketDebuggerUrl, 'No Chrome page target found');

  client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });

  client.on('Runtime.exceptionThrown', (params) => {
    pageErrors.push(params.exceptionDetails?.text || 'Uncaught exception');
  });

  client.on('Fetch.requestPaused', async (ev) => {
    const { requestId, request } = ev;
    const url = request.url;
    try {
      const respondJson = (obj) =>
        client.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: '*' },
          ],
          body: Buffer.from(JSON.stringify(obj)).toString('base64'),
        });

      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        await client.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/css' }],
          body: '',
        });
      } else if (
        url.includes('saavn.sumit.co') ||
        url.includes('saavn.dev') ||
        url.includes('jiosaavn-api') ||
        url.includes('allorigins.win') ||
        url.includes('cors.lol') ||
        url.includes('proxy.cors.dev') ||
        url.includes('corsproxy.io')
      ) {
        // Simulate real browser CORS failure on Saavn & proxies so fallback is battle-tested!
        await client.send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
      } else if (url.includes('itunes.apple.com')) {
        const term = decodeURIComponent((url.split('term=')[1] || '').split('&')[0]).toLowerCase();
        const isTumHiHo = term.includes('tum hi ho');
        await respondJson({
          results: [
            {
              trackId: isTumHiHo ? 202 : 101,
              trackName: isTumHiHo ? 'Tum Hi Ho' : 'No Lie (feat. Dua Lipa)',
              artistName: isTumHiHo ? 'Mithoon & Arijit Singh' : 'Sean Paul & Dua Lipa',
              collectionName: isTumHiHo ? 'Aashiqui 2' : 'Mad Love',
              trackTimeMillis: isTumHiHo ? 262000 : 221000,
              artworkUrl100: '',
              previewUrl: `${baseUrl}mock-audio.wav`,
            },
          ],
        });
      } else if (url.includes('api.audius.co')) {
        await respondJson({ data: [] });
      } else if (url.includes('lrclib.net')) {
        if (url.includes('/api/get')) {
          await respondJson({
            trackName: 'No Lie',
            artistName: 'Sean Paul & Dua Lipa',
            duration: 221,
            syncedLyrics:
              '[00:00.20] Feel your eyes they all over me\n[00:01.80] Don\'t be shy take control of me\n[00:03.60] Get the vibe it\'s gonna be lit tonight\n[00:50.00] No lie we are shining bright tonight\n[00:53.00] No lie we are shining bright tonight',
          });
        } else {
          await respondJson([]);
        }
      } else {
        await client.send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
      }
    } catch {
      // ignore if page navigated
    }
  });

  await client.send('Page.reload', { ignoreCache: true });
  await delay(1400);

  // 1. Verify redesigned Home Screen, Verci x Lumn preset, & NO top header clipping at 1280x720!
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(250);
  const homeHeaderTop = await client.evalExpr(`
    (() => {
      const sc = document.querySelector('.overflow-y-auto');
      const hdr = sc?.firstElementChild?.firstElementChild;
      return hdr ? hdr.getBoundingClientRect().top : -999;
    })()
  `);
  assert.ok(homeHeaderTop >= 0, `Home top header was clipped above viewport at 1280x720: top=${homeHeaderTop}`);

  const homeText = await client.evalExpr('document.body.innerText');
  assert.ok(homeText.includes('AURA'), `Home should show AURA title: ${homeText}`);
  assert.ok(homeText.includes('Verci × Lumn'), `Home should show Verci × Lumn preset: ${homeText}`);
  assert.ok(/play instantly/i.test(homeText), `Home should show Play Instantly grid: ${homeText}`);

  // 1b. Verify Home SearchBar dropdown sits ABOVE StudioPopover when both are active!
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Studio'))?.click();
  `);
  await delay(200);
  await client.evalExpr(`
    (() => {
      const inp = document.querySelector('input[placeholder*="Search any song"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, 'No Lie');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('focus', { bubbles: true }));
    })()
  `);
  await delay(550);
  const homeZCheck = await client.evalExpr(`
    (() => {
      const inp = document.querySelector('input[placeholder*="Search any song"]');
      const dropdown = inp?.closest('.relative')?.querySelector('.oled-surface');
      if (!dropdown) return { ok: false, reason: 'no-home-dropdown' };
      const r = dropdown.getBoundingClientRect();
      const topEl = document.elementFromPoint(r.right - 20, r.top + 24);
      return { ok: dropdown.contains(topEl), topTag: topEl?.tagName || null };
    })()
  `);
  assert.equal(homeZCheck.ok, true, `Home search dropdown overlapped by StudioPopover: ${JSON.stringify(homeZCheck)}`);
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Studio'))?.click();
  `);
  await delay(150);

  await client.send('Emulation.clearDeviceMetricsOverride');
  await delay(150);

  // 2. Open Studio, switch to Audio & EQ, set Master Volume to 30%, reload, verify cookie persistence!
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Studio'))?.click();
  `);
  await delay(250);
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Audio & EQ'))?.click();
  `);
  await delay(250);
  const sliderSetOk = await client.evalExpr(`
    (() => {
      const slider = document.querySelector('input[aria-label="Master Volume"]');
      if (!slider) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(slider, '0.3');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
  assert.equal(sliderSetOk, true, 'Master Volume slider was not found');
  await delay(300);

  const cookieAfterSave = await client.evalExpr('document.cookie');
  assert.ok(cookieAfterSave.includes('aura_prefs_v1'), `Cookie aura_prefs_v1 must be set, got: ${cookieAfterSave}`);
  assert.ok(decodeURIComponent(cookieAfterSave).includes('"volume":0.3'), `Cookie must store volume:0.3, got: ${cookieAfterSave}`);

  // Reload page & verify 30% persisted!
  await client.send('Page.reload');
  await delay(1400);
  const reloadedHome = await client.evalExpr('document.body.innerText');
  assert.ok(/vol\s+30%\s+saved/i.test(reloadedHome), `Expected Vol 30% saved after reload, got: ${reloadedHome}`);

  // 3. Click first featured Play Instantly track card -> verify playing stage mounts, lyrics display immediately, Apple UI mode renders, and Lyrics Drawer does NOT auto-open!
  const clickedSong = await client.evalExpr(`
    (() => {
      const btn = Array.from(document.querySelectorAll('.oled-surface button')).find(b => /no lie|tum hi ho/i.test(b.innerText));
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  assert.equal(clickedSong, true, 'Could not find featured song card button to click');
  await delay(1400);

  const onPlayingStage = await client.evalExpr(`Boolean(document.querySelector('button[title*="Lyrics Timeline"]'))`);
  assert.equal(onPlayingStage, true, 'Expected Playing Stage dock to be mounted');

  const playingBody = await client.evalExpr('document.body.innerText');
  assert.ok(!playingBody.includes('Lyrics & Sync'), 'Lyrics drawer MUST NOT auto-open and block the stage');
  assert.ok(
    /no lie|feel your eyes|next lyric up/i.test(playingBody),
    `Expected visible lyrics or upcoming preview, got: ${playingBody}`
  );

  // 4. Switch visual worlds (Fisheye, Constellation, Cyber, Apple UI) cleanly without errors
  for (const worldLabel of ['Fisheye', 'Constellation', 'Cyber', 'Apple UI']) {
    await client.evalExpr(`
      Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '${worldLabel}')?.click();
    `);
    await delay(180);
    if (worldLabel === 'Constellation' || worldLabel === 'Cyber') {
      const hasStageCanvas = await client.evalExpr(`Boolean(document.querySelector('canvas[data-aura-stage-canvas="true"]'))`);
      assert.equal(hasStageCanvas, true, `Expected stage canvas to stay mounted in ${worldLabel}`);
    }
  }

  // 5. Open Lyrics Drawer AND type in compact SearchBar -> verify Search dropdown is ON TOP of drawer (zero overlap!)
  await client.evalExpr(`
    document.querySelector('button[title*="Lyrics Timeline"]')?.click();
  `);
  await delay(250);
  await client.evalExpr(`
    const inp = document.querySelector('input[placeholder*="Search song"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'Tum Hi Ho');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('focus', { bubbles: true }));
  `);
  await delay(650);

  const zCheck = await client.evalExpr(`
    (() => {
      const inp = document.querySelector('input[placeholder*="Search song"]');
      const dropdown = inp?.closest('.relative')?.querySelector('.oled-surface');
      if (!dropdown) return { ok: false, reason: 'no-dropdown' };
      const r = dropdown.getBoundingClientRect();
      const topEl = document.elementFromPoint(r.left + r.width * 0.5, r.top + 24);
      return {
        ok: dropdown.contains(topEl),
        dropdownTop: r.top,
        topTag: topEl?.tagName || null,
      };
    })()
  `);
  assert.equal(zCheck.ok, true, `Search dropdown was overlapped! ${JSON.stringify(zCheck)}`);

  // 6. Test Companion Screen (?mode=companion) loads synced dark floating card from snapshot!
  await client.send('Page.navigate', { url: `${baseUrl}?mode=companion` });
  await delay(900);
  const compText = await client.evalExpr('document.body.innerText');
  assert.ok(
    compText.includes('No Lie') || compText.includes('Tum Hi Ho') || compText.includes('AURA Companion'),
    `Companion screen failed to render: ${compText}`
  );

  assert.deepEqual(pageErrors, [], `Unexpected page runtime errors: ${JSON.stringify(pageErrors)}`);
  console.log('E2E_BROWSER_PASS: All 6 real Chromium checks succeeded with 0 uncaught runtime errors!');
} finally {
  try {
    client?.close();
  } catch {
    // ignore
  }
  try {
    chrome.kill('SIGKILL');
  } catch {
    // ignore
  }
  server.close();
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    // ignore locked chrome files on windows
  }
}
