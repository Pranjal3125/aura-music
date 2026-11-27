import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CAPTURE_DIR = process.env.AURA_CAPTURE_SCREENSHOTS_DIR || '';
if (CAPTURE_DIR) mkdirSync(CAPTURE_DIR, { recursive: true });

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
        const range = req.headers.range;
        if (range) {
          const match = /bytes=(\d+)-(\d*)/.exec(range);
          const start = match ? parseInt(match[1], 10) : 0;
          const end = match && match[2] ? Math.min(wav.length - 1, parseInt(match[2], 10)) : wav.length - 1;
          const chunk = wav.subarray(start, end + 1);
          res.writeHead(206, {
            'Content-Type': 'audio/wav',
            'Content-Range': `bytes ${start}-${end}/${wav.length}`,
            'Content-Length': String(chunk.length),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(chunk);
        } else {
          res.writeHead(200, {
            'Content-Type': 'audio/wav',
            'Content-Length': String(wav.length),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(wav);
        }
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
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let client = null;
const pageErrors = [];
const consoleErrors = [];
const requestedUrls = [];

try {
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  assert.ok(pageTarget?.webSocketDebuggerUrl, 'No Chrome page target found');

  client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });

  client.on('Runtime.exceptionThrown', (params) => {
    pageErrors.push(params.exceptionDetails?.text || 'Uncaught exception');
  });
  client.on('Log.entryAdded', (params) => {
    if (params.entry?.level === 'error') {
      consoleErrors.push(`${params.entry.text || 'Log error'}${params.entry.url ? ` :: ${params.entry.url}` : ''}`);
    }
  });
  client.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const msg = (params.args || []).map((a) => a.value || a.description || '').join(' ');
      consoleErrors.push(msg || 'Console error');
    }
  });

  client.on('Fetch.requestPaused', async (ev) => {
    const { requestId, request } = ev;
    const url = request.url;
    requestedUrls.push(url);
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
      } else if (url.includes('itunes.apple.com')) {
        const parsed = new URL(url);
        const term = (parsed.searchParams.get('term') || '').toLowerCase();
        const country = parsed.searchParams.get('country') || 'US';

        let item = {
          trackId: 101,
          trackName: 'No Lie (feat. Dua Lipa)',
          artistName: 'Sean Paul',
          collectionName: 'Mad Love',
          trackTimeMillis: 221000,
        };
        if (term.includes('starboy')) {
          item = { trackId: 102, trackName: 'Starboy', artistName: 'The Weeknd', collectionName: 'Starboy', trackTimeMillis: 230000 };
        } else if (term.includes('kesariya')) {
          item = { trackId: 103, trackName: 'Kesariya', artistName: 'Pritam & Arijit Singh', collectionName: 'Brahmastra', trackTimeMillis: 268000 };
        } else if (term.includes('tum hi ho')) {
          item = { trackId: 202, trackName: 'Tum Hi Ho', artistName: 'Mithoon & Arijit Singh', collectionName: 'Aashiqui 2', trackTimeMillis: 262000 };
        } else if (term.includes('apna bana le')) {
          item = { trackId: 105, trackName: 'Apna Bana Le', artistName: 'Sachin-Jigar & Arijit Singh', collectionName: 'Bhediya', trackTimeMillis: 261000 };
        } else if (term.includes('chaleya')) {
          item = { trackId: 106, trackName: 'Chaleya', artistName: 'Anirudh & Arijit Singh', collectionName: 'Jawan', trackTimeMillis: 200000 };
        } else if (term.includes('raataan lambiyan')) {
          item = { trackId: 107, trackName: 'Raataan Lambiyan', artistName: 'Tanishk Bagchi & Jubin Nautiyal', collectionName: 'Shershaah', trackTimeMillis: 230000 };
        } else if (term.includes('husn')) {
          item =
            country === 'IN'
              ? { trackId: 108, trackName: 'Husn', artistName: 'Anuv Jain', collectionName: 'Husn - Single', trackTimeMillis: 217000 }
              : { trackId: 908, trackName: 'Jain Husn Anuv', artistName: 'Marshlemon', collectionName: 'Knockoff', trackTimeMillis: 103000 };
        }

        await respondJson({
          results: [
            {
              ...item,
              artworkUrl100: '',
              previewUrl: `${baseUrl}mock-audio.wav`,
            },
          ],
        });
      } else if (url.includes('api.audius.co')) {
        await respondJson({ data: [] });
      } else if (url.includes('lrclib.net')) {
        if (url.includes('/api/search')) {
          const parsedLrc = new URL(url);
          const qText = `${parsedLrc.searchParams.get('q') || ''} ${parsedLrc.searchParams.get('track_name') || ''}`.toLowerCase();
          if (qText.includes('kesariya')) {
            await respondJson([
              {
                id: 303,
                trackName: 'Kesariya',
                artistName: 'Pritam, Arijit Singh',
                duration: 268,
                syncedLyrics:
                  '[00:14.00] Mujhko itna bataye koi\n[00:22.00] Kaise tujhse dil na lagaye koi\n[00:54.00] Kesariya tera ishq hai piya\n[01:32.00] Kesariya tera ishq hai piya\n[03:36.00] Chanda bhi deewana hai tera\n[03:42.00] Chanda bhi deewana hai tera\n[03:48.00] Chanda bhi deewana hai tera\n[03:54.00] Chanda bhi deewana hai tera',
              },
            ]);
          } else {
            await respondJson([]);
          }
        } else if (url.includes('/api/get')) {
          const parsedLrc = new URL(url);
          const tName = (parsedLrc.searchParams.get('track_name') || '').toLowerCase();
          if (tName.includes('kesariya')) {
            await client.send('Fetch.fulfillRequest', {
              requestId,
              responseCode: 404,
              responseHeaders: [
                { name: 'Content-Type', value: 'application/json' },
                { name: 'Access-Control-Allow-Origin', value: '*' },
              ],
              body: Buffer.from(JSON.stringify({ code: 404, name: 'TrackNotFound' })).toString('base64'),
            });
          } else if (tName.includes('tum hi ho')) {
            await respondJson({
              trackName: 'Tum Hi Ho',
              artistName: 'Arijit Singh',
              duration: 262,
              syncedLyrics:
                '[00:14.00] Hum tere bin ab reh nahi sakte\n[00:20.00] Tere bina kya wajood mera\n[00:46.00] Kyunki tum hi ho ab tum hi ho\n[00:52.00] Zindagi ab tum hi ho',
            });
          } else if (tName.includes('starboy')) {
            await respondJson({
              trackName: 'Starboy',
              artistName: 'The Weeknd',
              duration: 230,
              syncedLyrics:
                '[00:12.00] I am tryna put you in the worst mood\n[00:45.00] Look what you have done\n[00:48.00] I am a starboy',
            });
          } else {
            await respondJson({
              trackName: 'No Lie',
              artistName: 'Sean Paul & Dua Lipa',
              duration: 221,
              syncedLyrics:
                '[00:00.20] Feel your eyes they all over me\n[00:01.80] Don\'t be shy take control of me\n[00:03.60] Get the vibe it\'s gonna be lit tonight\n[00:50.00] No lie we are shining bright tonight\n[00:53.00] No lie we are shining bright tonight',
            });
          }
        } else {
          await respondJson([]);
        }
      } else if (url.includes('saavn.sumit.co')) {
        const parsedSaavn = new URL(url);
        const q = (parsedSaavn.searchParams.get('query') || '').toLowerCase();
        if (q.includes('tum hi ho')) {
          await respondJson({
            success: true,
            data: {
              results: [
                {
                  id: 'sv-tumhiho',
                  name: 'Tum Hi Ho',
                  duration: 262,
                  playCount: 95000000,
                  album: { name: 'Aashiqui 2' },
                  artists: { primary: [{ name: 'Mithoon' }, { name: 'Arijit Singh' }] },
                  image: [{ quality: '500x500', url: '' }],
                  downloadUrl: [{ quality: '320kbps', url: `${baseUrl}mock-audio.wav` }],
                },
              ],
            },
          });
        } else {
          await respondJson({ success: true, data: { results: [] } });
        }
      } else if (url.includes('api.lyrics.ovh')) {
        await respondJson({ lyrics: '' });
      } else {
        await client.send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
      }
    } catch {
      // ignore if page navigated
    }
  });

  await client.send('Page.navigate', { url: baseUrl });
  await delay(1400);

  // 0. Assert ZERO calls to dead Saavn/proxy endpoints and ZERO console errors on initial load!
  const deadCalls = requestedUrls.filter((u) =>
    /saavn\.sumit\.co|saavn\.dev|jiosaavn-api|allorigins\.win|cors\.lol|proxy\.cors\.dev|corsproxy\.io/i.test(u)
  );
  assert.deepEqual(deadCalls, [], `Dead/CORS-spamming endpoints were called on load: ${JSON.stringify(deadCalls)}`);
  assert.deepEqual(consoleErrors, [], `Expected zero console errors on initial load, got: ${JSON.stringify(consoleErrors)}`);

  // 1. Verify redesigned Home Screen, Verci x Lumn preset, NO Marshlemon knockoff, & NO top header clipping/overlap!
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
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
    assert.ok(homeHeaderTop >= 0, `Home top header clipped at ${vp.width}x${vp.height}: top=${homeHeaderTop}`);

    // Open Studio on Home and verify NONE of the top-right navbar buttons are overlapped by StudioPopover!
    await client.evalExpr(`
      Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Studio')?.click();
    `);
    await delay(220);
    const navOverlapCheck = await client.evalExpr(`
      (() => {
        const labels = ['YT / Spotify Tab', 'Mic', '2nd Screen', 'Studio'];
        return labels.map((lbl) => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes(lbl));
          if (!btn) return { lbl, ok: false, reason: 'missing' };
          const r = btn.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.5);
          return { lbl, ok: btn.contains(hit), top: r.top, bottom: r.bottom, hitTag: hit?.tagName || null };
        });
      })()
    `);
    for (const item of navOverlapCheck) {
      assert.equal(item.ok, true, `Home navbar button overlapped by Studio at ${vp.width}x${vp.height}: ${JSON.stringify(item)}`);
    }
    await client.evalExpr(`
      Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Studio')?.click();
    `);
    await delay(150);
  }

  // 1a. Mobile narrow viewport (390x844): single-row header, zero horizontal overflow, Studio button uncovered!
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(200);
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Studio')?.click();
  `);
  await delay(200);
  const mobileLayoutCheck = await client.evalExpr(`
    (() => {
      const sc = document.querySelector('.overflow-y-auto');
      const hdr = sc?.firstElementChild?.firstElementChild;
      const studioBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Studio');
      const r = studioBtn?.getBoundingClientRect();
      const hit = r ? document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.5) : null;
      return {
        headerHeight: hdr ? hdr.getBoundingClientRect().height : 999,
        scrollWidth: document.documentElement.scrollWidth,
        studioClickable: Boolean(studioBtn && studioBtn.contains(hit)),
      };
    })()
  `);
  assert.ok(mobileLayoutCheck.headerHeight <= 56, `Mobile Home header must stay single-row: ${JSON.stringify(mobileLayoutCheck)}`);
  assert.ok(mobileLayoutCheck.scrollWidth <= 390, `Mobile Home must not overflow horizontally: ${JSON.stringify(mobileLayoutCheck)}`);
  assert.equal(mobileLayoutCheck.studioClickable, true, `Mobile Studio button overlapped: ${JSON.stringify(mobileLayoutCheck)}`);
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Studio')?.click();
  `);
  await delay(150);

  // Restore 1280x720 for Studio + Search layering checks
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(200);

  const homeText = await client.evalExpr('document.body.innerText');
  if (CAPTURE_DIR) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(CAPTURE_DIR, 'home-screen.png'), Buffer.from(shot.data, 'base64'));
  }
  assert.ok(homeText.includes('AURA'), `Home should show AURA title: ${homeText}`);
  assert.ok(homeText.includes('Verci × Lumn'), `Home should show Verci × Lumn preset: ${homeText}`);
  assert.ok(/play instantly/i.test(homeText), `Home should show Play Instantly grid: ${homeText}`);
  assert.ok(homeText.includes('Husn') && homeText.includes('Anuv Jain'), 'Featured #8 should show authentic Husn by Anuv Jain');
  assert.ok(!/marshlemon|jain husn anuv/i.test(homeText), 'Featured grid must NOT contain Marshlemon knockoff');

  // 1b. Verify Studio sits ABOVE closed SearchBar & dimmed Featured cards, while open SearchBar dropdown sits ABOVE StudioPopover!
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Studio')?.click();
  `);
  await delay(200);
  const studioAboveClosedSearch = await client.evalExpr(`
    (() => {
      const studioTitle = Array.from(document.querySelectorAll('div')).find(d => d.innerText?.trim() === 'AURA STUDIO');
      const studioPanel = studioTitle?.closest('.fixed');
      const inp = document.querySelector('input[placeholder*="Search any song"]');
      if (!studioPanel || !inp) return { ok: false, reason: 'missing' };
      const sr = studioPanel.getBoundingClientRect();
      const ir = inp.getBoundingClientRect();
      // Point inside the overlap zone between StudioPopover left edge and SearchBar right edge
      const overlapX = Math.min(sr.right - 20, Math.max(sr.left + 12, ir.right - 12));
      const overlapY = ir.top + ir.height * 0.5;
      const topEl = document.elementFromPoint(overlapX, overlapY);
      return { ok: studioPanel.contains(topEl), topTag: topEl?.tagName || null };
    })()
  `);
  assert.equal(studioAboveClosedSearch.ok, true, `Closed SearchBar poked above StudioPopover: ${JSON.stringify(studioAboveClosedSearch)}`);

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
      const studioTitle = Array.from(document.querySelectorAll('div')).find(d => d.innerText?.trim() === 'AURA STUDIO');
      const studioPanel = studioTitle?.closest('.fixed');
      if (!dropdown || !studioPanel) return { ok: false, reason: 'no-home-dropdown-or-studio' };
      const r = dropdown.getBoundingClientRect();
      const topEl = document.elementFromPoint(r.right - 20, r.top + 24);
      const sr = studioPanel.getBoundingClientRect();
      const lowerStudioHit = document.elementFromPoint(sr.right - 30, sr.bottom - 30);
      return {
        ok: dropdown.contains(topEl),
        studioStillAboveCards: studioPanel.contains(lowerStudioHit),
        topTag: topEl?.tagName || null,
      };
    })()
  `);
  assert.equal(homeZCheck.ok, true, `Home search dropdown overlapped by StudioPopover: ${JSON.stringify(homeZCheck)}`);
  assert.equal(homeZCheck.studioStillAboveCards, true, `Home cards jumped above StudioPopover when Search opened: ${JSON.stringify(homeZCheck)}`);
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Studio')?.click();
  `);
  await delay(150);

  await client.send('Emulation.clearDeviceMetricsOverride');
  await delay(150);

  // 2. Open Studio, switch to Audio & EQ, set Master Volume to 30%, reload, verify cookie persistence!
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Studio')?.click();
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

  // 2b. Click Quick-Try chip -> start song -> click AURA back to Home -> verify dropdown does NOT re-open!
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Tum Hi Ho')?.click();
  `);
  await delay(650);
  const quickPickOk = await client.evalExpr(`
    (() => {
      const inp = document.querySelector('input[placeholder*="Search any song"]');
      const dropdown = inp?.closest('.relative')?.querySelector('.oled-surface');
      const btn = dropdown?.querySelector('button');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  assert.equal(quickPickOk, true, 'Quick-try chip should open search results and allow starting song');
  await delay(700);
  await client.evalExpr(`
    document.querySelector('button[title="Back to Home"]')?.click();
  `);
  await delay(550);
  const backHomeDropdownCount = await client.evalExpr(`
    (() => {
      const inp = document.querySelector('input[placeholder*="Search any song"]');
      const dropdown = inp?.closest('.relative')?.querySelector('.oled-surface');
      return { value: inp?.value || '', hasDropdown: Boolean(dropdown) };
    })()
  `);
  assert.equal(backHomeDropdownCount.hasDropdown, false, `Returning to Home via AURA must NOT reopen search dropdown: ${JSON.stringify(backHomeDropdownCount)}`);
  assert.equal(backHomeDropdownCount.value, '', 'Search input should be clean after returning Home via AURA');

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
  if (CAPTURE_DIR) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(CAPTURE_DIR, 'stage-nolie-apple-pay.png'), Buffer.from(shot.data, 'base64'));
  }

  // 4. Switch visual worlds (Fisheye, Constellation, Cyber) and verify Cyber preserves the EXACT canvas DOM node across auto-advance rollover!
  for (const worldLabel of ['Fisheye', 'Constellation', 'Cyber']) {
    await client.evalExpr(`
      Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '${worldLabel}')?.click();
    `);
    await delay(180);
    if (worldLabel === 'Constellation' || worldLabel === 'Cyber') {
      const hasStageCanvas = await client.evalExpr(`Boolean(document.querySelector('canvas[data-aura-stage-canvas="true"]'))`);
      assert.equal(hasStageCanvas, true, `Expected stage canvas to stay mounted in ${worldLabel}`);
    }
  }

  // Record the exact Cyber canvas DOM element reference before Next -> Starboy and ended -> Kesariya!
  const recordedCanvas = await client.evalExpr(`
    (() => {
      window.__cyberCanvasEl = document.querySelector('canvas[data-aura-stage-canvas="true"]');
      return Boolean(window.__cyberCanvasEl);
    })()
  `);
  assert.equal(recordedCanvas, true, 'Expected Cyber stage canvas to exist before rollover');

  // Trigger Next while in Cyber and verify exact same canvas element stays mounted and Cyber does NOT revert to Apple UI!
  await client.evalExpr(`
    (() => {
      const btn = document.querySelector('button[title="Next"]');
      btn?.click();
    })()
  `);
  await delay(80);
  const rolloverCanvas = await client.evalExpr(`document.querySelector('canvas[data-aura-stage-canvas="true"]') === window.__cyberCanvasEl`);
  assert.equal(rolloverCanvas, true, 'Exact stage canvas node must remain continuously mounted during Next rollover in Cyber');
  await delay(900);
  const afterRolloverCheck = await client.evalExpr(`
    (() => {
      const sameCanvas = document.querySelector('canvas[data-aura-stage-canvas="true"]') === window.__cyberCanvasEl;
      const cyberBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cyber');
      const cyberActive = cyberBtn ? cyberBtn.className.includes('text-black') : false;
      return { sameCanvas, cyberActive };
    })()
  `);
  assert.equal(afterRolloverCheck.sameCanvas, true, 'Exact stage canvas node must remain mounted after Next in Cyber');
  assert.equal(afterRolloverCheck.cyberActive, true, 'Cyber must NOT revert to Apple UI after Next');

  // Also test genuine HTMLAudioElement 'ended' auto-advance rollover onto Kesariya (3rd featured song) via seek near end of mock-audio.wav!
  await client.evalExpr(`
    (() => {
      const bar = document.querySelector('[data-aura-seekbar="true"]');
      if (bar) {
        const r = bar.getBoundingClientRect();
        bar.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.98, clientY: r.top + r.height * 0.5 }));
      }
    })()
  `);
  await delay(1400);
  const afterAutoEnded = await client.evalExpr(`
    (() => {
      const sameCanvas = document.querySelector('canvas[data-aura-stage-canvas="true"]') === window.__cyberCanvasEl;
      const cyberBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cyber');
      const cyberActive = cyberBtn ? cyberBtn.className.includes('text-black') : false;
      const text = document.body.innerText;
      return { sameCanvas, cyberActive, text };
    })()
  `);
  assert.equal(afterAutoEnded.sameCanvas, true, 'Exact stage canvas node must remain mounted after audio ended auto-advance in Cyber');
  assert.equal(afterAutoEnded.cyberActive, true, 'Cyber must NOT revert to Apple UI after audio ended auto-advance');
  assert.ok(afterAutoEnded.text.includes('Kesariya'), `Expected ended rollover to advance to Kesariya, got: ${afterAutoEnded.text}`);
  assert.ok(
    afterAutoEnded.text.includes('Studio-calibrated sync at 0:49') || afterAutoEnded.text.includes('+49.0s'),
    `Kesariya must studio-calibrate at 0:49, NOT outro 3:36: ${afterAutoEnded.text}`
  );
  assert.equal(
    requestedUrls.some((u) => u.includes('lrclib.net/api/get') && u.toLowerCase().includes('kesariya')),
    false,
    'Kesariya matched via /api/search must NOT call /api/get (avoids 404 console spam)'
  );

  // Switch back to Apple UI for final check
  await client.evalExpr(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Apple UI')?.click();
  `);
  await delay(220);

  // 4b. Verify zero per-frame root CSS var thrash + active GPU leaf-ref Lumn edge lighting!
  const edgePerfCheck = await client.evalExpr(`
    (() => {
      const rootChild = document.querySelector('#root')?.firstElementChild;
      const rim = document.querySelector('.aura-edge-rim');
      const beat = document.querySelector('.aura-edge-beat-flash');
      const bloom = document.querySelector('.aura-edge-bloom');
      const lumnCanvas = document.querySelector('canvas[data-aura-lumn-canvas="true"]');
      return {
        hasLegacyGlowVar: Boolean(rootChild?.style?.getPropertyValue('--aura-glow-alpha')),
        hasLegacyPulseVar: Boolean(rootChild?.style?.getPropertyValue('--aura-pulse-alpha')),
        hasFilmGrain: Boolean(document.querySelector('.aura-film-grain')),
        hasLumnCanvas: Boolean(lumnCanvas && lumnCanvas.width > 0 && lumnCanvas.height > 0),
        rimOpacity: rim?.style?.opacity || '',
        beatOpacity: beat?.style?.opacity || '',
        bloomOpacity: bloom?.style?.opacity || '',
      };
    })()
  `);
  assert.equal(edgePerfCheck.hasLegacyGlowVar, false, `Legacy root --aura-glow-alpha must NOT be mutated per frame: ${JSON.stringify(edgePerfCheck)}`);
  assert.equal(edgePerfCheck.hasLegacyPulseVar, false, `Legacy root --aura-pulse-alpha must NOT be mutated per frame: ${JSON.stringify(edgePerfCheck)}`);
  assert.equal(edgePerfCheck.hasFilmGrain, false, 'Heavy SVG feTurbulence .aura-film-grain must be removed');
  assert.equal(edgePerfCheck.hasLumnCanvas, true, `GPU LumnEdgeCanvas must be mounted and sized: ${JSON.stringify(edgePerfCheck)}`);
  assert.ok(parseFloat(edgePerfCheck.rimOpacity) > 0.4, `Leaf .aura-edge-rim must be actively driven via inline opacity: ${JSON.stringify(edgePerfCheck)}`);
  assert.ok(edgePerfCheck.beatOpacity !== '', `Leaf .aura-edge-beat-flash must be wired to rAF: ${JSON.stringify(edgePerfCheck)}`);

  if (CAPTURE_DIR) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(CAPTURE_DIR, 'stage-apple-ui.png'), Buffer.from(shot.data, 'base64'));
  }

  // 4c. Click Synced / Tap-Sync button on 30s preview -> verify drawer opens with coarse -5s/+5s, Jump cues, Replay, and tap-to-lock!
  const tappedSyncBtn = await client.evalExpr(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => {
        const t = b.innerText.trim();
        return t === 'Tap-Sync' || t === 'Synced';
      });
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  assert.equal(tappedSyncBtn, true, '30s preview dock must surface 1-click Synced/Tap-Sync button');
  await delay(250);
  const drawerSyncControls = await client.evalExpr(`
    (() => {
      const text = document.body.innerText;
      return {
        hasCoarseMinus: text.includes('-5s'),
        hasCoarsePlus: text.includes('+5s'),
        hasReplay: text.includes('Replay'),
        hasJump: text.includes('JUMP:') || text.includes('Jump:'),
      };
    })()
  `);
  assert.equal(drawerSyncControls.hasCoarseMinus, true, `Expected -5s coarse sync button: ${JSON.stringify(drawerSyncControls)}`);
  assert.equal(drawerSyncControls.hasCoarsePlus, true, `Expected +5s coarse sync button: ${JSON.stringify(drawerSyncControls)}`);
  assert.equal(drawerSyncControls.hasReplay, true, `Expected Replay button in sync drawer: ${JSON.stringify(drawerSyncControls)}`);
  assert.equal(drawerSyncControls.hasJump, true, `Expected 1-click Jump section cues: ${JSON.stringify(drawerSyncControls)}`);

  // Tap Kesariya chorus line in drawer to lock exact sync
  await client.evalExpr(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Kesariya tera ishq hai piya'));
      btn?.click();
    })()
  `);
  await delay(220);
  const lockedState = await client.evalExpr(`
    (() => {
      const text = document.body.innerText;
      return { hasLockedBadge: text.includes('LOCKED'), hasSyncedDockBtn: text.includes('Synced') };
    })()
  `);
  assert.equal(lockedState.hasLockedBadge, true, `Expected LOCKED badge after tap-to-sync: ${JSON.stringify(lockedState)}`);
  assert.equal(lockedState.hasSyncedDockBtn, true, `Expected dock pill to switch to Synced: ${JSON.stringify(lockedState)}`);

  // 5. With Lyrics Drawer already open, type in compact SearchBar -> verify Search dropdown is ON TOP of drawer (zero overlap!)
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
    compText.includes('Kesariya') && compText.includes('Kesariya tera ishq hai piya'),
    `Companion screen failed to render synced Kesariya snapshot: ${compText}`
  );
  if (CAPTURE_DIR) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(CAPTURE_DIR, 'companion-screen.png'), Buffer.from(shot.data, 'base64'));
  }

  assert.deepEqual(pageErrors, [], `Unexpected page runtime errors: ${JSON.stringify(pageErrors)}`);
  assert.deepEqual(consoleErrors, [], `Unexpected console errors during session: ${JSON.stringify(consoleErrors)}`);
  console.log('E2E_BROWSER_PASS: All real Chromium checks succeeded with 0 console errors & 0 runtime exceptions!');
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
