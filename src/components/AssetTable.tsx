import React, { useState } from 'react';
import { ClonedAsset } from '../types';
import { formatBytes } from '../utils';

interface AssetTableProps {
  assets: ClonedAsset[];
  jobId: string;
}

export const AssetTable: React.FC<AssetTableProps> = ({ assets }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredAssets = assets.filter((asset) => {
    if (typeFilter !== 'all' && asset.type !== typeFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        asset.originalUrl.toLowerCase().includes(term) ||
        asset.localPath.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const handleCopyPath = (id: string, path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getTypeBadge = (type: ClonedAsset['type']) => {
    switch (type) {
      case 'image':
        return <span className="spec-badge spec-badge-ok">[IMG]</span>;
      case 'stylesheet':
        return <span className="spec-badge spec-badge-accent">[CSS]</span>;
      case 'script':
        return <span className="spec-badge spec-badge-warn">[JS]</span>;
      case 'font':
        return <span className="spec-badge text-[var(--ink)] border-[var(--ink)]">[FONT]</span>;
      case 'icon':
        return <span className="spec-badge text-[var(--accent)] border-[var(--accent)]">[ICON]</span>;
      default:
        return <span className="spec-badge">[FILE]</span>;
    }
  };

  const types = ['all', 'image', 'stylesheet', 'script', 'font', 'icon'];

  return (
    <div className="spec-card flex flex-col spec-mono text-xs overflow-hidden">
      <div className="p-4 bg-[var(--bg-deep)] border-b border-[var(--line)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 spec-mono text-[var(--ink-faint)] text-xs">
              /
            </span>
            <input
              type="text"
              placeholder="SEARCH ASSET PATH OR SOURCE URL..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="spec-input w-full pl-6 pr-3 py-1.5 text-xs text-[var(--ink)] placeholder-[var(--ink-faint)]"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2 py-1 rounded-[3px] uppercase text-[10px] spec-mono transition-colors whitespace-nowrap cursor-pointer ${
                typeFilter === t
                  ? 'bg-[var(--ink)] text-[var(--paper)] font-bold'
                  : 'bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)]'
              }`}
            >
              {t === 'all' ? `ALL (${assets.length})` : t}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[520px]">
        {filteredAssets.length === 0 ? (
          <div className="p-12 text-center text-[var(--ink-faint)] spec-mono text-xs">
            [NO ASSETS MATCHING CURRENT FILTER CRITERIA]
          </div>
        ) : (
          <table className="w-full text-left border-collapse spec-mono">
            <thead>
              <tr className="bg-[var(--bg-deep)] text-[var(--ink-soft)] border-b border-[var(--line)] text-[10px] uppercase tracking-wider">
                <th className="p-3">TYPE</th>
                <th className="p-3">LOCAL RELATIVE PATH</th>
                <th className="p-3">ORIGINAL SOURCE URL</th>
                <th className="p-3">SIZE</th>
                <th className="p-3">STATUS</th>
                <th className="p-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-[var(--bg-deep)] transition-colors">
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {getTypeBadge(asset.type)}
                      <span className="uppercase text-[var(--ink)] text-[10px]">
                        {asset.type}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 font-semibold text-[var(--ink)] max-w-xs truncate">
                    {asset.localPath}
                  </td>
                  <td
                    className="p-3 text-[var(--ink-soft)] max-w-sm truncate text-[11px]"
                    title={asset.originalUrl}
                  >
                    {asset.originalUrl}
                  </td>
                  <td className="p-3 whitespace-nowrap text-[var(--ink-soft)]">
                    {formatBytes(asset.sizeBytes)}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span
                      className={`spec-badge ${
                        asset.status === 'downloaded'
                          ? 'spec-badge-ok'
                          : asset.status === 'failed'
                          ? 'spec-badge-fail'
                          : 'spec-badge-warn'
                      }`}
                    >
                      [{asset.status}]
                    </span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleCopyPath(asset.id, asset.localPath)}
                      className="btn-ghost py-0.5 px-2 text-[10px]"
                      title="Copy local relative path"
                    >
                      {copiedId === asset.id ? '[COPIED]' : '[COPY PATH]'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
