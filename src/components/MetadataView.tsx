import React from 'react';
import { CloneJobMetadata } from '../types';
import { getApiUrl } from '../utils';

interface MetadataViewProps {
  metadata?: CloneJobMetadata;
  jobId: string;
  hasZip: boolean;
}

export const MetadataView: React.FC<MetadataViewProps> = ({ metadata, jobId }) => {
  if (!metadata) {
    return (
      <div className="spec-card p-8 text-center text-[var(--ink-faint)] spec-mono text-xs">
        [NO SPECIFICATION METADATA COMPILED]
      </div>
    );
  }

  const zipDownloadUrl = getApiUrl(`/api/clone/${jobId}/zip`);

  return (
    <div className="space-y-4 spec-mono text-xs">
      <div className="spec-card p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="spec-badge spec-badge-ok">
              [STANDALONE BUNDLE VERIFIED]
            </span>
            <span className="spec-eyebrow text-[10px]">
              ENGINE ARTIFACT
            </span>
          </div>

          <h3 className="spec-heading text-2xl sm:text-3xl text-[var(--ink)] m-0">
            {metadata.pageTitle || 'MIRRORED WEBPAGE BUNDLE'}
          </h3>

          <p className="spec-body text-[var(--ink-soft)] text-xs leading-relaxed max-w-xl">
            Contains <span className="font-semibold text-[var(--ink)]">{metadata.assetsDownloaded} mirrored assets</span>, rewritten <code className="bg-[var(--bg-deep)] px-1 py-0.5 border border-[var(--line)]">index.html</code> with fallback recovery, and the canonical <code className="bg-[var(--bg-deep)] px-1 py-0.5 border border-[var(--line)]">.spectremirror.json</code> specification.
          </p>
        </div>

        <div>
          <a
            id="download-zip-bundle-btn"
            href={zipDownloadUrl}
            download
            className="btn-primary py-3 px-5 text-xs tracking-wider uppercase"
          >
            <span>[ DOWNLOAD ZIP ARCHIVE // {metadata.totalSizeText} ]</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="spec-card p-3.5">
          <span className="spec-eyebrow text-[10px] block mb-1">TARGET HOST</span>
          <span className="font-bold text-[var(--ink)] truncate block text-sm" title={metadata.sourceUrl}>
            {new URL(metadata.sourceUrl).hostname}
          </span>
        </div>

        <div className="spec-card p-3.5">
          <span className="spec-eyebrow text-[10px] block mb-1">BUNDLED ASSETS</span>
          <span className="font-bold text-[var(--ok)] block text-sm">
            {metadata.assetsDownloaded} / {metadata.totalAssets}
          </span>
        </div>

        <div className="spec-card p-3.5">
          <span className="spec-eyebrow text-[10px] block mb-1">PAYLOAD FOOTPRINT</span>
          <span className="font-bold text-[var(--accent)] block text-sm">
            {metadata.totalSizeText}
          </span>
        </div>

        <div className="spec-card p-3.5">
          <span className="spec-eyebrow text-[10px] block mb-1">CYCLE DURATION</span>
          <span className="font-bold text-[var(--warn)] block text-sm">
            {(metadata.downloadTimeMs / 1000).toFixed(2)}s
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="spec-card p-4 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-[var(--line)] mb-3">
            <span className="font-bold text-[var(--ink)] text-xs">
              .spectremirror.json
            </span>
            <span className="spec-badge">MANIFEST</span>
          </div>
          <pre className="text-[var(--ink-soft)] bg-[var(--bg-deep)] p-3 rounded-[3px] border border-[var(--line)] overflow-auto text-[11px] leading-relaxed flex-1">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>

        <div className="spec-card p-4 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-[var(--line)] mb-3">
            <span className="font-bold text-[var(--ink)] text-xs">
              DEPLOYMENT // RUN PROTOCOL
            </span>
            <span className="spec-badge spec-badge-accent">SPECIFICATION</span>
          </div>

          <div className="space-y-3 text-[var(--ink-soft)] leading-relaxed text-xs flex-1">
            <p>
              To inspect or serve the downloaded bundle locally without CORS restrictions:
            </p>

            <div className="bg-[var(--bg-deep)] p-3 rounded-[3px] border border-[var(--line)] space-y-1">
              <span className="spec-eyebrow text-[10px] block text-[var(--ink-faint)]">TERMINAL COMMANDS:</span>
              <p className="text-[var(--ink)] font-semibold">unzip clone-{jobId.slice(0, 8)}.zip -d mirrored-site</p>
              <p className="text-[var(--ink)] font-semibold">cd mirrored-site</p>
              <p className="text-[var(--ink)] font-semibold">npx serve .</p>
            </div>

            <p className="text-[11px] text-[var(--ink-faint)]">
              Opening directly via <code className="text-[var(--ink)]">file:///</code> works for static HTML/CSS, but local HTTP serving is required for modern JavaScript modules and web fonts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
