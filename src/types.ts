export interface CloneOptions {
  url: string;
  downloadAssets: boolean;
  deepCssScan: boolean;
  keepExternalLinks: boolean;
  addFallbacks: boolean;
  disableActiveScripts?: boolean;
  userAgent: string;
  timeoutMs: number;
}

export interface ClonedAsset {
  id: string;
  type: 'image' | 'stylesheet' | 'script' | 'font' | 'icon' | 'other';
  originalUrl: string;
  localPath: string;
  sizeBytes: number;
  mimeType: string;
  status: 'downloaded' | 'skipped' | 'failed';
  errorMessage?: string;
}

export interface CloneJobMetadata {
  clonedAt: string;
  sourceUrl: string;
  finalUrl?: string;
  pageTitle: string;
  assetsDownloaded: number;
  assetsFailed: number;
  totalAssets: number;
  totalSizeText: string;
  downloadTimeMs: number;
  statusCode: number;
  contentType: string;
}

export interface CloneJob {
  id: string;
  url: string;
  options: CloneOptions;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  metadata?: CloneJobMetadata;
  assets: ClonedAsset[];
  logs: LogEntry[];
  hasZip: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'debug' | 'warn' | 'error' | 'success';
  message: string;
  tag?: string;
}
