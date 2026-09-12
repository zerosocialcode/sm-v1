var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_os2 = __toESM(require("os"), 1);
var import_vite = require("vite");

// server/clonerEngine.ts
var cheerio = __toESM(require("cheerio"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_os = __toESM(require("os"), 1);
var import_path = __toESM(require("path"), 1);
var import_jszip = __toESM(require("jszip"), 1);

// src/utils.ts
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// server/clonerEngine.ts
var DATA_DIR = process.env.SPECTREMIRROR_DATA_DIR || import_path.default.join(import_os.default.tmpdir(), "spectremirror_cloned_data");
if (!import_fs.default.existsSync(DATA_DIR)) {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
var jobs = /* @__PURE__ */ new Map();
var jobEventEmitters = /* @__PURE__ */ new Map();
function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*]/g, "_").replace(/[\0]/g, "").replace(/\s+/g, "_").trim();
}
function getSafeFilename(urlString, suggestedExt = "") {
  try {
    const urlObj = new URL(urlString);
    let pathname = urlObj.pathname;
    let base = import_path.default.basename(pathname);
    const hash = import_crypto.default.createHash("md5").update(urlString).digest("hex").substring(0, 8);
    base = base.split("?")[0].split("#")[0];
    base = sanitizeFilename(base);
    let ext = import_path.default.extname(base);
    let nameWithoutExt = ext ? base.slice(0, -ext.length) : base;
    if (suggestedExt && (!ext || [".php", ".aspx", ".jsp", ".do", ".ashx", ".bin", ".cgi"].includes(ext.toLowerCase()))) {
      ext = suggestedExt;
    }
    if (!nameWithoutExt || nameWithoutExt === "/" || nameWithoutExt.length > 50) {
      nameWithoutExt = `asset_${hash}`;
    }
    if (urlObj.search && !nameWithoutExt.includes(hash)) {
      return `${nameWithoutExt}_${hash}${ext || suggestedExt || ".bin"}`;
    }
    return `${nameWithoutExt}${ext || suggestedExt || ".bin"}`;
  } catch {
    const hash = import_crypto.default.createHash("md5").update(urlString).digest("hex").substring(0, 8);
    return `asset_${hash}${suggestedExt || ".bin"}`;
  }
}
function buildStealthHeaders(userAgent, referer) {
  const isMobile = /mobile|android|iphone|ipad|ipod/i.test(userAgent);
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  const isAndroid = /android/i.test(userAgent);
  const isMac = /macintosh|mac os/i.test(userAgent);
  const isWindows = /windows nt/i.test(userAgent);
  const headers = {
    "User-Agent": userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1"
  };
  if (referer) {
    headers["Referer"] = referer;
  }
  if (!isIos) {
    headers["Sec-Ch-Ua"] = isMobile ? '"Chromium";v="124", "Android WebView";v="124", "Not-A.Brand";v="99"' : '"Chromium";v="124", "Not-A.Brand";v="99"';
    headers["Sec-Ch-Ua-Mobile"] = isMobile ? "?1" : "?0";
    headers["Sec-Ch-Ua-Platform"] = isAndroid ? '"Android"' : isMac ? '"macOS"' : isWindows ? '"Windows"' : '"Linux"';
  }
  headers["Sec-Fetch-Dest"] = "document";
  headers["Sec-Fetch-Mode"] = "navigate";
  headers["Sec-Fetch-Site"] = "none";
  headers["Sec-Fetch-User"] = "?1";
  return headers;
}
function resolveAssetUrl(assetUrl, baseUrl) {
  try {
    if (!assetUrl || assetUrl.startsWith("data:") || assetUrl.startsWith("javascript:") || assetUrl.startsWith("#")) {
      return null;
    }
    const resolved = new URL(assetUrl, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}
function getJob(id) {
  return jobs.get(id);
}
function getAllJobs() {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
function deleteJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  jobs.delete(id);
  jobEventEmitters.delete(id);
  const jobDir = import_path.default.join(DATA_DIR, id);
  if (import_fs.default.existsSync(jobDir)) {
    try {
      import_fs.default.rmSync(jobDir, { recursive: true, force: true });
    } catch {
    }
  }
  return true;
}
function subscribeToJob(id, listener) {
  if (!jobEventEmitters.has(id)) {
    jobEventEmitters.set(id, /* @__PURE__ */ new Set());
  }
  jobEventEmitters.get(id).add(listener);
  return () => {
    jobEventEmitters.get(id)?.delete(listener);
  };
}
function emitJobLog(job, level, message, tag) {
  const entry = {
    id: import_crypto.default.randomUUID(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    message,
    tag
  };
  job.logs.push(entry);
  const listeners = jobEventEmitters.get(job.id);
  if (listeners) {
    listeners.forEach((l) => l(entry));
  }
}
function updateJobProgress(job, progress, currentStep) {
  job.progress = Math.min(100, Math.max(0, Math.round(progress)));
  job.currentStep = currentStep;
  const listeners = jobEventEmitters.get(job.id);
  if (listeners) {
    listeners.forEach((l) => l({ type: "progress", progress: job.progress, step: currentStep }));
  }
}
async function createCloneJob(options) {
  for (const [existingId] of jobs.entries()) {
    deleteJob(existingId);
  }
  const id = import_crypto.default.randomUUID().slice(0, 8);
  const job = {
    id,
    url: options.url,
    options,
    status: "pending",
    progress: 0,
    currentStep: "Initialized",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    assets: [],
    logs: [],
    hasZip: false
  };
  jobs.set(id, job);
  runCloneProcess(job).catch((err) => {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    emitJobLog(job, "error", `Execution terminated: ${job.error}`, "ERROR");
  });
  return job;
}
async function runCloneProcess(job) {
  const startTime = Date.now();
  job.status = "running";
  const jobDir = import_path.default.join(DATA_DIR, job.id);
  const assetsDir = import_path.default.join(jobDir, "assets");
  import_fs.default.mkdirSync(assetsDir, { recursive: true });
  import_fs.default.writeFileSync(import_path.default.join(jobDir, "options.json"), JSON.stringify(job.options, null, 2), "utf8");
  emitJobLog(job, "info", `Initializing cloning pipeline for: ${job.url}`, "INIT");
  emitJobLog(job, "info", `Target client signature: ${job.options.userAgent}`, "CONFIG");
  emitJobLog(job, "info", `Asset harvesting: ${job.options.downloadAssets ? "Enabled" : "Disabled"} | Fallbacks: ${job.options.addFallbacks ? "Enabled" : "Disabled"}`, "CONFIG");
  updateJobProgress(job, 10, "Establishing connection to target host");
  let parsedUrl;
  try {
    parsedUrl = new URL(job.url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("URL must start with http:// or https://");
    }
  } catch (err) {
    throw new Error(`Invalid URL '${job.url}': ${err.message}`);
  }
  emitJobLog(job, "info", `Establishing HTTP connection to target host...`, "NETWORK");
  const headers = buildStealthHeaders(job.options.userAgent);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), job.options.timeoutMs || 3e4);
  let rawHtml = "";
  let statusCode = 200;
  let contentType = "text/html";
  let finalUrl = job.url;
  try {
    const response = await fetch(job.url, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "follow"
    });
    clearTimeout(timeout);
    statusCode = response.status;
    contentType = response.headers.get("content-type") || "text/html";
    if (response.url) {
      finalUrl = response.url;
      if (finalUrl !== job.url) {
        emitJobLog(job, "info", `Followed redirect to: ${finalUrl}`, "REDIRECT");
      }
    }
    if (!response.ok) {
      emitJobLog(job, "warn", `Received non-200 HTTP response status: ${statusCode}`, "HTTP");
    }
    rawHtml = await response.text();
    emitJobLog(job, "success", `Fetched HTML document (${formatBytes(Buffer.byteLength(rawHtml, "utf8"))})`, "FETCH");
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Failed to fetch target page: ${err.message}`);
  }
  import_fs.default.writeFileSync(import_path.default.join(jobDir, "original.html"), rawHtml, "utf8");
  updateJobProgress(job, 30, "Parsing DOM and discovering assets");
  emitJobLog(job, "info", `Parsing document DOM and extracting resource references...`, "DOM");
  const $ = cheerio.load(rawHtml);
  const pageTitle = $("title").first().text().trim() || parsedUrl.hostname;
  const isSpa = rawHtml.includes("__NEXT_DATA__") || rawHtml.includes("ng-version") || rawHtml.includes("data-reactroot") || rawHtml.includes("window._sharedData") || rawHtml.includes("react") || $('app-root, [id="root"], [id="__next"], [id="app"]').length > 0;
  if (isSpa) {
    emitJobLog(
      job,
      "warn",
      `SPA framework detected; client modules require local HTTP server for full dynamic execution`,
      "SPA"
    );
  }
  const discovered = [];
  const seenUrls = /* @__PURE__ */ new Set();
  const addAsset = (el, attr, type) => {
    const raw = $(el).attr(attr);
    if (!raw) return;
    const resolved = resolveAssetUrl(raw, finalUrl);
    if (!resolved) return;
    discovered.push({ element: el, attr, type, rawUrl: raw, resolvedUrl: resolved });
    seenUrls.add(resolved);
  };
  $("img").each((_, el) => addAsset(el, "src", "image"));
  $("picture source[srcset], source[srcset]").each((_, el) => {
    const raw = $(el).attr("srcset") || "";
    for (const candidate of raw.split(",").map((value) => value.trim()).filter(Boolean)) {
      const urlPart = candidate.split(/\s+/)[0];
      const resolved = resolveAssetUrl(urlPart, finalUrl);
      if (resolved) {
        discovered.push({ element: el, attr: "srcset", type: "image", rawUrl: raw, resolvedUrl: resolved });
        seenUrls.add(resolved);
      }
    }
  });
  $('link[rel="stylesheet"]').each((_, el) => addAsset(el, "href", "stylesheet"));
  $("script[src]").each((_, el) => addAsset(el, "src", "script"));
  $('link[rel*="icon"]').each((_, el) => addAsset(el, "href", "icon"));
  emitJobLog(job, "info", `Discovered ${discovered.length} total resource references (${seenUrls.size} unique)`, "ASSETS");
  const downloadedMap = /* @__PURE__ */ new Map();
  let assetsDownloaded = 0;
  let assetsFailed = 0;
  let totalDownloadedBytes = Buffer.byteLength(rawHtml, "utf8");
  if (job.options.downloadAssets && seenUrls.size > 0) {
    updateJobProgress(job, 45, "Downloading page assets");
    const uniqueUrlList = Array.from(seenUrls);
    const concurrencyLimit = 6;
    let completedCount = 0;
    const downloadOne = async (assetUrl) => {
      try {
        const assetController = new AbortController();
        const assetTimeout = setTimeout(() => assetController.abort(), 15e3);
        const assetHeaders = {
          "User-Agent": job.options.userAgent,
          "Referer": finalUrl,
          "Accept": "*/*"
        };
        const isMobile = /mobile|android|iphone|ipad|ipod/i.test(job.options.userAgent);
        if (isMobile) {
          assetHeaders["Sec-Ch-Ua-Mobile"] = "?1";
        }
        const res = await fetch(assetUrl, {
          headers: assetHeaders,
          signal: assetController.signal
        });
        clearTimeout(assetTimeout);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const mime = (res.headers.get("content-type") || "").toLowerCase();
        let subfolder = "misc";
        let suggestedExt = "";
        if (mime.includes("text/css") || assetUrl.match(/\.(css)($|\?)/i)) {
          subfolder = "css";
          suggestedExt = ".css";
        } else if (mime.includes("javascript") || mime.includes("ecmascript") || assetUrl.match(/\.(js|mjs)($|\?)/i)) {
          subfolder = "js";
          suggestedExt = ".js";
        } else if (mime.includes("image/svg") || assetUrl.match(/\.svg($|\?)/i)) {
          subfolder = "images";
          suggestedExt = ".svg";
        } else if (mime.includes("image/png") || assetUrl.match(/\.png($|\?)/i)) {
          subfolder = "images";
          suggestedExt = ".png";
        } else if (mime.includes("image/jpeg") || assetUrl.match(/\.(jpe?g)($|\?)/i)) {
          subfolder = "images";
          suggestedExt = ".jpg";
        } else if (mime.includes("image/webp") || assetUrl.match(/\.webp($|\?)/i)) {
          subfolder = "images";
          suggestedExt = ".webp";
        } else if (mime.includes("image/avif") || assetUrl.match(/\.avif($|\?)/i)) {
          subfolder = "images";
          suggestedExt = ".avif";
        } else if (mime.includes("image/gif") || assetUrl.match(/\.gif($|\?)/i)) {
          subfolder = "images";
          suggestedExt = ".gif";
        } else if (mime.includes("image/") || assetUrl.match(/\.(ico|bmp)($|\?)/i)) {
          subfolder = "images";
          suggestedExt = assetUrl.match(/\.ico($|\?)/i) ? ".ico" : ".png";
        } else if (mime.includes("font") || assetUrl.match(/\.(woff2?|ttf|otf|eot)($|\?)/i)) {
          subfolder = "fonts";
          suggestedExt = assetUrl.match(/\.woff2($|\?)/i) ? ".woff2" : ".woff";
        }
        const subDir = import_path.default.join(assetsDir, subfolder);
        if (!import_fs.default.existsSync(subDir)) {
          import_fs.default.mkdirSync(subDir, { recursive: true });
        }
        const safeFilename = getSafeFilename(assetUrl, suggestedExt);
        const localFilePath = import_path.default.join(subDir, safeFilename);
        const localRelPath = `assets/${subfolder}/${safeFilename}`;
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        import_fs.default.writeFileSync(localFilePath, buffer);
        downloadedMap.set(assetUrl, {
          localRelPath,
          size: buffer.byteLength,
          mime: mime || "application/octet-stream"
        });
        totalDownloadedBytes += buffer.byteLength;
        assetsDownloaded++;
        emitJobLog(job, "info", `Saved: ${safeFilename} (${formatBytes(buffer.byteLength)})`, "DOWNLOAD");
      } catch (err) {
        assetsFailed++;
        emitJobLog(job, "warn", `Asset omitted (${assetUrl}): ${err.message}`, "FETCH_SKIP");
      } finally {
        completedCount++;
        const currentProgress = 45 + Math.round(completedCount / uniqueUrlList.length * 35);
        updateJobProgress(job, currentProgress, `Downloading assets (${completedCount}/${uniqueUrlList.length})`);
      }
    };
    for (let i = 0; i < uniqueUrlList.length; i += concurrencyLimit) {
      const batch = uniqueUrlList.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map(downloadOne));
    }
    emitJobLog(
      job,
      "success",
      `Asset pipeline finished: ${assetsDownloaded} downloaded, ${assetsFailed} skipped/failed`,
      "ASSETS"
    );
  } else {
    emitJobLog(job, "info", `Asset download skipped per configuration`, "ASSETS");
  }
  if (job.options.downloadAssets && job.options.deepCssScan) {
    const cssQueue = Array.from(downloadedMap.entries()).filter(([, value]) => value.mime.includes("text/css") || value.localRelPath.toLowerCase().endsWith(".css"));
    const processedCss = /* @__PURE__ */ new Set();
    let cssIndex = 0;
    while (cssIndex < cssQueue.length) {
      const [cssUrl, cssInfo] = cssQueue[cssIndex++];
      if (processedCss.has(cssUrl)) continue;
      processedCss.add(cssUrl);
      const cssPath = import_path.default.join(jobDir, cssInfo.localRelPath);
      if (!import_fs.default.existsSync(cssPath)) continue;
      let css = import_fs.default.readFileSync(cssPath, "utf8");
      const cssBase = cssUrl;
      const refs = [
        ...Array.from(css.matchAll(/url\(\s*(["']?)([^"'\)\s]+)\1\s*\)/gi)).map((match) => match[2]),
        ...Array.from(css.matchAll(/@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?/gi)).map((match) => match[2])
      ];
      const uniqueRefs = Array.from(new Set(refs));
      for (const ref of uniqueRefs) {
        const resolved = resolveAssetUrl(ref, cssBase);
        if (!resolved) continue;
        let local = downloadedMap.get(resolved);
        if (!local) {
          try {
            const controller2 = new AbortController();
            const timer = setTimeout(() => controller2.abort(), 15e3);
            const response = await fetch(resolved, { headers: { "User-Agent": job.options.userAgent, "Referer": cssBase, "Accept": "*/*" }, signal: controller2.signal });
            clearTimeout(timer);
            if (!response.ok) continue;
            const mime = (response.headers.get("content-type") || "application/octet-stream").toLowerCase();
            const extMatch = resolved.match(/\.(woff2?|ttf|otf|eot|svg|png|jpe?g|gif|webp|avif|css)(?:$|\?)/i);
            const ext = extMatch ? `.${extMatch[1].toLowerCase()}`.replace(".jpeg", ".jpg") : mime.includes("font") ? ".woff2" : mime.includes("css") ? ".css" : "";
            const folder = mime.includes("font") || /\.(woff2?|ttf|otf|eot)(?:$|\?)/i.test(resolved) ? "fonts" : mime.includes("css") || /\.css(?:$|\?)/i.test(resolved) ? "css" : mime.includes("image") || /\.(svg|png|jpe?g|gif|webp|avif)(?:$|\?)/i.test(resolved) ? "images" : "misc";
            const dir = import_path.default.join(assetsDir, folder);
            import_fs.default.mkdirSync(dir, { recursive: true });
            const filename = getSafeFilename(resolved, ext);
            const buffer = Buffer.from(await response.arrayBuffer());
            import_fs.default.writeFileSync(import_path.default.join(dir, filename), buffer);
            local = { localRelPath: `assets/${folder}/${filename}`, size: buffer.byteLength, mime };
            downloadedMap.set(resolved, local);
            assetsDownloaded++;
            totalDownloadedBytes += buffer.byteLength;
            job.assets.push({ id: import_crypto.default.randomUUID().slice(0, 8), type: folder === "fonts" ? "font" : folder === "images" ? "image" : folder === "css" ? "stylesheet" : "other", originalUrl: resolved, localPath: local.localRelPath, sizeBytes: local.size, mimeType: local.mime, status: "downloaded" });
            if (mime.includes("text/css") || local.localRelPath.endsWith(".css")) cssQueue.push([resolved, local]);
          } catch {
            assetsFailed++;
            continue;
          }
        }
        const cssLocalPath = import_path.default.posix.relative(import_path.default.posix.dirname(cssInfo.localRelPath), local.localRelPath) || import_path.default.posix.basename(local.localRelPath);
        const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        css = css.replace(new RegExp(`(url\\(\\s*["']?)${escapedRef}(["']?\\s*\\))`, "g"), `$1${cssLocalPath}$2`);
        css = css.replace(new RegExp(`(@import\\s+["'])${escapedRef}(["'])`, "g"), `$1${cssLocalPath}$2`);
      }
      import_fs.default.writeFileSync(cssPath, css, "utf8");
    }
  }
  updateJobProgress(job, 85, "Rewriting links & asset paths");
  emitJobLog(job, "info", `Rewriting DOM element paths and injecting resilience handlers...`, "REWRITE");
  const srcsetReplacements = /* @__PURE__ */ new Map();
  for (const item of discovered) {
    if (item.attr !== "srcset") continue;
    const downloaded = downloadedMap.get(item.resolvedUrl);
    if (!srcsetReplacements.has(item.element)) srcsetReplacements.set(item.element, /* @__PURE__ */ new Map());
    srcsetReplacements.get(item.element).set(item.resolvedUrl, downloaded?.localRelPath || item.resolvedUrl);
  }
  for (const item of discovered) {
    if (item.attr === "srcset") continue;
    const downloaded = downloadedMap.get(item.resolvedUrl);
    if (downloaded) {
      $(item.element).attr(item.attr, downloaded.localRelPath);
      if (job.options.addFallbacks && item.type === "image") {
        $(item.element).attr("onerror", `this.onerror=null; this.src='${item.resolvedUrl}';`);
      }
    } else {
      $(item.element).attr(item.attr, item.resolvedUrl);
    }
  }
  for (const [element, replacements] of srcsetReplacements) {
    const original = $(element).attr("srcset") || "";
    const rewritten = original.split(",").map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return trimmed;
      const parts = trimmed.split(/\s+/);
      const resolved = resolveAssetUrl(parts[0], finalUrl);
      if (!resolved) return trimmed;
      const replacement = replacements.get(resolved) || resolved;
      return [replacement, ...parts.slice(1)].join(" ");
    }).join(", ");
    $(element).attr("srcset", rewritten);
  }
  $("a[href]").each((_, el) => {
    const rawHref = $(el).attr("href");
    if (!rawHref) return;
    if (rawHref.startsWith("#") || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:")) {
      return;
    }
    const resolved = resolveAssetUrl(rawHref, finalUrl);
    if (resolved) {
      if (job.options.keepExternalLinks) {
        $(el).attr("href", resolved);
        $(el).attr("target", "_blank");
        $(el).attr("rel", "noopener noreferrer");
      }
    }
  });
  if (job.options.disableActiveScripts) {
    emitJobLog(
      job,
      "info",
      `Static freeze mode active: neutralizing client-side scripts`,
      "FREEZE"
    );
    $("script").each((_, el) => {
      $(el).attr("type", "text/plain");
      $(el).attr("data-spectremirror-inert", "true");
    });
  }
  $("head").prepend(`
<meta name="generator" content="SpectreMirror Web v1.0.0">
`);
  const processedHtml = $.html();
  const finalIndexPath = import_path.default.join(jobDir, "index.html");
  import_fs.default.writeFileSync(finalIndexPath, processedHtml, "utf8");
  for (const item of discovered) {
    const downloaded = downloadedMap.get(item.resolvedUrl);
    const existing = job.assets.find((a) => a.originalUrl === item.resolvedUrl);
    if (!existing) {
      job.assets.push({
        id: import_crypto.default.randomUUID().slice(0, 8),
        type: item.type,
        originalUrl: item.resolvedUrl,
        localPath: downloaded ? downloaded.localRelPath : item.resolvedUrl,
        sizeBytes: downloaded ? downloaded.size : 0,
        mimeType: downloaded ? downloaded.mime : "unknown",
        status: downloaded ? "downloaded" : "skipped"
      });
    }
  }
  const metadata = {
    clonedAt: (/* @__PURE__ */ new Date()).toISOString(),
    sourceUrl: job.url,
    finalUrl,
    pageTitle,
    assetsDownloaded,
    assetsFailed,
    totalAssets: seenUrls.size,
    totalSizeText: formatBytes(totalDownloadedBytes),
    downloadTimeMs: Date.now() - startTime,
    statusCode,
    contentType
  };
  job.metadata = metadata;
  import_fs.default.writeFileSync(
    import_path.default.join(jobDir, ".spectremirror.json"),
    JSON.stringify(metadata, null, 2),
    "utf8"
  );
  import_fs.default.writeFileSync(
    import_path.default.join(jobDir, "options.json"),
    JSON.stringify(job.options, null, 2),
    "utf8"
  );
  updateJobProgress(job, 95, "Packaging ZIP archive bundle");
  emitJobLog(job, "info", `Building offline archive package...`, "BUNDLE");
  try {
    const zip = new import_jszip.default();
    zip.file("index.html", processedHtml);
    zip.file(".spectremirror.json", JSON.stringify(metadata, null, 2));
    zip.file(
      "README.txt",
      `Mirrored Website Archive
=======================

Source URL: ${job.url}
Cloned At: ${metadata.clonedAt}
Downloaded Assets: ${assetsDownloaded}
Total Size: ${metadata.totalSizeText}

HOW TO VIEW:
1. Extract this archive.
2. For static pages, open index.html directly in your browser.
3. For single-page applications with dynamic JavaScript modules, run a local web server:
     npx serve .
   or
     python -m http.server 8080

All downloaded assets are located in the /assets folder.
`
    );
    const addDirectoryToZip = (dirPath, zipFolder) => {
      if (!import_fs.default.existsSync(dirPath)) return;
      const files = import_fs.default.readdirSync(dirPath);
      for (const file of files) {
        const fullPath = import_path.default.join(dirPath, file);
        const stat = import_fs.default.statSync(fullPath);
        if (stat.isDirectory()) {
          const subZip = zipFolder.folder(file);
          if (subZip) {
            addDirectoryToZip(fullPath, subZip);
          }
        } else {
          const content = import_fs.default.readFileSync(fullPath);
          zipFolder.file(file, content);
        }
      }
    };
    const assetsZipFolder = zip.folder("assets");
    if (assetsZipFolder) {
      addDirectoryToZip(assetsDir, assetsZipFolder);
    }
    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    import_fs.default.writeFileSync(import_path.default.join(jobDir, "bundle.zip"), zipBuffer);
    job.hasZip = true;
    emitJobLog(job, "success", `Archive bundle created successfully (${formatBytes(zipBuffer.byteLength)})`, "BUNDLE");
  } catch (err) {
    emitJobLog(job, "warn", `Archive generation warning: ${err.message}`, "BUNDLE_WARN");
  }
  job.status = "completed";
  job.completedAt = (/* @__PURE__ */ new Date()).toISOString();
  updateJobProgress(job, 100, "Cloning completed successfully");
  emitJobLog(job, "success", `Mirroring completed successfully in ${((Date.now() - startTime) / 1e3).toFixed(2)}s`, "COMPLETE");
}
function getJobFile(id, relPath) {
  const jobDir = import_path.default.resolve(DATA_DIR, id);
  const resolved = import_path.default.resolve(jobDir, relPath);
  const relative = import_path.default.relative(jobDir, resolved);
  if (relative.startsWith("..") || import_path.default.isAbsolute(relative) || !import_fs.default.existsSync(resolved)) {
    return null;
  }
  return resolved;
}

// server/spaInterceptor.ts
function generateSpaInterceptorScript(jobId, sourceUrl, finalUrl, isMobile) {
  return `
<script>
(function() {
  'use strict';
  var JOB_ID = ${JSON.stringify(jobId)};
  var SOURCE_URL = ${JSON.stringify(sourceUrl)};
  var FINAL_URL = ${JSON.stringify(finalUrl || sourceUrl)};
  var IS_MOBILE = ${JSON.stringify(isMobile)};
  var targetOrigin = '';

  try {
    targetOrigin = new URL(FINAL_URL).origin;
  } catch (e) {}

  var status = {
    isSpa: false,
    splashDetected: false,
    splashDismissed: false,
    networkRequests: 0,
    errorsCount: 0
  };

  function notifyParent(extra) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(Object.assign({ type: 'SPECTRE_SPA_STATUS' }, status, extra || {}), '*');
      }
    } catch (e) {}
  }

  try {
    Object.defineProperty(window, 'top', { get: function() { return window.self; }, configurable: true });
    Object.defineProperty(window, 'parent', { get: function() { return window.self; }, configurable: true });
  } catch (e) {}

  if (typeof navigator !== 'undefined') {
    try {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.register = function() {
          return Promise.resolve({
            scope: '/',
            unregister: function() { return Promise.resolve(true); },
            active: null,
            installing: null,
            waiting: null
          });
        };
      }
      navigator.sendBeacon = function() { return true; };
    } catch (e) {}
  }

  function rewriteUrl(value) {
    if (!value || typeof value !== 'string') return value;
    if (/^(data|blob|javascript):/i.test(value) || value.charAt(0) === '#') return value;
    if (value.indexOf('/api/clone/' + JOB_ID + '/preview/') === 0) return value;
    if (value.charAt(0) === '/') {
      return '/api/clone/' + JOB_ID + '/proxy?path=' + encodeURIComponent(value);
    }
    if (/^https?:\\/\\//i.test(value)) {
      try {
        var parsed = new URL(value);
        if (parsed.origin === targetOrigin) {
          return '/api/clone/' + JOB_ID + '/proxy?url=' + encodeURIComponent(value);
        }
      } catch (e) {}
    }
    return value;
  }

  if (typeof window.fetch === 'function') {
    var originalFetch = window.fetch;
    window.fetch = function(resource, init) {
      status.networkRequests++;
      var originalUrl = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
      var rewritten = rewriteUrl(originalUrl);
      if (typeof resource === 'string') {
        resource = rewritten;
      } else if (resource && resource.url) {
        try {
          resource = new Request(rewritten, init || resource);
          init = undefined;
        } catch (e) {
          resource = rewritten;
        }
      }
      return originalFetch.call(this, resource, init);
    };
  }

  if (typeof window.XMLHttpRequest === 'function') {
    var originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      status.networkRequests++;
      this.__spectreOriginalUrl = url;
      return originalOpen.call(this, method, rewriteUrl(url), async !== false, user, password);
    };
  }

  var originalCreateElement = document.createElement;
  document.createElement = function(tagName, options) {
    var element = originalCreateElement.call(document, tagName, options);
    var tag = String(tagName).toLowerCase();
    if (tag === 'script' || tag === 'link') {
      var originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        if (typeof value === 'string' && ((tag === 'script' && name.toLowerCase() === 'src') || (tag === 'link' && name.toLowerCase() === 'href'))) {
          value = rewriteUrl(value);
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    return element;
  };

  window.addEventListener('error', function() {
    status.errorsCount++;
    notifyParent();
  }, true);

  window.addEventListener('unhandledrejection', function() {
    status.errorsCount++;
    notifyParent();
  });

  function findSplashScreen() {
    return document.getElementById('splash-screen') || document.querySelector('[id*="splash"], .splash-screen, [class*="splash"]');
  }

  function dismissSplashScreen() {
    var splash = findSplashScreen();
    if (!splash) return false;
    splash.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    splash.style.opacity = '0';
    splash.style.pointerEvents = 'none';
    setTimeout(function() {
      if (splash.parentNode) splash.style.display = 'none';
    }, 260);
    status.splashDismissed = true;
    notifyParent({ splashDismissed: true });
    return true;
  }

  function inspect() {
    var splash = findSplashScreen();
    if (splash) {
      status.splashDetected = true;
      status.isSpa = true;
      notifyParent({ splashDetected: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inspect, { once: true });
  } else {
    inspect();
  }

  setTimeout(function() {
    var splash = findSplashScreen();
    if (splash && document.body && document.body.children.length > 1) dismissSplashScreen();
  }, 1500);

  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'SPECTRE_DISMISS_SPLASH' || event.data.type === 'SPECTRE_FORCE_RENDER') {
      dismissSplashScreen();
    }
  });
})();
</script>`;
}

// server.ts
var PORT = Number(process.env.PORT) || 3e3;
var DATA_DIR2 = process.env.SPECTREMIRROR_DATA_DIR || import_path2.default.join(import_os2.default.tmpdir(), "spectremirror_cloned_data");
async function proxyRemoteAsset(jobId, targetUrl, req, res) {
  try {
    const job = getJob(jobId);
    const userAgent = job?.options?.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const referer = job?.metadata?.finalUrl || job?.url || "";
    const headers = buildStealthHeaders(userAgent, referer);
    if (req.headers["accept"]) headers["Accept"] = String(req.headers["accept"]);
    if (req.headers["content-type"]) headers["Content-Type"] = String(req.headers["content-type"]);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    const fetchOptions = {
      method: req.method,
      headers,
      signal: controller.signal,
      redirect: "follow"
    };
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      fetchOptions.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }
    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);
    res.removeHeader("X-Frame-Options");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "*");
    const contentType = response.headers.get("content-type") || "";
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.status(response.status).send(buffer);
  } catch (err) {
    res.status(502).send("Gateway Proxy Error");
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  app.use(import_express.default.json());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/meta.json", (req, res) => {
    const metaPath = import_path2.default.join(process.cwd(), "meta.json");
    if (import_fs2.default.existsSync(metaPath)) {
      res.sendFile(metaPath);
    } else {
      res.status(404).json({ error: "meta.json not found" });
    }
  });
  app.post("/api/clone", async (req, res) => {
    try {
      const {
        url,
        downloadAssets = true,
        deepCssScan = true,
        keepExternalLinks = true,
        addFallbacks = true,
        disableActiveScripts = false,
        userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        timeoutMs = 3e4
      } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "A valid target URL is required" });
      }
      let normalizedUrl = url.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = "https://" + normalizedUrl;
      }
      const options = {
        url: normalizedUrl,
        downloadAssets: Boolean(downloadAssets),
        deepCssScan: Boolean(deepCssScan),
        keepExternalLinks: Boolean(keepExternalLinks),
        addFallbacks: Boolean(addFallbacks),
        disableActiveScripts: Boolean(disableActiveScripts),
        userAgent: String(userAgent),
        timeoutMs: Number(timeoutMs) || 3e4
      };
      const job = await createCloneJob(options);
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to start cloning job" });
    }
  });
  app.get("/api/clones", (req, res) => {
    res.json(getAllJobs());
  });
  app.get("/api/clone/:id", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Clone job not found" });
    }
    res.json(job);
  });
  app.get("/api/clone/:id/events", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Clone job not found" });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    for (const log of job.logs) {
      res.write(`data: ${JSON.stringify({ type: "log", data: log })}

`);
    }
    const unsubscribe = subscribeToJob(job.id, (data) => {
      if ("level" in data) {
        res.write(`data: ${JSON.stringify({ type: "log", data })}

`);
      } else {
        res.write(`data: ${JSON.stringify(data)}

`);
      }
    });
    req.on("close", () => {
      unsubscribe();
    });
  });
  app.get("/api/clone/:id/zip", (req, res) => {
    const filePath = getJobFile(req.params.id, "bundle.zip");
    if (!filePath) {
      return res.status(404).json({ error: "ZIP bundle not available or still building" });
    }
    const job = getJob(req.params.id);
    let hostname = "site";
    try {
      if (job) hostname = new URL(job.url).hostname.replace(/[^a-z0-9]/gi, "_");
    } catch {
    }
    res.setHeader("Content-Disposition", `attachment; filename="clone_${hostname}_${req.params.id}.zip"`);
    res.setHeader("Content-Type", "application/zip");
    res.sendFile(filePath);
  });
  app.get("/api/clone/:id/source", (req, res) => {
    const origPath = getJobFile(req.params.id, "original.html");
    const rewritPath = getJobFile(req.params.id, "index.html");
    const metaPath = getJobFile(req.params.id, ".spectremirror.json");
    if (!rewritPath) {
      return res.status(404).json({ error: "Source files not found" });
    }
    const originalHtml = origPath && import_fs2.default.existsSync(origPath) ? import_fs2.default.readFileSync(origPath, "utf8") : "";
    const rewrittenHtml = import_fs2.default.existsSync(rewritPath) ? import_fs2.default.readFileSync(rewritPath, "utf8") : "";
    const metadata = metaPath && import_fs2.default.existsSync(metaPath) ? import_fs2.default.readFileSync(metaPath, "utf8") : "";
    res.json({
      originalHtml,
      rewrittenHtml,
      metadata: metadata ? JSON.parse(metadata) : null
    });
  });
  app.get("/api/clone/:id/preview", (req, res) => {
    res.redirect(`/api/clone/${req.params.id}/preview/index.html`);
  });
  app.get("/api/clone/:id/preview/index.html", (req, res) => {
    const filePath = getJobFile(req.params.id, "index.html");
    if (!filePath) {
      return res.status(404).send("<!DOCTYPE html><html><body><h3>Mirrored site not ready yet.</h3></body></html>");
    }
    let html = import_fs2.default.readFileSync(filePath, "utf8");
    html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
    html = html.replace(/<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, "");
    const job = getJob(req.params.id);
    const sourceUrl = job?.url || "";
    const finalUrl = job?.metadata?.finalUrl || sourceUrl;
    const isMobile = /mobile|android|iphone|ipad/i.test(job?.options?.userAgent || "");
    const baseTag = `<base href="/api/clone/${req.params.id}/preview/">`;
    const spaScript = generateSpaInterceptorScript(req.params.id, sourceUrl, finalUrl, isMobile);
    const injection = `${baseTag}
${spaScript}`;
    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>
  ${injection}`);
    } else if (html.includes("<HEAD>")) {
      html = html.replace("<HEAD>", `<HEAD>
  ${injection}`);
    } else {
      html = `${injection}
${html}`;
    }
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self' *");
    res.send(html);
  });
  app.all("/api/clone/:id/proxy", async (req, res) => {
    const jobId = req.params.id;
    const job = getJob(jobId);
    let targetUrl = req.query.url || "";
    const relPath = req.query.path || "";
    if (!targetUrl && relPath) {
      const baseUrl = job?.metadata?.finalUrl || job?.url || "";
      if (!baseUrl) return res.status(404).send("Clone job not found");
      try {
        targetUrl = new URL(relPath, baseUrl).href;
      } catch {
        targetUrl = baseUrl.replace(/\/$/, "") + "/" + relPath.replace(/^\//, "");
      }
    }
    if (!job) {
      return res.status(404).send("Clone job not found");
    }
    if (!targetUrl) {
      return res.status(400).send("Target URL or path required");
    }
    try {
      const target = new URL(targetUrl);
      const base = new URL(job.metadata?.finalUrl || job.url);
      if (!["http:", "https:"].includes(target.protocol)) {
        return res.status(400).send("Unsupported target protocol");
      }
      const allowedHosts = /* @__PURE__ */ new Set([base.hostname]);
      for (const asset of job.assets) {
        try {
          allowedHosts.add(new URL(asset.originalUrl).hostname);
        } catch {
        }
      }
      if (!allowedHosts.has(target.hostname) && !target.hostname.endsWith(`.${base.hostname}`)) {
        return res.status(403).send("Target outside clone resources");
      }
      targetUrl = target.href;
    } catch {
      return res.status(400).send("Invalid target URL");
    }
    await proxyRemoteAsset(jobId, targetUrl, req, res);
  });
  app.get("/api/clone/:id/preview/*", async (req, res) => {
    const relPath = req.params[0];
    const filePath = getJobFile(req.params.id, relPath);
    if (!filePath) {
      const job = getJob(req.params.id);
      if (job?.url) {
        try {
          const targetUrl = new URL(relPath, job.metadata?.finalUrl || job.url).href;
          return await proxyRemoteAsset(req.params.id, targetUrl, req, res);
        } catch {
        }
      }
      return res.status(404).send("Asset not found");
    }
    res.removeHeader("X-Frame-Options");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".css")) {
      res.setHeader("Content-Type", "text/css; charset=utf-8");
    } else if (lower.endsWith(".ts") || lower.endsWith(".mjs")) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    } else if (lower.endsWith(".svg")) {
      res.setHeader("Content-Type", "image/svg+xml");
    } else if (lower.endsWith(".woff2")) {
      res.setHeader("Content-Type", "font/woff2");
    } else if (lower.endsWith(".woff")) {
      res.setHeader("Content-Type", "font/woff");
    } else if (lower.endsWith(".png")) {
      res.setHeader("Content-Type", "image/png");
    } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
      res.setHeader("Content-Type", "image/jpeg");
    } else if (lower.endsWith(".webp")) {
      res.setHeader("Content-Type", "image/webp");
    }
    res.sendFile(filePath);
  });
  app.delete("/api/clone/:id", (req, res) => {
    const success = deleteJob(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json({ success: true });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            "**/cloned-data/**",
            "**/cloned-data*/**",
            "**/*cloned_data*/**",
            "**/*.zip",
            "**/tmp/**"
          ]
        }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
