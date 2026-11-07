import express, { Request, Response } from 'express';
import { Readable } from 'stream';

const UPSTREAM_ORIGIN = process.env.UPSTREAM_ORIGIN || 'https://ais-pre-puxho4o57upkknekv3mgg7-49225910278.asia-east1.run.app';
const AUTH_COOKIE = process.env.AUTH_COOKIE || '__SECURE-aistudio_auth_token=one_token_to_rule_them_all';

const app = express();

export const handleProxy = async (req: Request, res: Response) => {
  try {
    let reqPath = req.originalUrl || req.url || '/';

    // Check if query provided original path override from rewrite
    if (req.query?.__original_path && typeof req.query.__original_path === 'string') {
      reqPath = req.query.__original_path;
    }

    const targetUrl = new URL(reqPath, UPSTREAM_ORIGIN);
    targetUrl.searchParams.delete('__original_path');

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
      if (req.body) {
        if (Buffer.isBuffer(req.body)) {
          fetchOptions.body = req.body as any;
        } else if (typeof req.body === 'string') {
          fetchOptions.body = req.body;
        } else if (typeof req.body === 'object') {
          fetchOptions.body = JSON.stringify(req.body);
        }
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        if (chunks.length > 0) {
          fetchOptions.body = Buffer.concat(chunks) as any;
        }
      }
    }

    const upstreamRes = await fetch(targetUrl.toString(), fetchOptions);

    res.status(upstreamRes.status);

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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (upstreamRes.body) {
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

app.all('*', handleProxy);

export default function handler(req: any, res: any) {
  return app(req, res);
}
