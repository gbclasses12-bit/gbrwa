import express, { Request, Response } from 'express';
import { Readable } from 'stream';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const UPSTREAM_ORIGIN = 'https://ais-pre-puxho4o57upkknekv3mgg7-49225910278.asia-east1.run.app';
const AUTH_COOKIE = '__SECURE-aistudio_auth_token=one_token_to_rule_them_all';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Proxy handler for batches, subjects, videos, test series, streaming, and PDFs
  const handleProxy = async (req: Request, res: Response) => {
    try {
      const targetUrl = new URL(req.url, UPSTREAM_ORIGIN);

      const headers: Record<string, string> = {
        'cookie': AUTH_COOKIE,
        'user-agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      if (req.headers['authorization']) headers['authorization'] = req.headers['authorization'] as string;
      if (req.headers['range']) headers['range'] = req.headers['range'] as string;
      if (req.headers['x-portal-guard']) headers['x-portal-guard'] = req.headers['x-portal-guard'] as string;
      if (req.headers['accept']) headers['accept'] = req.headers['accept'] as string;
      if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'] as string;

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
        redirect: 'follow',
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        if (chunks.length > 0) {
          fetchOptions.body = Buffer.concat(chunks) as any;
        }
      }

      const upstreamRes = await fetch(targetUrl.toString(), fetchOptions);

      res.status(upstreamRes.status);

      // Forward relevant headers
      const headerNames = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
        'etag',
        'content-disposition',
        'last-modified',
      ];

      for (const name of headerNames) {
        const val = upstreamRes.headers.get(name);
        if (val) {
          res.setHeader(name, val);
        }
      }

      // Add CORS headers so video and pdf render without browser restrictions
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (upstreamRes.body) {
        // Stream the response directly to client
        Readable.fromWeb(upstreamRes.body as any).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      console.error('Proxy request error:', err);
      if (!res.headersSent) {
        res.status(502).json({
          status: 502,
          message: 'Error connecting to educational upstream server. Please try again.',
        });
      }
    }
  };

  // Mount API & resource proxy endpoints
  app.all('/api/*', handleProxy);
  app.all('/rwa.php*', handleProxy);
  app.all('/pdf*', handleProxy);
  app.all('/video*', handleProxy);

  // Health check endpoint
  app.get('/healthz', (_req, res) => {
    res.status(200).send('OK');
  });

  // Handle SPA deep links like /rwax/content.html?id=... and /content.html
  app.get(['/rwax/content.html', '/rwax/*', '/content.html', '/content.html*'], (req, _res, next) => {
    req.url = '/index.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    next();
  });

  // Vite dev server integration vs production static serving
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GB STUDY server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
