/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get content type from file extension
 */
export function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  if (ext === 'pdf') return 'application/pdf';
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) {
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  }
  if (ext === 'txt') return 'text/plain';
  
  return 'application/octet-stream';
}

/**
 * Extract filename from path
 */
export function getFilenameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || 'file';
}

/**
 * Get folder path from file path
 */
export function getFolderPath(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : filePath;
}
