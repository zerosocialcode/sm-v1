# SpectreMirror

A tool to mirror any webpage and package it into an offline-ready bundle.

Most browser "Save As" options end up breaking relative paths, missing fonts, ignoring CSS `url()` references, or crashing modern single-page apps when opened locally. SpectreMirror fetches the page, pulls down its assets (CSS, images, fonts, scripts), rewrites all references to local files, and packages everything into a downloadable ZIP.

---

## What it does

- **Recursive asset harvesting**: Scrapes HTML for images, stylesheets, scripts, icons, and `srcset` attributes.
- **Deep CSS scanning**: Parses downloaded stylesheets for `@import` statements and `url(...)` declarations (web fonts, background images, SVGs) and pulls those down too.
- **Path rewriting**: Rewrites asset URLs to relative paths (`assets/css/`, `assets/images/`, `assets/fonts/`, etc.) so the page can run without internet access.
- **Sandbox preview**: Lets you view the mirrored page directly in the app across desktop, laptop, tablet, and mobile viewports. It strips CSP and `X-Frame-Options` headers so iframe previews actually render.
- **Resilience handlers**: Injects fallback handlers (`onerror`) on images so if a resource is missing or blocked, the page doesn't fall apart.
- **Static Freeze mode**: Optional setting that turns script tags inert (`type="text/plain"`). Useful for heavy SPAs that break or loop when cut off from their original backend APIs.
- **Live event streaming**: Real-time terminal output via Server-Sent Events (SSE) tracking every fetch, parse, and download step.
- **ZIP export**: Generates an archive containing `index.html`, all downloaded assets, a `.spectremirror.json` manifest, and a quick-start `README.txt`.

---

## Getting started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone <repo-url>
cd spectremirror
npm install
```

### Running standalone

**Option A — Using Node.js:**
```bash
npm install
npm run dev
# or for production build
npm run build
npm start
```
Open [http://localhost:3000](http://localhost:3000).

**Option B — Using Python:**
```bash
pip install -r requirements.txt
python app.py
```
Open [http://localhost:3000](http://localhost:3000).

### Running inside Workshop

1. Drop the `spectremirror` folder into your Workshop `apps/` directory:
   ```
   Workshop/apps/spectremirror/
   ```
2. Build the app assets once:
   ```bash
   cd apps/spectremirror
   npm install && npm run build -- --base=./
   ```
   *(Or run `python scripts/build_tools.py` from the Workshop root).*
3. Restart or start Workshop (`python run.py`).
4. Workshop auto-discovers `spectremirror` as a native Flask sub-app via `app.py`, mounts it at `/apps/spectremirror/`, and serves all cloning, streaming, preview, and ZIP export capabilities directly in-process!

---

## How to use it

1. Paste any public URL (e.g. `https://news.ycombinator.com`) into the directive input.
2. Hit **ENGAGE MIRROR** (or press Enter).
3. Watch the terminal logs as the engine establishes the connection, extracts assets, downloads media, rewrites links, and builds the ZIP.
4. Once completed, explore the output:
   - **Sandbox Preview**: See how the page renders in desktop, tablet, or mobile sizes.
   - **Assets**: Search, filter, and inspect every downloaded file by type and size.
   - **Source Inspect**: Side-by-side view of the original raw HTML versus the rewritten HTML.
   - **Technical Spec**: View crawl stats, duration, status codes, and the manifest.
   - **Export Offline ZIP Bundle**: Download the complete archive to your computer.

---

## Viewing the downloaded ZIPs

After unzipping an exported bundle:

1. **Static pages**: You can open `index.html` directly in your browser.
2. **Dynamic pages / JavaScript modules**: Modern browsers block modules loaded over `file:///` URLs due to CORS. If the site relies on ES modules or web fonts, run a quick local server inside the unzipped folder:

```bash
# Using Node
npx serve .

# Or using Python
python3 -m http.server 8080
```

---

## Project structure

```
├── server/
│   ├── clonerEngine.ts     # Core pipeline: HTTP client, Cheerio DOM parser, CSS scanner, zip builder
│   └── spaInterceptor.ts   # Client script injected into sandbox preview for path handling
├── server.ts               # Express server, Vite middleware, SSE event endpoints, asset proxy
├── src/
│   ├── components/
│   │   ├── AssetTable.tsx      # Filterable list of all harvested assets
│   │   ├── ConfigPanel.tsx     # URL input, presets, and advanced engine flags
│   │   ├── Header.tsx          # App header with Day/Night blueprint theme toggle
│   │   ├── LiveTerminal.tsx    # Dracula-themed terminal showing real-time logs
│   │   ├── MetadataView.tsx    # Technical stats, manifest viewer, and ZIP download
│   │   ├── PreviewFrame.tsx    # Sandbox preview with device viewport switcher
│   │   └── SourceViewer.tsx    # Raw vs rewritten HTML diff inspector
│   ├── App.tsx             # Root UI layout and state management
│   ├── types.ts            # TypeScript interfaces for jobs, assets, and logs
│   └── utils.ts            # Byte formatting and helper utilities
├── index.html              # Frontend entry point
└── package.json            # Scripts and dependencies
```

---

## Configuration options

Under **Expand Engine Parameters & Headers**:

| Option | Default | Description |
|---|---|---|
| **Download Assets** | On | Saves images, CSS, fonts, and scripts locally. If off, leaves asset URLs pointing to the original remote server. |
| **Deep CSS Scan** | On | Scans downloaded stylesheets for nested `url(...)` fonts and background images. |
| **Absolute Anchors** | On | Keeps outbound links pointing to their original domain so clicking them opens the live site in a new tab. |
| **Resilience Handlers** | On | Adds inline fallback handlers to prevent broken image icons if an asset fails to load. |
| **Static Freeze Mode** | Off | Neutralizes `<script>` tags to prevent client-side routing loops or runtime errors on disconnected SPAs. |
| **Client Signature** | Chrome 124 | Custom user-agent string to emulate different browsers (desktop Chrome, Safari, mobile iOS/Android, etc.). |
| **Timeout Threshold** | 30s | Max wait time before timing out slow or unresponsive targets. |
