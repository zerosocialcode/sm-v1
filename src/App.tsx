import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ConfigPanel } from './components/ConfigPanel';
import { LiveTerminal } from './components/LiveTerminal';
import { PreviewFrame } from './components/PreviewFrame';
import { AssetTable } from './components/AssetTable';
import { SourceViewer } from './components/SourceViewer';
import { MetadataView } from './components/MetadataView';
import { CloneJob, CloneOptions, LogEntry } from './types';
import { getApiUrl } from './utils';

export default function App() {
  const [activeJob, setActiveJob] = useState<CloneJob | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'assets' | 'source' | 'metadata' | 'terminal'>('preview');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initialTargetUrl, setInitialTargetUrl] = useState('');
  const [focusInputTrigger, setFocusInputTrigger] = useState(false);
  const [requestedJobId, setRequestedJobId] = useState<string | null>(null);
  const [floodState, setFloodState] = useState<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    const handleUrlResolution = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash.replace(/^#/, '');
      const mode = searchParams.get('mode') || searchParams.get('tab') || (hash.startsWith('mode=') ? hash.replace('mode=', '') : hash);
      const targetUrl = searchParams.get('url') || searchParams.get('site-url') || searchParams.get('site') || searchParams.get('target') || searchParams.get('link');
      const jobId = searchParams.get('jobId') || searchParams.get('id');
      const shouldAuto = searchParams.get('auto') === 'true' || searchParams.get('start') === 'true';

      if (targetUrl) {
        setInitialTargetUrl(targetUrl);
      }

      if (jobId) {
        setRequestedJobId(jobId);
      }

      if (mode === 'clone' || mode === 'clone-site-url' || mode === 'new') {
        setFocusInputTrigger(true);
        if (targetUrl && shouldAuto) {
          handleStartClone({
            url: targetUrl,
            downloadAssets: true,
            deepCssScan: true,
            keepExternalLinks: true,
            addFallbacks: true,
            disableActiveScripts: false,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            timeoutMs: 30000,
          });
        }
      } else if (mode === 'assets') {
        setActiveTab('assets');
      } else if (mode === 'source') {
        setActiveTab('source');
      } else if (mode === 'metadata') {
        setActiveTab('metadata');
      } else if (mode === 'terminal' || mode === 'logs') {
        setActiveTab('terminal');
      } else if (mode === 'preview') {
        setActiveTab('preview');
      }
    };

    handleUrlResolution();
    window.addEventListener('popstate', handleUrlResolution);
    window.addEventListener('hashchange', handleUrlResolution);
    return () => {
      window.removeEventListener('popstate', handleUrlResolution);
      window.removeEventListener('hashchange', handleUrlResolution);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (requestedJobId) {
      fetch(getApiUrl(`/api/clone/${requestedJobId}`))
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: CloneJob) => {
          if (!cancelled) setActiveJob(data);
        })
        .catch(() => {});
    } else {
      fetch(getApiUrl('/api/clones'))
        .then((res) => res.json())
        .then((data: CloneJob[]) => {
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            setActiveJob((prev) => prev || data[0]);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [requestedJobId]);

  useEffect(() => {
    if (!activeJob || (activeJob.status !== 'running' && activeJob.status !== 'pending')) {
      return;
    }

    const eventSource = new EventSource(getApiUrl(`/api/clone/${activeJob.id}/events`));

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'log') {
          const logItem: LogEntry = payload.data;
          setActiveJob((prev) => {
            if (!prev || prev.id !== activeJob.id) return prev;
            if (prev.logs.some((l) => l.id === logItem.id)) return prev;
            return {
              ...prev,
              logs: [...prev.logs, logItem],
            };
          });
        } else if (payload.type === 'progress') {
          setActiveJob((prev) => {
            if (!prev || prev.id !== activeJob.id) return prev;
            return {
              ...prev,
              progress: payload.progress,
              currentStep: payload.step,
            };
          });
        }
      } catch (err) {
        console.error('Error parsing event stream', err);
      }
    };

    const interval = setInterval(() => {
      fetch(getApiUrl(`/api/clone/${activeJob.id}`))
        .then((res) => res.json())
        .then((updatedJob: CloneJob) => {
          setActiveJob((prev) => {
            if (!prev || prev.id !== updatedJob.id) return prev;
            return {
              ...updatedJob,
              logs: updatedJob.logs.length >= prev.logs.length ? updatedJob.logs : prev.logs,
            };
          });

          if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
            setIsLoading(false);
            eventSource.close();
            clearInterval(interval);
          }
        })
        .catch(() => {});
    }, 2000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [activeJob?.id, activeJob?.status]);

  const handleThemeToggleFlood = (coords: { x: number; y: number }, nextTheme: 'day' | 'night') => {
    setFloodState({ active: true, x: coords.x, y: coords.y });
    setTimeout(() => {
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('workshop-theme', nextTheme);
    }, 320);
    setTimeout(() => {
      setFloodState((prev) => ({ ...prev, active: false }));
    }, 700);
  };

  const handleStartClone = async (options: CloneOptions) => {
    setIsLoading(true);
    if (activeJob) {
      try {
        await fetch(getApiUrl(`/api/clone/${activeJob.id}`), { method: 'DELETE' });
      } catch {}
    }
    try {
      const res = await fetch(getApiUrl('/api/clone'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to trigger mirror');
      }

      const newJob: CloneJob = await res.json();
      setActiveJob(newJob);
      setActiveTab('terminal');
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Cloning failed');
      setIsLoading(false);
    }
  };

  const handleCloseSpecimen = async () => {
    if (activeJob) {
      try {
        await fetch(getApiUrl(`/api/clone/${activeJob.id}`), { method: 'DELETE' });
      } catch {}
    }
    setActiveJob(null);
  };

  return (
    <div className="min-h-screen flex flex-col relative selection:bg-[var(--accent)] selection:text-[var(--accent-ink)]">
      <div className="crop-mark crop-mark-tl">+</div>
      <div className="crop-mark crop-mark-tr">+</div>
      <div className="crop-mark crop-mark-bl">+</div>
      <div className="crop-mark crop-mark-br">+</div>

      {floodState.active && (
        <div
          className="light-flood-overlay active"
          style={{
            background: `radial-gradient(circle at ${floodState.x}px ${floodState.y}px, var(--paper) 0%, var(--bg) 60%, transparent 100%)`,
          }}
        />
      )}

      <Header onThemeToggleFlood={handleThemeToggleFlood} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {errorMessage && (
          <div className="spec-card border-2 border-[var(--accent)] bg-[var(--bg-deep)] p-3.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="spec-badge spec-badge-error text-[10px] font-bold">[ENGINE ERROR]</span>
              <span className="text-[var(--ink)] spec-mono font-medium">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="btn-ghost py-1 px-2 text-[10px]"
            >
              [DISMISS]
            </button>
          </div>
        )}

        <div className="space-y-2 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="spec-heading text-4xl sm:text-5xl text-[var(--ink)] m-0 leading-none tracking-tight font-extrabold">
                WEBPAGE MIRROR & ASSET PIPELINE
              </h2>
            </div>

            {activeJob?.metadata && (
              <div>
                <a
                  href={getApiUrl(`/api/clone/${activeJob.id}/zip`)}
                  download
                  className="btn-primary py-2.5 px-4 text-xs tracking-wider"
                >
                  <span>[ EXPORT OFFLINE ZIP BUNDLE ]</span>
                </a>
              </div>
            )}
          </div>

          <p className="spec-body text-xs sm:text-sm text-[var(--ink-soft)] max-w-3xl leading-relaxed">
            Harvest target webpages, rewrite stylesheet asset references, neutralize CORS locks, and generate self-contained offline bundles.
          </p>

          <div className="title-underline-draw" />
        </div>

        <ConfigPanel
          onStartClone={handleStartClone}
          isLoading={isLoading}
          initialUrl={initialTargetUrl}
          autoFocus={focusInputTrigger}
        />

        {activeJob && (
          <div className="space-y-4">
            {(activeJob.status === 'running' || activeJob.status === 'pending' || activeTab === 'terminal') && (
              <LiveTerminal
                logs={activeJob.logs}
                progress={activeJob.progress}
                currentStep={activeJob.currentStep}
                isCompleted={activeJob.status === 'completed'}
                isFailed={activeJob.status === 'failed'}
                errorMessage={activeJob.error}
              />
            )}

            {activeJob.status === 'completed' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--ink)] pb-2">
                  <div className="flex flex-wrap items-center gap-1 spec-mono text-xs">
                    <button
                      id="tab-preview-btn"
                      onClick={() => setActiveTab('preview')}
                      className={`px-3 py-1.5 rounded-[3px] font-semibold uppercase transition-colors cursor-pointer ${
                        activeTab === 'preview'
                          ? 'bg-[var(--ink)] text-[var(--paper)]'
                          : 'bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)]'
                      }`}
                    >
                      [ 01 // SANDBOX PREVIEW ]
                    </button>

                    <button
                      id="tab-assets-btn"
                      onClick={() => setActiveTab('assets')}
                      className={`px-3 py-1.5 rounded-[3px] font-semibold uppercase transition-colors cursor-pointer ${
                        activeTab === 'assets'
                          ? 'bg-[var(--ink)] text-[var(--paper)]'
                          : 'bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)]'
                      }`}
                    >
                      [ 02 // ASSETS ({activeJob.assets.length}) ]
                    </button>

                    <button
                      id="tab-source-btn"
                      onClick={() => setActiveTab('source')}
                      className={`px-3 py-1.5 rounded-[3px] font-semibold uppercase transition-colors cursor-pointer ${
                        activeTab === 'source'
                          ? 'bg-[var(--ink)] text-[var(--paper)]'
                          : 'bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)]'
                      }`}
                    >
                      [ 03 // SOURCE INSPECT ]
                    </button>

                    <button
                      id="tab-metadata-btn"
                      onClick={() => setActiveTab('metadata')}
                      className={`px-3 py-1.5 rounded-[3px] font-semibold uppercase transition-colors cursor-pointer ${
                        activeTab === 'metadata'
                          ? 'bg-[var(--ink)] text-[var(--paper)]'
                          : 'bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)]'
                      }`}
                    >
                      [ 04 // TECHNICAL SPEC ]
                    </button>

                    <button
                      id="tab-terminal-btn"
                      onClick={() => setActiveTab('terminal')}
                      className={`px-3 py-1.5 rounded-[3px] font-semibold uppercase transition-colors cursor-pointer ${
                        activeTab === 'terminal'
                          ? 'bg-[var(--ink)] text-[var(--paper)]'
                          : 'bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)]'
                      }`}
                    >
                      [ 05 // LOGS ({activeJob.logs.length}) ]
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="spec-mono text-xs text-[var(--ink-faint)] hidden md:block">
                      JOB ID: <span className="text-[var(--ink)] font-bold">{activeJob.id}</span>
                    </div>
                    <button
                      onClick={handleCloseSpecimen}
                      className="btn-ghost py-1 px-2.5 text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
                      title="Discard clone and return to clean standby"
                    >
                      [× CLOSE & DISCARD]
                    </button>
                  </div>
                </div>

                {activeTab === 'preview' && (
                  <PreviewFrame
                    jobId={activeJob.id}
                    sourceUrl={activeJob.url}
                    userAgent={activeJob.options.userAgent}
                  />
                )}

                {activeTab === 'assets' && (
                  <AssetTable assets={activeJob.assets} jobId={activeJob.id} />
                )}

                {activeTab === 'source' && (
                  <SourceViewer jobId={activeJob.id} />
                )}

                {activeTab === 'metadata' && (
                  <MetadataView
                    metadata={activeJob.metadata}
                    jobId={activeJob.id}
                    hasZip={activeJob.hasZip}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {!activeJob && (
          <div className="spec-card p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="flex flex-col items-center gap-1">
              <span className="spec-eyebrow text-xs">SPECIFICATION SHEET 00</span>
              <h3 className="spec-heading text-3xl sm:text-4xl text-[var(--ink)] m-0">
                DRAFTING TABLE STANDBY
              </h3>
            </div>

            <p className="spec-body text-xs sm:text-sm text-[var(--ink-soft)] max-w-lg leading-relaxed">
              Enter any target URL in the directive input above and click <span className="font-bold text-[var(--accent)]">ENGAGE MIRROR</span> to harvest assets and generate a standalone offline ZIP bundle for download.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
