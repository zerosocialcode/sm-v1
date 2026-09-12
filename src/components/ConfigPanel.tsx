import React, { useState, useEffect, useRef } from 'react';
import { CloneOptions } from '../types';

interface ConfigPanelProps {
  onStartClone: (options: CloneOptions) => void;
  isLoading: boolean;
  initialUrl?: string;
  autoFocus?: boolean;
}

const PRESETS = [
  { label: 'EXAMPLE.COM (LIGHT)', url: 'https://example.com' },
  { label: 'HACKER NEWS (CLASSIC)', url: 'https://news.ycombinator.com' },
  { label: 'WIKIPEDIA // STEALTH', url: 'https://en.wikipedia.org/wiki/Stealth_aircraft' },
  { label: 'HTTPBIN SPEC', url: 'https://httpbin.org/html' },
];

const USER_AGENTS = [
  {
    name: 'Chrome 124 (Windows 11 Stealth)',
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  {
    name: 'Chrome 131 (Windows 11, Latest Stable)',
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    name: 'Edge 131 (Windows 11 Chromium)',
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  },
  {
    name: 'Firefox 132 (Windows 11)',
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  },
  {
    name: 'Opera 116 (Windows 11)',
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0',
  },
  {
    name: 'Chrome 131 (macOS Sonoma)',
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    name: 'Safari 17 (macOS Sonoma Desktop)',
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  },
  {
    name: 'Firefox 125 (Linux Ubuntu)',
    value: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  },
  {
    name: 'Chrome 131 (Linux Desktop)',
    value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    name: 'Googlebot Desktop (Crawler Bypass)',
    value: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Safari/537.36',
  },
  {
    name: 'iPhone 15 Pro (iOS 17 Safari Mobile)',
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'Pixel 8 (Android 14 Chrome Mobile)',
    value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
  },
  {
    name: 'Samsung Galaxy S24 (Samsung Internet)',
    value: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/120.0.6099.230 Mobile Safari/537.36',
  },
];

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  onStartClone,
  isLoading,
  initialUrl = '',
  autoFocus = false,
}) => {
  const [url, setUrl] = useState(initialUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [downloadAssets, setDownloadAssets] = useState(true);
  const [keepExternalLinks, setKeepExternalLinks] = useState(true);
  const [addFallbacks, setAddFallbacks] = useState(true);
  const [disableActiveScripts, setDisableActiveScripts] = useState(false);
  const [userAgent, setUserAgent] = useState(USER_AGENTS[0].value);
  const [customUserAgent, setCustomUserAgent] = useState('');
  const [isCustomUa, setIsCustomUa] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(30000);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isLoading) return;

    onStartClone({
      url: url.trim(),
      downloadAssets,
      deepCssScan: true,
      keepExternalLinks,
      addFallbacks,
      disableActiveScripts,
      userAgent: isCustomUa && customUserAgent ? customUserAgent : userAgent,
      timeoutMs,
    });
  };

  return (
    <div className="spec-card p-5 sm:p-6 transition-all">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="target-url-input"
            className="spec-eyebrow block mb-1.5 text-[11px] text-[var(--ink-soft)]"
          >
            TARGET WEBPAGE URL:
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch">
            <div className="relative w-full">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none spec-mono text-[var(--accent)] font-bold text-xs">
                &gt;
              </span>
              <input
                ref={inputRef}
                id="target-url-input"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={isLoading}
                className="spec-input w-full h-11 pl-8 pr-3 text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] box-border"
              />
            </div>

            <button
              id="start-clone-button"
              type="submit"
              disabled={isLoading || !url.trim()}
              className="btn-primary w-full h-11 py-0 box-border text-xs"
            >
              {isLoading ? (
                <span>[ HARVESTING ASSETS... ]</span>
              ) : (
                <span>ENGAGE MIRROR</span>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="spec-eyebrow text-[10px] text-[var(--ink-faint)] mr-1">
            TEST SPECIMENS:
          </span>
          {PRESETS.map((preset) => (
            <button
              key={preset.url}
              type="button"
              onClick={() => setUrl(preset.url)}
              disabled={isLoading}
              className="spec-mono text-[10px] font-medium px-2 py-1 bg-[var(--bg-deep)] hover:bg-[var(--line-soft)] border border-[var(--line)] text-[var(--ink-soft)] hover:text-[var(--ink)] rounded-[3px] transition-colors cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="pt-2 border-t border-[var(--line-soft)]">
          <button
            id="toggle-advanced-btn"
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="spec-mono text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>[{showAdvanced ? '−' : '+'}]</span>
            <span>{showAdvanced ? 'COLLAPSE ENGINE PARAMETERS' : 'EXPAND ENGINE PARAMETERS & HEADERS'}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 bg-[var(--bg-deep)] border border-[var(--line)] rounded-[3px] space-y-4 spec-mono text-xs text-[var(--ink)]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={downloadAssets}
                    onChange={(e) => setDownloadAssets(e.target.checked)}
                    disabled={isLoading}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <div>
                    <span className="font-semibold block text-[11px]">Download Assets</span>
                    <span className="text-[10px] text-[var(--ink-faint)] leading-tight block">
                      Save images, CSS, and fonts to relative paths.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={keepExternalLinks}
                    onChange={(e) => setKeepExternalLinks(e.target.checked)}
                    disabled={isLoading}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <div>
                    <span className="font-semibold block text-[11px]">Absolute Anchors</span>
                    <span className="text-[10px] text-[var(--ink-faint)] leading-tight block">
                      Preserve external origin on outbound links.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addFallbacks}
                    onChange={(e) => setAddFallbacks(e.target.checked)}
                    disabled={isLoading}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <div>
                    <span className="font-semibold block text-[11px]">Resilience Handlers</span>
                    <span className="text-[10px] text-[var(--ink-faint)] leading-tight block">
                      Inject onerror fallback guards on media tags.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={disableActiveScripts}
                    onChange={(e) => setDisableActiveScripts(e.target.checked)}
                    disabled={isLoading}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <div>
                    <span className="font-semibold block text-[11px] text-[var(--accent)]">
                      Static Freeze Mode
                    </span>
                    <span className="text-[10px] text-[var(--ink-faint)] leading-tight block">
                      Inert scripts to prevent SPA infinite loops.
                    </span>
                  </div>
                </label>
              </div>

              <div className="p-3 bg-[var(--paper)] border border-[var(--warn)] rounded-[3px] text-[11px] leading-relaxed text-[var(--ink)]">
                <span className="font-bold text-[var(--warn)] mr-1.5">[NOTE // SPAs]:</span>
                <span>
                  Modern client-rendered applications load data dynamically via backend APIs. When saved locally, opening via <code className="bg-[var(--bg-deep)] px-1 py-0.5 border border-[var(--line)]">file:///</code> causes browsers to block scripts with CORS errors. Run with a local HTTP server (<code className="bg-[var(--bg-deep)] px-1 py-0.5 border border-[var(--line)]">npx serve .</code>) or enable <strong>Static Freeze Mode</strong>.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--line)]">
                <div>
                  <label className="spec-eyebrow block mb-1 text-[10px]">
                    CLIENT SIGNATURE:
                  </label>
                  <select
                    value={isCustomUa ? 'custom' : userAgent}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomUa(true);
                      } else {
                        setIsCustomUa(false);
                        setUserAgent(e.target.value);
                      }
                    }}
                    disabled={isLoading}
                    className="spec-input w-full px-2.5 py-1.5 text-xs text-[var(--ink)]"
                  >
                    {USER_AGENTS.map((ua) => (
                      <option key={ua.name} value={ua.value}>
                        {ua.name}
                      </option>
                    ))}
                    <option value="custom">CUSTOM USER-AGENT STRING...</option>
                  </select>

                  {isCustomUa && (
                    <input
                      type="text"
                      placeholder="Mozilla/5.0 ..."
                      value={customUserAgent}
                      onChange={(e) => setCustomUserAgent(e.target.value)}
                      className="spec-input w-full mt-2 px-2.5 py-1.5 text-xs text-[var(--ink)]"
                    />
                  )}
                </div>

                <div>
                  <label className="spec-eyebrow block mb-1 text-[10px]">
                    TIMEOUT THRESHOLD:
                  </label>
                  <select
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                    disabled={isLoading}
                    className="spec-input w-full px-2.5 py-1.5 text-xs text-[var(--ink)]"
                  >
                    <option value={15000}>15 SECONDS (FAST / STATIC SITES)</option>
                    <option value={30000}>30 SECONDS (STANDARD SPEC)</option>
                    <option value={60000}>60 SECONDS (HEAVY MEDIA PIPELINES)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
