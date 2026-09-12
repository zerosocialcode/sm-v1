import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createServer as createViteServer } from 'vite';
import {
  createCloneJob,
  deleteJob,
  getAllJobs,
  getJob,
  getJobFile,
  subscribeToJob,
  buildStealthHeaders,
} from './server/clonerEngine.ts';
import { generateSpaInterceptorScript } from './server/spaInterceptor.ts';
import { CloneOptions } from './src/types.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.SPECTREMIRROR_DATA_DIR || path.join(os.tmpdir(), 'spectremirror_cloned_data');

async function proxyRemoteAsset(jobId: string, targetUrl: string, req: express.Request, res: express.Response) {
  try {
    const job = getJob(jobId);
    const userAgent = job?.options?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const referer = job?.metadata?.finalUrl || job?.url || '';
    const headers = buildStealthHeaders(userAgent, referer);
    if (req.headers['accept']) headers['Accept'] = String(req.headers['accept']);
    if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
      signal: controller.signal,
      redirect: 'follow',
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);

    res.removeHeader('X-Frame-Options');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const contentType = response.headers.get('content-type') || '';
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.status(response.status).send(buffer);
  } catch (err: any) {
    res.status(502).send('Gateway Proxy Error');
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/meta.json', (req, res) => {
    const metaPath = path.join(process.cwd(), 'meta.json');
    if (fs.existsSync(metaPath)) {
      res.sendFile(metaPath);
    } else {
      res.status(404).json({ error: 'meta.json not found' });
    }
  });

  app.post('/api/clone', async (req, res) => {
    try {
      const {
        url,
        downloadAssets = true,
        deepCssScan = true,
        keepExternalLinks = true,
        addFallbacks = true,
        disableActiveScripts = false,
        userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        timeoutMs = 30000,
      } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'A valid target URL is required' });
      }

      let normalizedUrl = url.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      const options: CloneOptions = {
        url: normalizedUrl,
        downloadAssets: Boolean(downloadAssets),
        deepCssScan: Boolean(deepCssScan),
        keepExternalLinks: Boolean(keepExternalLinks),
        addFallbacks: Boolean(addFallbacks),
        disableActiveScripts: Boolean(disableActiveScripts),
        userAgent: String(userAgent),
        timeoutMs: Number(timeoutMs) || 30000,
      };

      const job = await createCloneJob(options);
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to start cloning job' });
    }
  });

  app.get('/api/clones', (req, res) => {
    res.json(getAllJobs());
  });

  app.get('/api/clone/:id', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Clone job not found' });
    }
    res.json(job);
  });

  app.get('/api/clone/:id/events', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Clone job not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    for (const log of job.logs) {
      res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`);
    }

    const unsubscribe = subscribeToJob(job.id, (data) => {
      if ('level' in data) {
        res.write(`data: ${JSON.stringify({ type: 'log', data })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  app.get('/api/clone/:id/zip', (req, res) => {
    const filePath = getJobFile(req.params.id, 'bundle.zip');
    if (!filePath) {
      return res.status(404).json({ error: 'ZIP bundle not available or still building' });
    }

    const job = getJob(req.params.id);
    let hostname = 'site';
    try {
      if (job) hostname = new URL(job.url).hostname.replace(/[^a-z0-9]/gi, '_');
    } catch {}

    res.setHeader('Content-Disposition', `attachment; filename="clone_${hostname}_${req.params.id}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.sendFile(filePath);
  });

  app.get('/api/clone/:id/source', (req, res) => {
    const origPath = getJobFile(req.params.id, 'original.html');
    const rewritPath = getJobFile(req.params.id, 'index.html');
    const metaPath = getJobFile(req.params.id, '.spectremirror.json');

    if (!rewritPath) {
      return res.status(404).json({ error: 'Source files not found' });
    }

    const originalHtml = origPath && fs.existsSync(origPath) ? fs.readFileSync(origPath, 'utf8') : '';
    const rewrittenHtml = fs.existsSync(rewritPath) ? fs.readFileSync(rewritPath, 'utf8') : '';
    const metadata = metaPath && fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : '';

    res.json({
      originalHtml,
      rewrittenHtml,
      metadata: metadata ? JSON.parse(metadata) : null,
    });
  });

  app.get('/api/clone/:id/preview', (req, res) => {
    res.redirect(`/api/clone/${req.params.id}/preview/index.html`);
  });

  app.get('/api/clone/:id/preview/index.html', (req, res) => {
    const filePath = getJobFile(req.params.id, 'index.html');
    if (!filePath) {
      return res.status(404).send('<!DOCTYPE html><html><body><h3>Mirrored site not ready yet.</h3></body></html>');
    }

    let html = fs.readFileSync(filePath, 'utf8');
    html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
    html = html.replace(/<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '');

    const job = getJob(req.params.id);
    const sourceUrl = job?.url || '';
    const finalUrl = job?.metadata?.finalUrl || sourceUrl;
    const isMobile = /mobile|android|iphone|ipad/i.test(job?.options?.userAgent || '');
    const baseTag = `<base href="/api/clone/${req.params.id}/preview/">`;
    const spaScript = generateSpaInterceptorScript(req.params.id, sourceUrl, finalUrl, isMobile);
    const injection = `${baseTag}\n${spaScript}`;

    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n  ${injection}`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD>\n  ${injection}`);
    } else {
      html = `${injection}\n${html}`;
    }

    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
    res.send(html);
  });

  app.all('/api/clone/:id/proxy', async (req, res) => {
    const jobId = req.params.id;
    const job = getJob(jobId);
    let targetUrl = (req.query.url as string) || '';
    const relPath = (req.query.path as string) || '';

    if (!targetUrl && relPath) {
      const baseUrl = job?.metadata?.finalUrl || job?.url || '';
      if (!baseUrl) return res.status(404).send('Clone job not found');
      try {
        targetUrl = new URL(relPath, baseUrl).href;
      } catch {
        targetUrl = baseUrl.replace(/\/$/, '') + '/' + relPath.replace(/^\//, '');
      }
    }

    if (!job) {
      return res.status(404).send('Clone job not found');
    }

    if (!targetUrl) {
      return res.status(400).send('Target URL or path required');
    }

    try {
      const target = new URL(targetUrl);
      const base = new URL(job.metadata?.finalUrl || job.url);
      if (!['http:', 'https:'].includes(target.protocol)) {
        return res.status(400).send('Unsupported target protocol');
      }
      const allowedHosts = new Set<string>([base.hostname]);
      for (const asset of job.assets) {
        try {
          allowedHosts.add(new URL(asset.originalUrl).hostname);
        } catch {}
      }
      if (!allowedHosts.has(target.hostname) && !target.hostname.endsWith(`.${base.hostname}`)) {
        return res.status(403).send('Target outside clone resources');
      }
      targetUrl = target.href;
    } catch {
      return res.status(400).send('Invalid target URL');
    }

    await proxyRemoteAsset(jobId, targetUrl, req, res);
  });

  app.get('/api/clone/:id/preview/*', async (req, res) => {
    const relPath = req.params[0];
    const filePath = getJobFile(req.params.id, relPath);

    if (!filePath) {
      const job = getJob(req.params.id);
      if (job?.url) {
        try {
          const targetUrl = new URL(relPath, job.metadata?.finalUrl || job.url).href;
          return await proxyRemoteAsset(req.params.id, targetUrl, req, res);
        } catch {}
      }
      return res.status(404).send('Asset not found');
    }

    res.removeHeader('X-Frame-Options');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (lower.endsWith('.ts') || lower.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (lower.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (lower.endsWith('.woff2')) {
      res.setHeader('Content-Type', 'font/woff2');
    } else if (lower.endsWith('.woff')) {
      res.setHeader('Content-Type', 'font/woff');
    } else if (lower.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (lower.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    }

    res.sendFile(filePath);
  });

  app.delete('/api/clone/:id', (req, res) => {
    const success = deleteJob(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ success: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/cloned-data/**',
            '**/cloned-data*/**',
            '**/*cloned_data*/**',
            '**/*.zip',
            '**/tmp/**',
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
