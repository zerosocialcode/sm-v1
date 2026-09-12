import React, { useState, useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface LiveTerminalProps {
  logs: LogEntry[];
  progress: number;
  currentStep: string;
  isCompleted: boolean;
  isFailed: boolean;
  errorMessage?: string;
}

export const LiveTerminal: React.FC<LiveTerminalProps> = ({
  logs,
  progress,
  currentStep,
  isCompleted,
  isFailed,
  errorMessage,
}) => {
  const [filter, setFilter] = useState<'all' | 'info' | 'asset' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp.slice(11, 19)}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    if (filter === 'info') return log.level === 'info' || log.level === 'success';
    if (filter === 'asset') return log.tag === 'ASSETS' || log.tag === 'DOWNLOAD' || log.tag === 'DOM';
    if (filter === 'error') return log.level === 'error' || log.level === 'warn';
    return true;
  });

  return (
    <div className="flex flex-col spec-mono text-xs overflow-hidden rounded-[4px] border border-[#44475a] shadow-xl">
      <div className="bg-[#21222c] border-b border-[#44475a] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#50fa7b] animate-pulse inline-block" />
          <span className="text-[11px] font-bold text-[#f8f8f2] tracking-wider">
            TERMINAL // STDOUT
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-[2px] border font-bold ${
              isCompleted
                ? 'text-[#50fa7b] border-[#50fa7b]/50 bg-[#50fa7b]/10'
                : isFailed
                ? 'text-[#ff5555] border-[#ff5555]/50 bg-[#ff5555]/10'
                : 'text-[#8be9fd] border-[#8be9fd]/50 bg-[#8be9fd]/10'
            }`}
          >
            {isCompleted ? '[COMPLETED]' : isFailed ? '[FAILED]' : '[ACTIVE]'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center bg-[#1e1f29] rounded-[3px] p-0.5 border border-[#44475a] text-[10px]">
            {(['all', 'info', 'asset', 'error'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`px-2 py-0.5 rounded-[2px] uppercase transition-colors cursor-pointer ${
                  filter === mode
                    ? 'bg-[#50fa7b] text-[#282a36] font-bold'
                    : 'text-[#6272a4] hover:text-[#f8f8f2]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="py-0.5 px-2 text-[10px] bg-[#1e1f29] border border-[#44475a] text-[#f8f8f2] hover:text-[#50fa7b] hover:border-[#50fa7b] rounded-[3px] transition-colors cursor-pointer"
            title="Toggle automatic scrolling"
          >
            <span>SCROLL: {autoScroll ? '[ON]' : '[OFF]'}</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="py-0.5 px-2 text-[10px] bg-[#1e1f29] border border-[#44475a] text-[#f8f8f2] hover:text-[#50fa7b] hover:border-[#50fa7b] rounded-[3px] transition-colors cursor-pointer"
            title="Copy all logs"
          >
            <span>{copied ? '[COPIED]' : '[COPY]'}</span>
          </button>
        </div>
      </div>

      <div className="bg-[#21222c] border-b border-[#44475a] px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] truncate">
          <span className="text-[#8be9fd] text-[10px] font-semibold">PHASE:</span>
          <span className="font-semibold text-[#50fa7b] truncate">
            {currentStep || (isCompleted ? 'Complete' : 'Initializing pipeline')}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="w-32 sm:w-44 bg-[#1e1f29] h-2 rounded-[2px] overflow-hidden border border-[#44475a]">
            <div
              className="bg-[#50fa7b] h-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <span className="font-bold text-[#50fa7b] text-[11px] min-w-[36px] text-right">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      <div className="bg-[#282a36] p-4 h-80 overflow-y-auto space-y-1 text-[11px] leading-5 font-mono select-text text-[#50fa7b]">
        {filteredLogs.length === 0 ? (
          <div className="text-[#6272a4] py-10 text-center">
            [AWAITING PIPELINE LOGS...]
          </div>
        ) : (
          filteredLogs.map((log) => {
            let tagColor = 'text-[#8be9fd]';
            let msgColor = 'text-[#50fa7b]';

            if (log.level === 'error') {
              tagColor = 'text-[#ff5555] font-bold';
              msgColor = 'text-[#ff5555] font-semibold';
            } else if (log.level === 'warn') {
              tagColor = 'text-[#ffb86c] font-bold';
              msgColor = 'text-[#ffb86c]';
            } else if (log.level === 'success') {
              tagColor = 'text-[#50fa7b] font-bold';
              msgColor = 'text-[#50fa7b] font-semibold';
            }

            return (
              <div
                key={log.id}
                className="flex items-start gap-2 hover:bg-[#44475a]/40 px-1.5 py-0.5 rounded-[2px] transition-colors"
              >
                <span className="text-[#6272a4] text-[10px] shrink-0 font-normal">
                  {log.timestamp.slice(11, 19)}
                </span>
                {log.tag && (
                  <span className={`shrink-0 ${tagColor} text-[10px]`}>
                    [{log.tag}]
                  </span>
                )}
                <span className={`flex-1 break-all ${msgColor}`}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>

      {errorMessage && (
        <div className="p-3 bg-[#ff5555]/10 border-t border-[#ff5555] text-[#ff5555] font-bold text-xs">
          [ERROR]: {errorMessage}
        </div>
      )}
    </div>
  );
};
