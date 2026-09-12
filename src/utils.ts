export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getApiUrl(endpoint: string): string {
  const clean = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  if (typeof window === 'undefined') return clean;

  try {
    let base = document.baseURI || window.location.href;
    const urlObj = new URL(base);
    if (!urlObj.pathname.endsWith('/') && !urlObj.pathname.includes('.')) {
      urlObj.pathname = `${urlObj.pathname}/`;
      base = urlObj.href;
    }
    return new URL(clean, base).href;
  } catch {
    return clean;
  }
}

