import * as cheerio from 'cheerio';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { CloneJob, CloneJobMetadata, CloneOptions, ClonedAsset, LogEntry } from '../src/types.ts';
import { formatBytes } from '../src/utils.ts';

const DATA_DIR = process.env.SPECTREMIRROR_DATA_DIR || path.join(os.tmpdir(), 'spectremirror_cloned_data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const jobs = new Map<string, CloneJob>();
const jobEventEmitters = new Map<string, Set<(entry: LogEntry | { type: 'progress'; progress: number; step: string }) => void>>();

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\0]/g, '')
    .replace(/\s+/g, '_')
    .trim();
}

function getSafeFilename(urlString: string, suggestedExt: string = ''): string {
  try {
    const urlObj = new URL(urlString);
    let pathname = urlObj.pathname;
    let base = path.basename(pathname);
    const hash = crypto.createHash('md5').update(urlString).digest('hex').substring(0, 8);

    base = base.split('?')[0].split('#')[0];
    base = sanitizeFilename(base);

    let ext = path.extname(base);
    let nameWithoutExt = ext ? base.slice(0, -ext.length) : base;
    if (suggestedExt && (!ext || ['.php', '.aspx', '.jsp', '.do', '.ashx', '.bin', '.cgi'].includes(ext.toLowerCase()))) {
      ext = suggestedExt;
    }

    if (!nameWithoutExt || nameWithoutExt === '/' || nameWithoutExt.length > 50) {
      nameWithoutExt = `asset_${hash}`;
    }
    if (urlObj.search && !nameWithoutExt.includes(hash)) {
      return `${nameWithoutExt}_${hash}${ext || suggestedExt || '.bin'}`;
    }

    return `${nameWithoutExt}${ext || suggestedExt || '.bin'}`;
  } catch {
    const hash = crypto.createHash('md5').update(urlString).digest('hex').substring(0, 8);
    return `asset_${hash}${suggestedExt || '.bin'}`;
  }
}

export function buildStealthHeaders(userAgent: string, referer?: string): Record<string, string> {
  const isMobile = /mobile|android|iphone|ipad|ipod/i.test(userAgent);
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  const isAndroid = /android/i.test(userAgent);
  const isMac = /macintosh|mac os/i.test(userAgent);
  const isWindows = /windows nt/i.test(userAgent);

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  };

  if (referer) {
    headers['Referer'] = referer;
  }
  if (!isIos) {
    headers['Sec-Ch-Ua'] = isMobile
      ? '"Chromium";v="124", "Android WebView";v="124", "Not-A.Brand";v="99"'
      : '"Chromium";v="124", "Not-A.Brand";v="99"';
    headers['Sec-Ch-Ua-Mobile'] = isMobile ? '?1' : '?0';
    headers['Sec-Ch-Ua-Platform'] = isAndroid
      ? '"Android"'
      : isMac
      ? '"macOS"'
      : isWindows
      ? '"Windows"'
      : '"Linux"';
  }

  headers['Sec-Fetch-Dest'] = 'document';
  headers['Sec-Fetch-Mode'] = 'navigate';
  headers['Sec-Fetch-Site'] = 'none';
  headers['Sec-Fetch-User'] = '?1';

  return headers;
}

function resolveAssetUrl(assetUrl: string, baseUrl: string): string | null {
  try {
    if (!assetUrl || assetUrl.startsWith('data:') || assetUrl.startsWith('javascript:') || assetUrl.startsWith('#')) {
      return null;
    }
    const resolved = new URL(assetUrl, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}

export function getJob(id: string): CloneJob | undefined {
  return jobs.get(id);
}

export function getAllJobs(): CloneJob[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function deleteJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  jobs.delete(id);
  jobEventEmitters.delete(id);
  const jobDir = path.join(DATA_DIR, id);
  if (fs.existsSync(jobDir)) {
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
    } catch {
    }
  }
  return true;
}

export function subscribeToJob(
  id: string,
  listener: (entry: LogEntry | { type: 'progress'; progress: number; step: string }) => void
): () => void {
  if (!jobEventEmitters.has(id)) {
    jobEventEmitters.set(id, new Set());
  }
  jobEventEmitters.get(id)!.add(listener);
  return () => {
    jobEventEmitters.get(id)?.delete(listener);
  };
}

function emitJobLog(job: CloneJob, level: LogEntry['level'], message: string, tag?: string) {
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    message,
    tag,
  };
  job.logs.push(entry);
  const listeners = jobEventEmitters.get(job.id);
  if (listeners) {
    listeners.forEach((l) => l(entry));
  }
}

function updateJobProgress(job: CloneJob, progress: number, currentStep: string) {
  job.progress = Math.min(100, Math.max(0, Math.round(progress)));
  job.currentStep = currentStep;
  const listeners = jobEventEmitters.get(job.id);
  if (listeners) {
    listeners.forEach((l) => l({ type: 'progress', progress: job.progress, step: currentStep }));
  }
}

export async function createCloneJob(options: CloneOptions): Promise<CloneJob> {
  for (const [existingId] of jobs.entries()) {
    deleteJob(existingId);
  }

  const id = crypto.randomUUID().slice(0, 8);
  const job: CloneJob = {
    id,
    url: options.url,
    options,
    status: 'pending',
    progress: 0,
    currentStep: 'Initialized',
    createdAt: new Date().toISOString(),
    assets: [],
    logs: [],
    hasZip: false,
  };

  jobs.set(id, job);
  runCloneProcess(job).catch((err) => {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    emitJobLog(job, 'error', `Execution terminated: ${job.error}`, 'ERROR');
  });

  return job;
}

async function runCloneProcess(job: CloneJob) {
  const startTime = Date.now();
  job.status = 'running';
  const jobDir = path.join(DATA_DIR, job.id);
  const assetsDir = path.join(jobDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, 'options.json'), JSON.stringify(job.options, null, 2), 'utf8');

  emitJobLog(job, 'info', `Initializing cloning pipeline for: ${job.url}`, 'INIT');
  emitJobLog(job, 'info', `Target client signature: ${job.options.userAgent}`, 'CONFIG');
  emitJobLog(job, 'info', `Asset harvesting: ${job.options.downloadAssets ? 'Enabled' : 'Disabled'} | Fallbacks: ${job.options.addFallbacks ? 'Enabled' : 'Disabled'}`, 'CONFIG');
  updateJobProgress(job, 10, 'Establishing connection to target host');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(job.url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('URL must start with http:// or https://');
    }
  } catch (err: any) {
    throw new Error(`Invalid URL '${job.url}': ${err.message}`);
  }

  emitJobLog(job, 'info', `Establishing HTTP connection to target host...`, 'NETWORK');
  
  const headers = buildStealthHeaders(job.options.userAgent);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), job.options.timeoutMs || 30000);

  let rawHtml = '';
  let statusCode = 200;
  let contentType = 'text/html';
  let finalUrl = job.url;

  try {
    const response = await fetch(job.url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);
    statusCode = response.status;
    contentType = response.headers.get('content-type') || 'text/html';
    if (response.url) {
      finalUrl = response.url;
      if (finalUrl !== job.url) {
        emitJobLog(job, 'info', `Followed redirect to: ${finalUrl}`, 'REDIRECT');
      }
    }

    if (!response.ok) {
      emitJobLog(job, 'warn', `Received non-200 HTTP response status: ${statusCode}`, 'HTTP');
    }

    rawHtml = await response.text();
    emitJobLog(job, 'success', `Fetched HTML document (${formatBytes(Buffer.byteLength(rawHtml, 'utf8'))})`, 'FETCH');
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(`Failed to fetch target page: ${err.message}`);
  }

  fs.writeFileSync(path.join(jobDir, 'original.html'), rawHtml, 'utf8');
  updateJobProgress(job, 30, 'Parsing DOM and discovering assets');
  emitJobLog(job, 'info', `Parsing document DOM and extracting resource references...`, 'DOM');

  const $ = cheerio.load(rawHtml);
  const pageTitle = $('title').first().text().trim() || parsedUrl.hostname;
  const isSpa =
    rawHtml.includes('__NEXT_DATA__') ||
    rawHtml.includes('ng-version') ||
    rawHtml.includes('data-reactroot') ||
    rawHtml.includes('window._sharedData') ||
    rawHtml.includes('react') ||
    $('app-root, [id="root"], [id="__next"], [id="app"]').length > 0;

  if (isSpa) {
    emitJobLog(
      job,
      'warn',
      `SPA framework detected; client modules require local HTTP server for full dynamic execution`,
      'SPA'
    );
  }

  interface DiscoveredAsset {
    element: any;
    attr: string;
    type: ClonedAsset['type'];
    rawUrl: string;
    resolvedUrl: string;
  }

  const discovered: DiscoveredAsset[] = [];
  const seenUrls = new Set<string>();
  const addAsset = (el: any, attr: string, type: ClonedAsset['type']) => {
    const raw = $(el).attr(attr);
    if (!raw) return;
    const resolved = resolveAssetUrl(raw, finalUrl);
    if (!resolved) return;
    discovered.push({ element: el, attr, type, rawUrl: raw, resolvedUrl: resolved });
    seenUrls.add(resolved);
  };

  $('img').each((_, el) => addAsset(el, 'src', 'image'));
  $('picture source[srcset], source[srcset]').each((_, el) => {
    const raw = $(el).attr('srcset') || '';
    for (const candidate of raw.split(',').map((value) => value.trim()).filter(Boolean)) {
      const urlPart = candidate.split(/\s+/)[0];
      const resolved = resolveAssetUrl(urlPart, finalUrl);
      if (resolved) {
        discovered.push({ element: el, attr: 'srcset', type: 'image', rawUrl: raw, resolvedUrl: resolved });
        seenUrls.add(resolved);
      }
    }
  });
  $('link[rel="stylesheet"]').each((_, el) => addAsset(el, 'href', 'stylesheet'));
  $('script[src]').each((_, el) => addAsset(el, 'src', 'script'));
  $('link[rel*="icon"]').each((_, el) => addAsset(el, 'href', 'icon'));

  emitJobLog(job, 'info', `Discovered ${discovered.length} total resource references (${seenUrls.size} unique)`, 'ASSETS');

  const downloadedMap = new Map<string, { localRelPath: string; size: number; mime: string }>();
  let assetsDownloaded = 0;
  let assetsFailed = 0;
  let totalDownloadedBytes = Buffer.byteLength(rawHtml, 'utf8');

  if (job.options.downloadAssets && seenUrls.size > 0) {
    updateJobProgress(job, 45, 'Downloading page assets');
    const uniqueUrlList = Array.from(seenUrls);
    const concurrencyLimit = 6;
    let completedCount = 0;

    const downloadOne = async (assetUrl: string) => {
      try {
        const assetController = new AbortController();
        const assetTimeout = setTimeout(() => assetController.abort(), 15000);

        const assetHeaders: Record<string, string> = {
          'User-Agent': job.options.userAgent,
          'Referer': finalUrl,
          'Accept': '*/*',
        };
        const isMobile = /mobile|android|iphone|ipad|ipod/i.test(job.options.userAgent);
        if (isMobile) {
          assetHeaders['Sec-Ch-Ua-Mobile'] = '?1';
        }

        const res = await fetch(assetUrl, {
          headers: assetHeaders,
          signal: assetController.signal,
        });
        clearTimeout(assetTimeout);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const mime = (res.headers.get('content-type') || '').toLowerCase();
        let subfolder = 'misc';
        let suggestedExt = '';

        if (mime.includes('text/css') || assetUrl.match(/\.(css)($|\?)/i)) {
          subfolder = 'css';
          suggestedExt = '.css';
        } else if (
          mime.includes('javascript') ||
          mime.includes('ecmascript') ||
          assetUrl.match(/\.(js|mjs)($|\?)/i)
        ) {
          subfolder = 'js';
          suggestedExt = '.js';
        } else if (mime.includes('image/svg') || assetUrl.match(/\.svg($|\?)/i)) {
          subfolder = 'images';
          suggestedExt = '.svg';
        } else if (mime.includes('image/png') || assetUrl.match(/\.png($|\?)/i)) {
          subfolder = 'images';
          suggestedExt = '.png';
        } else if (mime.includes('image/jpeg') || assetUrl.match(/\.(jpe?g)($|\?)/i)) {
          subfolder = 'images';
          suggestedExt = '.jpg';
        } else if (mime.includes('image/webp') || assetUrl.match(/\.webp($|\?)/i)) {
          subfolder = 'images';
          suggestedExt = '.webp';
        } else if (mime.includes('image/avif') || assetUrl.match(/\.avif($|\?)/i)) {
          subfolder = 'images';
          suggestedExt = '.avif';
        } else if (mime.includes('image/gif') || assetUrl.match(/\.gif($|\?)/i)) {
          subfolder = 'images';
          suggestedExt = '.gif';
        } else if (mime.includes('image/') || assetUrl.match(/\.(ico|bmp)($|\?)/i)) {
          subfolder = 'images';
          suggestedExt = assetUrl.match(/\.ico($|\?)/i) ? '.ico' : '.png';
        } else if (mime.includes('font') || assetUrl.match(/\.(woff2?|ttf|otf|eot)($|\?)/i)) {
          subfolder = 'fonts';
          suggestedExt = assetUrl.match(/\.woff2($|\?)/i) ? '.woff2' : '.woff';
        }

        const subDir = path.join(assetsDir, subfolder);
        if (!fs.existsSync(subDir)) {
          fs.mkdirSync(subDir, { recursive: true });
        }

        const safeFilename = getSafeFilename(assetUrl, suggestedExt);
        const localFilePath = path.join(subDir, safeFilename);
        const localRelPath = `assets/${subfolder}/${safeFilename}`;

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(localFilePath, buffer);

        downloadedMap.set(assetUrl, {
          localRelPath,
          size: buffer.byteLength,
          mime: mime || 'application/octet-stream',
        });

        totalDownloadedBytes += buffer.byteLength;
        assetsDownloaded++;
        emitJobLog(job, 'info', `Saved: ${safeFilename} (${formatBytes(buffer.byteLength)})`, 'DOWNLOAD');
      } catch (err: any) {
        assetsFailed++;
        emitJobLog(job, 'warn', `Asset omitted (${assetUrl}): ${err.message}`, 'FETCH_SKIP');
      } finally {
        completedCount++;
        const currentProgress = 45 + Math.round((completedCount / uniqueUrlList.length) * 35);
        updateJobProgress(job, currentProgress, `Downloading assets (${completedCount}/${uniqueUrlList.length})`);
      }
    };

    for (let i = 0; i < uniqueUrlList.length; i += concurrencyLimit) {
      const batch = uniqueUrlList.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map(downloadOne));
    }

    emitJobLog(
      job,
      'success',
      `Asset pipeline finished: ${assetsDownloaded} downloaded, ${assetsFailed} skipped/failed`,
      'ASSETS'
    );
  } else {
    emitJobLog(job, 'info', `Asset download skipped per configuration`, 'ASSETS');
  }

  if (job.options.downloadAssets && job.options.deepCssScan) {
    const cssQueue = Array.from(downloadedMap.entries()).filter(([, value]) => value.mime.includes('text/css') || value.localRelPath.toLowerCase().endsWith('.css'));
    const processedCss = new Set<string>();
    let cssIndex = 0;
    while (cssIndex < cssQueue.length) {
      const [cssUrl, cssInfo] = cssQueue[cssIndex++];
      if (processedCss.has(cssUrl)) continue;
      processedCss.add(cssUrl);
      const cssPath = path.join(jobDir, cssInfo.localRelPath);
      if (!fs.existsSync(cssPath)) continue;

      let css = fs.readFileSync(cssPath, 'utf8');
      const cssBase = cssUrl;
      const refs = [
        ...Array.from(css.matchAll(/url\(\s*(["']?)([^"'\)\s]+)\1\s*\)/gi)).map((match) => match[2]),
        ...Array.from(css.matchAll(/@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?/gi)).map((match) => match[2]),
      ];
      const uniqueRefs = Array.from(new Set(refs));
      for (const ref of uniqueRefs) {
        const resolved = resolveAssetUrl(ref, cssBase);
        if (!resolved) continue;
        let local = downloadedMap.get(resolved);
        if (!local) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(resolved, { headers: { 'User-Agent': job.options.userAgent, 'Referer': cssBase, 'Accept': '*/*' }, signal: controller.signal });
            clearTimeout(timer);
            if (!response.ok) continue;
            const mime = (response.headers.get('content-type') || 'application/octet-stream').toLowerCase();
            const extMatch = resolved.match(/\.(woff2?|ttf|otf|eot|svg|png|jpe?g|gif|webp|avif|css)(?:$|\?)/i);
            const ext = extMatch ? `.${extMatch[1].toLowerCase()}`.replace('.jpeg', '.jpg') : (mime.includes('font') ? '.woff2' : mime.includes('css') ? '.css' : '');
            const folder = mime.includes('font') || /\.(woff2?|ttf|otf|eot)(?:$|\?)/i.test(resolved) ? 'fonts' : mime.includes('css') || /\.css(?:$|\?)/i.test(resolved) ? 'css' : mime.includes('image') || /\.(svg|png|jpe?g|gif|webp|avif)(?:$|\?)/i.test(resolved) ? 'images' : 'misc';
            const dir = path.join(assetsDir, folder);
            fs.mkdirSync(dir, { recursive: true });
            const filename = getSafeFilename(resolved, ext);
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(path.join(dir, filename), buffer);
            local = { localRelPath: `assets/${folder}/${filename}`, size: buffer.byteLength, mime };
            downloadedMap.set(resolved, local);
            assetsDownloaded++;
            totalDownloadedBytes += buffer.byteLength;
            job.assets.push({ id: crypto.randomUUID().slice(0, 8), type: folder === 'fonts' ? 'font' : folder === 'images' ? 'image' : folder === 'css' ? 'stylesheet' : 'other', originalUrl: resolved, localPath: local.localRelPath, sizeBytes: local.size, mimeType: local.mime, status: 'downloaded' });
            if (mime.includes('text/css') || local.localRelPath.endsWith('.css')) cssQueue.push([resolved, local]);
          } catch {
            assetsFailed++;
            continue;
          }
        }
        const cssLocalPath = path.posix.relative(path.posix.dirname(cssInfo.localRelPath), local.localRelPath) || path.posix.basename(local.localRelPath);
        const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        css = css.replace(new RegExp(`(url\\(\\s*["']?)${escapedRef}(["']?\\s*\\))`, 'g'), `$1${cssLocalPath}$2`);
        css = css.replace(new RegExp(`(@import\\s+["'])${escapedRef}(["'])`, 'g'), `$1${cssLocalPath}$2`);
      }
      fs.writeFileSync(cssPath, css, 'utf8');
    }
  }

  updateJobProgress(job, 85, 'Rewriting links & asset paths');
  emitJobLog(job, 'info', `Rewriting DOM element paths and injecting resilience handlers...`, 'REWRITE');

  const srcsetReplacements = new Map<any, Map<string, string>>();
  for (const item of discovered) {
    if (item.attr !== 'srcset') continue;
    const downloaded = downloadedMap.get(item.resolvedUrl);
    if (!srcsetReplacements.has(item.element)) srcsetReplacements.set(item.element, new Map());
    srcsetReplacements.get(item.element)!.set(item.resolvedUrl, downloaded?.localRelPath || item.resolvedUrl);
  }

  for (const item of discovered) {
    if (item.attr === 'srcset') continue;
    const downloaded = downloadedMap.get(item.resolvedUrl);
    if (downloaded) {
      $(item.element).attr(item.attr, downloaded.localRelPath);
      if (job.options.addFallbacks && item.type === 'image') {
        $(item.element).attr('onerror', `this.onerror=null; this.src='${item.resolvedUrl}';`);
      }
    } else {
      $(item.element).attr(item.attr, item.resolvedUrl);
    }
  }

  for (const [element, replacements] of srcsetReplacements) {
    const original = $(element).attr('srcset') || '';
    const rewritten = original.split(',').map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return trimmed;
      const parts = trimmed.split(/\s+/);
      const resolved = resolveAssetUrl(parts[0], finalUrl);
      if (!resolved) return trimmed;
      const replacement = replacements.get(resolved) || resolved;
      return [replacement, ...parts.slice(1)].join(' ');
    }).join(', ');
    $(element).attr('srcset', rewritten);
  }

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href');
    if (!rawHref) return;
    if (rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) {
      return;
    }
    const resolved = resolveAssetUrl(rawHref, finalUrl);
    if (resolved) {
      if (job.options.keepExternalLinks) {
        $(el).attr('href', resolved);
        $(el).attr('target', '_blank');
        $(el).attr('rel', 'noopener noreferrer');
      }
    }
  });

  if (job.options.disableActiveScripts) {
    emitJobLog(
      job,
      'info',
      `Static freeze mode active: neutralizing client-side scripts`,
      'FREEZE'
    );
    $('script').each((_, el) => {
      $(el).attr('type', 'text/plain');
      $(el).attr('data-spectremirror-inert', 'true');
    });
  }

  $('head').prepend(`
<meta name="generator" content="SpectreMirror Web v1.0.0">
`);

  const processedHtml = $.html();
  const finalIndexPath = path.join(jobDir, 'index.html');
  fs.writeFileSync(finalIndexPath, processedHtml, 'utf8');

  for (const item of discovered) {
    const downloaded = downloadedMap.get(item.resolvedUrl);
    const existing = job.assets.find((a) => a.originalUrl === item.resolvedUrl);
    if (!existing) {
      job.assets.push({
        id: crypto.randomUUID().slice(0, 8),
        type: item.type,
        originalUrl: item.resolvedUrl,
        localPath: downloaded ? downloaded.localRelPath : item.resolvedUrl,
        sizeBytes: downloaded ? downloaded.size : 0,
        mimeType: downloaded ? downloaded.mime : 'unknown',
        status: downloaded ? 'downloaded' : 'skipped',
      });
    }
  }

  const metadata: CloneJobMetadata = {
    clonedAt: new Date().toISOString(),
    sourceUrl: job.url,
    finalUrl,
    pageTitle,
    assetsDownloaded,
    assetsFailed,
    totalAssets: seenUrls.size,
    totalSizeText: formatBytes(totalDownloadedBytes),
    downloadTimeMs: Date.now() - startTime,
    statusCode,
    contentType,
  };
  job.metadata = metadata;

  fs.writeFileSync(
    path.join(jobDir, '.spectremirror.json'),
    JSON.stringify(metadata, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(jobDir, 'options.json'),
    JSON.stringify(job.options, null, 2),
    'utf8'
  );

  updateJobProgress(job, 95, 'Packaging ZIP archive bundle');
  emitJobLog(job, 'info', `Building offline archive package...`, 'BUNDLE');

  try {
    const zip = new JSZip();
    zip.file('index.html', processedHtml);
    zip.file('.spectremirror.json', JSON.stringify(metadata, null, 2));
    zip.file(
      'README.txt',
      `Mirrored Website Archive\n` +
      `=======================\n\n` +
      `Source URL: ${job.url}\n` +
      `Cloned At: ${metadata.clonedAt}\n` +
      `Downloaded Assets: ${assetsDownloaded}\n` +
      `Total Size: ${metadata.totalSizeText}\n\n` +
      `HOW TO VIEW:\n` +
      `1. Extract this archive.\n` +
      `2. For static pages, open index.html directly in your browser.\n` +
      `3. For single-page applications with dynamic JavaScript modules, run a local web server:\n` +
      `     npx serve .\n` +
      `   or\n` +
      `     python -m http.server 8080\n\n` +
      `All downloaded assets are located in the /assets folder.\n`
    );

    const addDirectoryToZip = (dirPath: string, zipFolder: JSZip) => {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const subZip = zipFolder.folder(file);
          if (subZip) {
            addDirectoryToZip(fullPath, subZip);
          }
        } else {
          const content = fs.readFileSync(fullPath);
          zipFolder.file(file, content);
        }
      }
    };

    const assetsZipFolder = zip.folder('assets');
    if (assetsZipFolder) {
      addDirectoryToZip(assetsDir, assetsZipFolder);
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    fs.writeFileSync(path.join(jobDir, 'bundle.zip'), zipBuffer);
    job.hasZip = true;
    emitJobLog(job, 'success', `Archive bundle created successfully (${formatBytes(zipBuffer.byteLength)})`, 'BUNDLE');
  } catch (err: any) {
    emitJobLog(job, 'warn', `Archive generation warning: ${err.message}`, 'BUNDLE_WARN');
  }

  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  updateJobProgress(job, 100, 'Cloning completed successfully');
  emitJobLog(job, 'success', `Mirroring completed successfully in ${((Date.now() - startTime) / 1000).toFixed(2)}s`, 'COMPLETE');
}

export function getJobDir(id: string): string {
  return path.join(DATA_DIR, id);
}

export function getJobFile(id: string, relPath: string): string | null {
  const jobDir = path.resolve(DATA_DIR, id);
  const resolved = path.resolve(jobDir, relPath);
  const relative = path.relative(jobDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(resolved)) {
    return null;
  }
  return resolved;
}
