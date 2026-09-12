import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../utils';

interface SourceViewerProps {
  jobId: string;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({ jobId }) => {
  const [viewMode, setViewMode] = useState<'rewritten' | 'original'>('rewritten');
  const [originalHtml, setOriginalHtml] = useState<string>('');
  const [rewrittenHtml, setRewrittenHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setIsLoading(true);
    fetch(getApiUrl(`/api/clone/${jobId}/source`))
      .then((res) => res.json())
      .then((data) => {
        setOriginalHtml(data.originalHtml || '');
        setRewrittenHtml(data.rewrittenHtml || '');
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [jobId]);

  const activeContent = viewMode === 'rewritten' ? rewrittenHtml : originalHtml;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="spec-card flex flex-col spec-mono text-xs h-[560px] overflow-hidden">
      <div className="bg-[var(--bg-deep)] border-b border-[var(--line)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('rewritten')}
            className={`px-3 py-1 rounded-[3px] text-[11px] font-semibold uppercase transition-colors cursor-pointer ${
              viewMode === 'rewritten'
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)]'
            }`}
          >
            MIRRORED HTML (REWRITTEN)
          </button>
          <button
            onClick={() => setViewMode('original')}
            className={`px-3 py-1 rounded-[3px] text-[11px] font-semibold uppercase transition-colors cursor-pointer ${
              viewMode === 'original'
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)]'
            }`}
          >
            ORIGINAL RAW HTML
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 spec-mono text-[var(--ink-faint)] text-xs">
              /
            </span>
            <input
              type="text"
              placeholder="FIND IN DOCUMENT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="spec-input pl-6 pr-3 py-1 text-xs text-[var(--ink)] w-40 sm:w-56 placeholder-[var(--ink-faint)]"
            />
          </div>

          <button
            onClick={handleCopy}
            className="btn-ghost py-1 px-3 text-[11px]"
          >
            <span>{copied ? '[COPIED]' : '[COPY HTML]'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-[var(--paper)] text-[var(--ink)] spec-mono text-[11px] leading-5 select-text">
        {isLoading ? (
          <div className="text-[var(--ink-faint)] py-12 text-center">
            [RETRIEVING DOCUMENT SPECIFICATION...]
          </div>
        ) : !activeContent ? (
          <div className="text-[var(--ink-faint)] py-12 text-center">
            [DOCUMENT SOURCE NOT AVAILABLE]
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-all">
            {activeContent}
          </pre>
        )}
      </div>
    </div>
  );
};
