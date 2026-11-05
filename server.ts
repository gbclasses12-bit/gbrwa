import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const UPSTREAM_URL = 'https://rwa.learnvortex.cc.cd';
const GUARD_TOKEN = '255a6b57';

// User requirements:
const APP_NAME = 'GB STUDY';
const TELEGRAM_URL = 'https://t.me/GBFreestudy';
const WHATSAPP_URL = 'https://whatsapp.com/channel/0029VbE9qxbLdQel3z7cMd1W';
const LOGO_URL = '/logo.png';

// In-memory cache for transformed assets
const jsCache = new Map<string, string>();
let cachedHtml = '';
let lastHtmlFetch = 0;

// Body parsers for API forwarding
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure public logo is served
app.get('/logo.png', (req: Request, res: Response) => {
  const localLogo = path.join(__dirname, 'public', 'logo.png');
  if (fs.existsSync(localLogo)) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(localLogo);
  }
  return res.redirect('https://i.ibb.co/mVjJG7Zg/1791541921524.png');
});

// 1. Critical Video Streaming Route: HLS Master Playlist /proxy?url=...
app.get('/proxy', async (req: Request, res: Response) => {
  try {
    const upstreamUrl = `${UPSTREAM_URL}${req.originalUrl}`;
    const response = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': UPSTREAM_URL,
        'Origin': UPSTREAM_URL,
      }
    });

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.setHeader('Access-Control-Allow-Origin', '*');

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('Error proxying HLS playlist (/proxy):', err);
    res.status(500).send('Error loading stream playlist');
  }
});

// 2. Critical Video Streaming Route: Video Chunks /segment?url=...
app.get('/segment', async (req: Request, res: Response) => {
  try {
    const upstreamUrl = `${UPSTREAM_URL}${req.originalUrl}`;
    const response = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': UPSTREAM_URL,
        'Origin': UPSTREAM_URL,
      }
    });

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.setHeader('Access-Control-Allow-Origin', '*');

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('Error proxying video chunk (/segment):', err);
    res.status(500).send('Error loading video segment');
  }
});

// 3. Proxy and transform /api/* (always inject valid guard token for video resolution)
app.use('/api', async (req: Request, res: Response) => {
  try {
    const upstreamApiUrl = `${UPSTREAM_URL}/api${req.url}`;
    const headers: Record<string, string> = {
      'User-Agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': (req.headers['accept'] as string) || '*/*',
      'Referer': UPSTREAM_URL,
      'Origin': UPSTREAM_URL,
      // Always pass the authentic token so video details API never returns 403
      'x-rwa-popup-guard': GUARD_TOKEN,
    };

    if (req.headers['authorization']) {
      headers['authorization'] = req.headers['authorization'] as string;
    }
    if (req.headers['cookie']) {
      headers['cookie'] = req.headers['cookie'] as string;
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      headers['content-type'] = 'application/json';
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(upstreamApiUrl, fetchOptions);
    
    // Pass headers
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('API proxy error:', err);
    res.status(500).json({ error: 'Proxy request failed', details: String(err) });
  }
});

// 4. Proxy and transform JavaScript assets
app.get('/assets/:assetName', async (req: Request, res: Response, next: NextFunction) => {
  const { assetName } = req.params;
  const isJs = assetName.endsWith('.js');
  const isCss = assetName.endsWith('.css');

  if (isJs && assetName.startsWith('index-')) {
    if (jsCache.has(assetName)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(jsCache.get(assetName));
    }

    try {
      const upstreamJsUrl = `${UPSTREAM_URL}/assets/${assetName}`;
      const response = await fetch(upstreamJsUrl);
      if (!response.ok) {
        return res.status(response.status).send('Asset not found');
      }

      let code = await response.text();

      // 1. Replace Xe (WhatsApp), Ze (Telegram), Qe (Logo)
      const xePattern = /var\s+Xe\s*=\s*Ye\(\[[^\]]+\]\)\s*,\s*Ze\s*=\s*Ye\(\[[^\]]+\]\)\s*,\s*Qe\s*=\s*Ye\(\[[^\]]+\]\)/;
      code = code.replace(
        xePattern,
        `var Xe="${WHATSAPP_URL}",Ze="${TELEGRAM_URL}",Qe="${LOGO_URL}"`
      );

      // 2. Make kt never throw and always pass authentic guard token
      code = code.replace(
        'if(mt())throw Error(`Popup integrity violation`);',
        '/* bypass */'
      );

      // 3. Make wt always return valid guard token
      code = code.replace(
        'return mt()?`tampered`:ot',
        `return "${GUARD_TOKEN}"`
      );

      // 4. Make mt always return false (no tampering triggered)
      code = code.replace(
        'function mt(){return it()?st:!1}',
        'function mt(){return !1}'
      );

      // 5. Neutralize tamper checks so popup can be closed and never blocks
      code = code.replace(
        /return\s+f\s*!==\s*`Join Our Channels!`\s*\|\|\s*p\s*!==\s*Qe\s*\?\s*\(_t\([^)]+\)\s*,\s*!1\)\s*:\s*!0/g,
        'return !0'
      );
      code = code.replace(
        /return\s+_t\(`Popup or channel buttons were hidden via CSS injection\.`\)\s*,\s*!1/g,
        'return !0'
      );

      // 6. Replace branding titles and labels
      code = code.replaceAll('"RWA Courses"', `"${APP_NAME} Courses"`);
      code = code.replaceAll('`RWA Courses`', `\`${APP_NAME} Courses\``);
      code = code.replaceAll('"RWA Logo"', `"${APP_NAME} Logo"`);
      code = code.replaceAll('`RWA Logo`', `\`${APP_NAME} Logo\``);
      code = code.replaceAll('`RWA`', `\`${APP_NAME}\``);
      code = code.replaceAll('"RWA"', `"${APP_NAME}"`);
      code = code.replaceAll('ROJGAR WITH ANKIT', APP_NAME);

      jsCache.set(assetName, code);

      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(code);
    } catch (err) {
      console.error('JS transform error:', err);
      return res.status(500).send('Failed to process JS asset');
    }
  }

  // Other assets (CSS, font, images)
  try {
    const upstreamAssetUrl = `${UPSTREAM_URL}/assets/${assetName}`;
    const response = await fetch(upstreamAssetUrl);
    if (!response.ok) {
      return res.status(response.status).send('Not found');
    }

    if (isCss) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    console.error('Asset fetch error:', err);
    return res.status(500).send('Error loading asset');
  }
});

// 5. HTML Transformation function
async function getTransformedHtml(): Promise<string> {
  const now = Date.now();
  if (cachedHtml && now - lastHtmlFetch < 60000) {
    return cachedHtml;
  }

  try {
    const response = await fetch(UPSTREAM_URL);
    let html = await response.text();

    // Replace Title
    html = html.replace(/<title>.*?<\/title>/i, `<title>${APP_NAME} — Free Batches, Lectures, PDFs & DPPs</title>`);

    // Replace Favicon
    html = html.replace(/<link[^>]*rel="icon"[^>]*>/gi, `<link rel="icon" type="image/png" href="${LOGO_URL}" />`);
    if (!html.includes('rel="icon"')) {
      html = html.replace('</head>', `<link rel="icon" type="image/png" href="${LOGO_URL}" /></head>`);
    }

    // Replace Meta tags
    html = html.replace(/<meta[^>]*name="description"[^>]*>/gi, `<meta name="description" content="${APP_NAME} - Free study batches, lectures, videos, PDFs, DPPs, and tests portal." />`);
    html = html.replace(/<meta[^>]*property="og:title"[^>]*>/gi, `<meta property="og:title" content="${APP_NAME}" />`);
    html = html.replace(/<meta[^>]*property="og:description"[^>]*>/gi, `<meta property="og:description" content="${APP_NAME} - Free study batches, lectures, videos, PDFs, DPPs, and tests portal." />`);

    // Client-side branding injection script
    const injectionScript = `
    <script>
      (function() {
        window.__GB_APP_CONFIG = {
          name: ${JSON.stringify(APP_NAME)},
          telegramUrl: ${JSON.stringify(TELEGRAM_URL)},
          whatsappUrl: ${JSON.stringify(WHATSAPP_URL)},
          logoUrl: ${JSON.stringify(LOGO_URL)}
        };

        // Enforce title & metadata
        document.title = window.__GB_APP_CONFIG.name + " — Free Batches, Lectures & PDFs";

        // DOM Observer to replace any lingering text/logos/links
        function applyBranding() {
          // Replace logo images
          var logos = document.querySelectorAll('img[src*="rwa"], img[src*="arzfun"], img[alt*="RWA"], img[alt*="Logo"], img[alt*="logo"]');
          logos.forEach(function(img) {
            if (img.src && !img.src.includes('logo.png')) {
              img.src = window.__GB_APP_CONFIG.logoUrl;
            }
          });

          // Replace text contents
          var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
          var node;
          while (node = walker.nextNode()) {
            if (node.nodeValue && (node.nodeValue.includes("RWA") || node.nodeValue.includes("ROJGAR WITH ANKIT") || node.nodeValue.includes("Aura Study"))) {
              node.nodeValue = node.nodeValue
                .replace(/ROJGAR WITH ANKIT/g, window.__GB_APP_CONFIG.name)
                .replace(/RWA Courses/g, window.__GB_APP_CONFIG.name + " Courses")
                .replace(/RWA/g, window.__GB_APP_CONFIG.name)
                .replace(/Aura Study/g, window.__GB_APP_CONFIG.name);
            }
          }

          // Replace links
          var links = document.querySelectorAll('a[href*="t.me"], a[href*="whatsapp.com"]');
          links.forEach(function(a) {
            if (a.href.includes('t.me')) {
              a.href = window.__GB_APP_CONFIG.telegramUrl;
            } else if (a.href.includes('whatsapp.com')) {
              a.href = window.__GB_APP_CONFIG.whatsappUrl;
            }
          });
        }

        // Run on load and periodically / on mutations
        document.addEventListener("DOMContentLoaded", applyBranding);
        setInterval(applyBranding, 800);
        var observer = new MutationObserver(applyBranding);
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // Add Quick Action Floating Buttons for Telegram & WhatsApp
        function addFloatingPills() {
          if (document.getElementById('gb-floating-actions')) return;
          var container = document.createElement('div');
          container.id = 'gb-floating-actions';
          container.style.cssText = 'position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:999999;font-family:system-ui,-apple-system,sans-serif;';
          
          container.innerHTML = \`
            <a href="\${window.__GB_APP_CONFIG.telegramUrl}" target="_blank" rel="noopener noreferrer" 
               style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:linear-gradient(135deg,#0088cc,#00a8e8);color:#fff;border-radius:30px;text-decoration:none;font-weight:700;font-size:13px;box-shadow:0 4px 15px rgba(0,136,204,0.4);transition:all 0.2s ease;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
              <span>Telegram</span>
            </a>
            <a href="\${window.__GB_APP_CONFIG.whatsappUrl}" target="_blank" rel="noopener noreferrer" 
               style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:linear-gradient(135deg,#25D366,#20ba5a);color:#fff;border-radius:30px;text-decoration:none;font-weight:700;font-size:13px;box-shadow:0 4px 15px rgba(37,211,102,0.4);transition:all 0.2s ease;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <span>WhatsApp</span>
            </a>
          \`;
          document.body.appendChild(container);
        }
        window.addEventListener('load', addFloatingPills);
        setTimeout(addFloatingPills, 1200);
      })();
    </script>
    `;

    html = html.replace('</body>', `${injectionScript}</body>`);

    cachedHtml = html;
    lastHtmlFetch = now;
    return html;
  } catch (err) {
    console.error('HTML fetch error:', err);
    throw err;
  }
}

// Routes for both root and /browse/:id
app.get(['/', '/browse', '/browse/:id', '/course/*', '/batch/*'], async (req: Request, res: Response) => {
  try {
    const html = await getTransformedHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send('<h1>GB STUDY</h1><p>Failed to load study portal. Please refresh.</p>');
  }
});

// Fallback for all other HTML / client-side routes
app.get('*', async (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/proxy') || req.path.startsWith('/segment') || req.path.includes('.')) {
    return next();
  }
  try {
    const html = await getTransformedHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next();
  }
});

if (process.env.VERCEL !== '1' && process.env.NOW_REGION === undefined) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GB STUDY proxy server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
