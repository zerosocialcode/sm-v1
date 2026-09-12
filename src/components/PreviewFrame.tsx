import React, { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../utils';

interface PreviewFrameProps {
  jobId: string;
  sourceUrl: string;
  userAgent?: string;
}

export const PreviewFrame: React.FC<PreviewFrameProps> = ({ jobId, sourceUrl, userAgent }) => {
  const isMobileUA = Boolean(userAgent && /mobile|android|iphone|ipod/i.test(userAgent));
  const [device, setDevice] = useState<'desktop' | 'laptop' | 'tablet' | 'mobile'>(
    isMobileUA ? 'mobile' : 'desktop'
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [splashDetected, setSplashDetected] = useState(false);
  const [splashDismissed, setSplashDismissed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewUrl = getApiUrl(`/api/clone/${jobId}/preview/index.html`);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SPECTRE_SPA_STATUS') {
        if (e.data.splashDetected !== undefined) {
          setSplashDetected(Boolean(e.data.splashDetected));
        }
        if (e.data.splashDismissed !== undefined) {
          setSplashDismissed(Boolean(e.data.splashDismissed));
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleDismissSplash = () => {
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'SPECTRE_DISMISS_SPLASH' }, '*');
        setSplashDismissed(true);
      }
    } catch (e) {}
  };

  const getContainerWidth = () => {
    switch (device) {
      case 'mobile':
        return 'max-w-[390px]';
      case 'tablet':
        return 'max-w-[768px]';
      case 'laptop':
        return 'max-w-[1024px]';
      default:
        return 'w-full';
    }
  };

  return (
    <div
      className={`spec-card flex flex-col overflow-hidden transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-2 border-[var(--ink)]' : 'h-[640px]'
      }`}
    >
      <div className="bg-[var(--bg-deep)] border-b border-[var(--line)] px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-[var(--paper)] border border-[var(--line)] rounded-[3px] spec-mono text-xs text-[var(--ink)] min-w-[200px] sm:min-w-[320px]">
            <span className="text-[var(--accent)] font-bold text-[10px]">[SANDBOX]</span>
            <span className="text-[var(--ink-soft)] truncate max-w-[160px] sm:max-w-[220px]">
              mirrored://{jobId}/
            </span>
            <span className="text-[var(--line)]">|</span>
            <span className="text-[var(--ink-faint)] truncate text-[11px]" title={sourceUrl}>
              {sourceUrl}
            </span>
          </div>

          <button
            onClick={() => {
              setRefreshKey((k) => k + 1);
              setSplashDismissed(false);
            }}
            className="btn-ghost py-1 px-2 text-[11px]"
            title="Reload sandbox preview"
          >
            <span>[RELOAD]</span>
          </button>

          {splashDetected && !splashDismissed && (
            <button
              onClick={handleDismissSplash}
              className="spec-badge spec-badge-warn px-2 py-1 text-[11px] font-bold cursor-pointer hover:brightness-110"
              title="Dismiss client loading splash screen overlay"
            >
              <span>[DISMISS SPLASH]</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center bg-[var(--paper)] rounded-[3px] p-0.5 border border-[var(--line)]">
            <button
              onClick={() => setDevice('desktop')}
              className={`px-2 py-0.5 rounded-[2px] spec-mono text-[10px] font-semibold transition-colors ${
                device === 'desktop'
                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                  : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
              }`}
            >
              1440PX
            </button>
            <button
              onClick={() => setDevice('laptop')}
              className={`px-2 py-0.5 rounded-[2px] spec-mono text-[10px] font-semibold transition-colors ${
                device === 'laptop'
                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                  : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
              }`}
            >
              1024PX
            </button>
            <button
              onClick={() => setDevice('tablet')}
              className={`px-2 py-0.5 rounded-[2px] spec-mono text-[10px] font-semibold transition-colors ${
                device === 'tablet'
                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                  : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
              }`}
            >
              768PX
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={`px-2 py-0.5 rounded-[2px] spec-mono text-[10px] font-semibold transition-colors ${
                device === 'mobile'
                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                  : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
              }`}
            >
              390PX
            </button>
          </div>

          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost py-1 px-2 text-[11px]"
            title="Open in new browser window"
          >
            <span>[DETACH TAB]</span>
          </a>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-ghost py-1 px-2 text-[11px]"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Preview'}
          >
            <span>{isFullscreen ? '[MINIMIZE]' : '[FULLSCREEN]'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[var(--bg-deep)] p-2 sm:p-4 flex items-center justify-center overflow-auto">
        <div
          className={`h-full ${getContainerWidth()} w-full bg-white rounded-[3px] overflow-hidden border border-[var(--ink)] transition-all duration-300 flex flex-col relative`}
        >
          {device === 'mobile' && (
            <div className="bg-[var(--bg)] border-b border-[var(--line)] px-3 py-1 flex items-center justify-between text-[10px] spec-mono text-[var(--ink-soft)] shrink-0">
              <span className="text-[var(--accent)] font-bold">[VIEWPORT // 390PX MOBILE]</span>
              <span className="text-[var(--ink-faint)]">TOUCH EMULATION READY</span>
            </div>
          )}
          <iframe
            ref={iframeRef}
            key={refreshKey}
            src={previewUrl}
            title="Rendered Output"
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          />
        </div>
      </div>
    </div>
  );
};
