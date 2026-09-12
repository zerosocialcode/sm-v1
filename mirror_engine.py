import os
import sys
import time
import json
import uuid
import re
import tempfile
import threading
import zipfile
import mimetypes
from urllib.parse import urljoin, urlparse, unquote

try:
    import requests
except ImportError:
    requests = None

try:
    import urllib.request as urllib_req
    import urllib.error as urllib_err
except ImportError:
    urllib_req = None
    urllib_err = None

DATA_DIR = os.environ.get("SPECTREMIRROR_DATA_DIR") or os.path.join(tempfile.gettempdir(), "spectremirror_cloned_data")
os.makedirs(DATA_DIR, exist_ok=True)

jobs_store = {}
jobs_lock = threading.Lock()
listeners = {}
listeners_lock = threading.Lock()

def format_bytes(size: int) -> str:
    if size == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB"]
    i = 0
    s = float(size)
    while s >= 1024.0 and i < len(units) - 1:
        s /= 1024.0
        i += 1
    return f"{s:.2f} {units[i]}"

def sanitize_filename(filename: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\0]', '_', filename)
    cleaned = re.sub(r'\s+', '_', cleaned).strip()
    return cleaned or "asset"

def get_safe_filename(url_str: str, suggested_ext: str = "") -> str:
    try:
        parsed = urlparse(url_str)
        base = os.path.basename(parsed.path).split("?")[0].split("#")[0]
        base = sanitize_filename(unquote(base))
        ext = os.path.splitext(base)[1]
        name_no_ext = base[:-len(ext)] if ext else base
        if not name_no_ext or name_no_ext == "/" or len(name_no_ext) > 40:
            name_no_ext = f"asset_{uuid.uuid4().hex[:8]}"
        final_ext = ext or suggested_ext or ".bin"
        return f"{name_no_ext}_{uuid.uuid4().hex[:6]}{final_ext}"
    except Exception:
        return f"asset_{uuid.uuid4().hex[:8]}{suggested_ext or '.bin'}"

def fetch_url(url: str, user_agent: str = "", timeout: int = 30):
    ua = user_agent or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Upgrade-Insecure-Requests": "1",
    }
    if requests is not None:
        resp = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
        return resp.content, resp.headers, resp.url, resp.status_code
    elif urllib_req is not None:
        req = urllib_req.Request(url, headers=headers)
        with urllib_req.urlopen(req, timeout=timeout) as response:
            content = response.read()
            return content, response.headers, response.geturl(), response.status
    raise RuntimeError("Neither requests nor urllib is available.")

def emit_log(job_id: str, level: str, message: str, tag: str = None):
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "level": level,
        "message": message,
        "tag": tag,
    }
    with jobs_lock:
        if job_id in jobs_store:
            jobs_store[job_id]["logs"].append(entry)

    with listeners_lock:
        subscribers = listeners.get(job_id, [])
        for sub in list(subscribers):
            try:
                sub(entry)
            except Exception:
                pass

def update_progress(job_id: str, progress: int, step: str):
    with jobs_lock:
        if job_id in jobs_store:
            jobs_store[job_id]["progress"] = progress
            jobs_store[job_id]["currentStep"] = step

    with listeners_lock:
        subscribers = listeners.get(job_id, [])
        for sub in list(subscribers):
            try:
                sub({"type": "progress", "progress": progress, "step": step})
            except Exception:
                pass

def run_clone_pipeline(job_id: str):
    with jobs_lock:
        job = jobs_store.get(job_id)
    if not job:
        return

    url = job["url"]
    options = job.get("options", {})
    job_dir = os.path.join(DATA_DIR, job_id)
    assets_dir = os.path.join(job_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)

    start_time = time.time()
    emit_log(job_id, "info", f"Initializing cloning pipeline for: {url}", "INIT")
    update_progress(job_id, 15, "Establishing HTTP connection")

    try:
        emit_log(job_id, "info", "Sending HTTP request with stealth browser headers...", "NETWORK")
        raw_bytes, resp_headers, final_url, status_code = fetch_url(
            url,
            user_agent=options.get("userAgent", ""),
            timeout=options.get("timeoutMs", 30000) // 1000 or 30
        )
        content_type = str(resp_headers.get("Content-Type", "text/html")).split(";")[0].strip()
        doc_size_text = format_bytes(len(raw_bytes))
        emit_log(job_id, "success", f"Fetched HTML document ({doc_size_text}) [HTTP {status_code}]", "FETCH")
        update_progress(job_id, 35, "Parsing document DOM")

        try:
            html_text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            html_text = raw_bytes.decode("latin1", errors="replace")

        with open(os.path.join(job_dir, "original.html"), "w", encoding="utf-8") as f:
            f.write(html_text)

        title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.IGNORECASE | re.DOTALL)
        page_title = title_match.group(1).strip() if title_match else urlparse(final_url).netloc

        asset_urls = []
        for m in re.finditer(r'<link[^>]+rel=["\']?(?:stylesheet|icon|shortcut icon|apple-touch-icon)["\']?[^>]+href=["\']([^"\']+)["\']', html_text, re.IGNORECASE):
            asset_urls.append((m.group(1), 'stylesheet' if 'stylesheet' in m.group(0).lower() else 'icon'))
        for m in re.finditer(r'<script[^>]+src=["\']([^"\']+)["\']', html_text, re.IGNORECASE):
            asset_urls.append((m.group(1), 'script'))
        for m in re.finditer(r'<img[^>]+src=["\']([^"\']+)["\']', html_text, re.IGNORECASE):
            asset_urls.append((m.group(1), 'image'))
        for m in re.finditer(r'<source[^>]+src=["\']([^"\']+)["\']', html_text, re.IGNORECASE):
            asset_urls.append((m.group(1), 'other'))

        seen_urls = set()
        unique_assets = []
        for raw_u, a_type in asset_urls:
            resolved = urljoin(final_url, raw_u.strip())
            if resolved.startswith("http://") or resolved.startswith("https://"):
                if resolved not in seen_urls:
                    seen_urls.add(resolved)
                    unique_assets.append((raw_u, resolved, a_type))

        emit_log(job_id, "info", f"Discovered {len(unique_assets)} resource references in page", "DOM")
        update_progress(job_id, 50, "Downloading assets")

        cloned_assets = []
        rewritten_map = {}
        downloaded_map = {}
        css_queue = []
        downloaded_count = 0
        failed_count = 0

        if options.get("downloadAssets", True):
            for idx, (original_ref, full_url, asset_type) in enumerate(unique_assets):
                try:
                    ext = os.path.splitext(urlparse(full_url).path)[1]
                    local_filename = get_safe_filename(full_url, ext)
                    local_filepath = os.path.join(assets_dir, local_filename)

                    c_bytes, c_headers, _, _ = fetch_url(full_url, user_agent=options.get("userAgent", ""), timeout=15)
                    with open(local_filepath, "wb") as af:
                        af.write(c_bytes)

                    local_rel_path = f"assets/{local_filename}"
                    rewritten_map[original_ref] = local_rel_path
                    downloaded_map[full_url] = local_rel_path
                    downloaded_count += 1

                    mime_type = str(c_headers.get("Content-Type", "")).split(";")[0].strip()
                    cloned_assets.append({
                        "id": str(uuid.uuid4()),
                        "type": asset_type,
                        "originalUrl": full_url,
                        "localPath": local_rel_path,
                        "sizeBytes": len(c_bytes),
                        "mimeType": mime_type,
                        "status": "downloaded"
                    })
                    emit_log(job_id, "info", f"Downloaded {asset_type}: {os.path.basename(local_filename)} ({format_bytes(len(c_bytes))})", "ASSET")

                    is_css = asset_type == "stylesheet" or "text/css" in mime_type.lower() or local_filename.lower().endswith(".css")
                    if is_css:
                        css_queue.append((full_url, local_rel_path))
                except Exception as ex:
                    failed_count += 1
                    cloned_assets.append({
                        "id": str(uuid.uuid4()),
                        "type": asset_type,
                        "originalUrl": full_url,
                        "localPath": "",
                        "sizeBytes": 0,
                        "mimeType": "unknown",
                        "status": "failed",
                        "errorMessage": str(ex)
                    })

                progress_val = 50 + int((idx + 1) / max(len(unique_assets), 1) * 30)
                update_progress(job_id, progress_val, f"Harvesting assets ({idx + 1}/{len(unique_assets)})")

        if options.get("downloadAssets", True) and options.get("deepCssScan", True):
            update_progress(job_id, 82, "Scanning stylesheets for nested assets")
            processed_css = set()
            css_index = 0
            while css_index < len(css_queue):
                css_url, css_local_rel = css_queue[css_index]
                css_index += 1
                if css_url in processed_css:
                    continue
                processed_css.add(css_url)

                css_path = os.path.join(job_dir, css_local_rel)
                if not os.path.exists(css_path):
                    continue
                try:
                    with open(css_path, "r", encoding="utf-8", errors="replace") as cf:
                        css_text = cf.read()
                except Exception:
                    continue

                refs = []
                for m in re.finditer(r'url\(\s*["\']?([^"\')\s]+)["\']?\s*\)', css_text, re.IGNORECASE):
                    refs.append(m.group(1))
                for m in re.finditer(r'@import\s+(?:url\(\s*)?["\']([^"\']+)["\']\s*\)?', css_text, re.IGNORECASE):
                    refs.append(m.group(1))

                seen_refs = set()
                unique_refs = [r for r in refs if not (r in seen_refs or seen_refs.add(r))]

                changed = False
                for ref in unique_refs:
                    if not ref or ref.startswith("data:") or ref.startswith("#"):
                        continue
                    resolved = urljoin(css_url, ref.strip())
                    if not (resolved.startswith("http://") or resolved.startswith("https://")):
                        continue

                    local_rel = downloaded_map.get(resolved)
                    if local_rel is None:
                        try:
                            ext = os.path.splitext(urlparse(resolved).path)[1]
                            local_filename = get_safe_filename(resolved, ext)
                            local_filepath = os.path.join(assets_dir, local_filename)
                            n_bytes, n_headers, _, _ = fetch_url(resolved, user_agent=options.get("userAgent", ""), timeout=15)
                            with open(local_filepath, "wb") as af:
                                af.write(n_bytes)
                            local_rel = f"assets/{local_filename}"
                            downloaded_map[resolved] = local_rel
                            downloaded_count += 1

                            n_mime = str(n_headers.get("Content-Type", "")).split(";")[0].strip()
                            is_font = "font" in n_mime.lower() or re.search(r"\.(woff2?|ttf|otf|eot)($|\?)", resolved, re.IGNORECASE)
                            is_css_ref = "text/css" in n_mime.lower() or local_filename.lower().endswith(".css")
                            n_type = "font" if is_font else ("stylesheet" if is_css_ref else "image")
                            cloned_assets.append({
                                "id": str(uuid.uuid4()),
                                "type": n_type,
                                "originalUrl": resolved,
                                "localPath": local_rel,
                                "sizeBytes": len(n_bytes),
                                "mimeType": n_mime,
                                "status": "downloaded"
                            })
                            emit_log(job_id, "info", f"Downloaded (from CSS) {n_type}: {os.path.basename(local_filename)} ({format_bytes(len(n_bytes))})", "ASSET")

                            if is_css_ref:
                                css_queue.append((resolved, local_rel))
                        except Exception as ex:
                            failed_count += 1
                            emit_log(job_id, "warn", f"Asset referenced from CSS omitted ({resolved}): {ex}", "FETCH_SKIP")
                            continue

                    local_name = os.path.basename(local_rel)
                    escaped_ref = re.escape(ref)
                    new_css_text = re.sub(rf'(url\(\s*["\']?){escaped_ref}(["\']?\s*\))', rf'\g<1>{local_name}\g<2>', css_text)
                    new_css_text = re.sub(rf'(@import\s+(?:url\(\s*)?["\']){escaped_ref}(["\']\s*\)?)', rf'\g<1>{local_name}\g<2>', new_css_text)
                    if new_css_text != css_text:
                        css_text = new_css_text
                        changed = True

                if changed:
                    try:
                        with open(css_path, "w", encoding="utf-8") as cf:
                            cf.write(css_text)
                    except Exception:
                        pass

            emit_log(job_id, "success", "Deep CSS scan complete — nested stylesheet assets resolved", "CSS")

        update_progress(job_id, 85, "Rewriting paths & injecting resilience")
        emit_log(job_id, "info", "Rewriting DOM paths and injecting resilience scripts...", "REWRITE")

        rewritten_html = html_text
        for orig_ref, local_rel in rewritten_map.items():
            rewritten_html = rewritten_html.replace(f'"{orig_ref}"', f'"{local_rel}"')
            rewritten_html = rewritten_html.replace(f"'{orig_ref}'", f"'{local_rel}'")

        if options.get("disableActiveScripts", False):
            rewritten_html = re.sub(r'<script\b([^>]*)>', r'<script\1 type="text/disabled-script">', rewritten_html, flags=re.IGNORECASE)

        offline_badge = """
<!-- SpectreMirror Offline Preservation Stamp -->
<div id="spectremirror-badge" style="position:fixed;bottom:12px;right:12px;background:#18181b;color:#f4f4f5;font-family:monospace;font-size:11px;padding:6px 10px;border-radius:4px;border:1px solid #3f3f46;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;gap:6px;pointer-events:auto;user-select:none;">
  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;"></span>
  <span>MIRRORED SPECIMEN [OFFLINE]</span>
</div>
"""
        if "</body>" in rewritten_html:
            rewritten_html = rewritten_html.replace("</body>", f"{offline_badge}</body>")
        else:
            rewritten_html += offline_badge

        with open(os.path.join(job_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(rewritten_html)

        update_progress(job_id, 92, "Packaging offline ZIP bundle")
        emit_log(job_id, "info", "Building offline bundle ZIP package...", "BUNDLE")

        zip_path = os.path.join(job_dir, "bundle.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(os.path.join(job_dir, "index.html"), "index.html")
            zf.write(os.path.join(job_dir, "original.html"), "original.html")
            for root, _, files in os.walk(assets_dir):
                for file in files:
                    full_p = os.path.join(root, file)
                    rel_p = os.path.relpath(full_p, job_dir)
                    zf.write(full_p, rel_p)

        zip_size_text = format_bytes(os.path.getsize(zip_path))
        emit_log(job_id, "success", f"Archive bundle created successfully ({zip_size_text})", "BUNDLE")

        duration_sec = round(time.time() - start_time, 2)
        emit_log(job_id, "success", f"Mirroring completed successfully in {duration_sec}s", "COMPLETE")

        metadata = {
            "clonedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "sourceUrl": url,
            "finalUrl": final_url,
            "pageTitle": page_title,
            "assetsDownloaded": downloaded_count,
            "assetsFailed": failed_count,
            "totalAssets": len(unique_assets),
            "totalSizeText": doc_size_text,
            "downloadTimeMs": int(duration_sec * 1000),
            "statusCode": status_code,
            "contentType": content_type,
        }

        with jobs_lock:
            if job_id in jobs_store:
                jobs_store[job_id]["status"] = "completed"
                jobs_store[job_id]["progress"] = 100
                jobs_store[job_id]["currentStep"] = "Cloning completed successfully"
                jobs_store[job_id]["completedAt"] = metadata["clonedAt"]
                jobs_store[job_id]["assets"] = cloned_assets
                jobs_store[job_id]["metadata"] = metadata
                jobs_store[job_id]["hasZip"] = True

        update_progress(job_id, 100, "Completed")

    except Exception as err:
        emit_log(job_id, "error", f"Pipeline failure: {str(err)}", "ERROR")
        with jobs_lock:
            if job_id in jobs_store:
                jobs_store[job_id]["status"] = "failed"
                jobs_store[job_id]["error"] = str(err)
                jobs_store[job_id]["currentStep"] = f"Failed: {str(err)}"

def create_job(url: str, options: dict) -> dict:
    job_id = uuid.uuid4().hex[:8]
    job_record = {
        "id": job_id,
        "url": url,
        "options": {
            "url": url,
            "downloadAssets": options.get("downloadAssets", True),
            "deepCssScan": options.get("deepCssScan", True),
            "keepExternalLinks": options.get("keepExternalLinks", True),
            "addFallbacks": options.get("addFallbacks", True),
            "disableActiveScripts": options.get("disableActiveScripts", False),
            "userAgent": options.get("userAgent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
            "timeoutMs": options.get("timeoutMs", 30000),
        },
        "status": "running",
        "progress": 5,
        "currentStep": "Initializing capture environment",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "assets": [],
        "logs": [],
        "hasZip": False,
    }

    with jobs_lock:
        jobs_store[job_id] = job_record

    t = threading.Thread(target=run_clone_pipeline, args=(job_id,), daemon=True)
    t.start()

    return job_record

def get_job(job_id: str):
    with jobs_lock:
        return jobs_store.get(job_id)

def get_all_jobs():
    with jobs_lock:
        return list(jobs_store.values())

def delete_job(job_id: str) -> bool:
    with jobs_lock:
        if job_id in jobs_store:
            del jobs_store[job_id]
    job_dir = os.path.join(DATA_DIR, job_id)
    if os.path.exists(job_dir):
        try:
            import shutil
            shutil.rmtree(job_dir)
        except Exception:
            pass
    return True

def subscribe_to_job(job_id: str, callback):
    with listeners_lock:
        if job_id not in listeners:
            listeners[job_id] = set()
        listeners[job_id].add(callback)

    def unsubscribe():
        with listeners_lock:
            if job_id in listeners:
                listeners[job_id].discard(callback)

    return unsubscribe
