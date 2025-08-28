/**
 * Format file size in a human-readable way
 * @param bytes File size in bytes
 * @returns Formatted file size (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  
  return `${size} ${sizes[i]}`;
}

/**
 * Get file icon based on file type
 * @param fileType MIME type or file extension
 * @returns CSS class for the appropriate icon
 */
export function getFileIcon(fileType: string): string {
  if (fileType.includes('pdf')) {
    return 'fa-file-pdf text-red-500';
  } else if (fileType.includes('word') || fileType.includes('docx')) {
    return 'fa-file-word text-blue-500';
  } else if (fileType.includes('excel') || fileType.includes('xlsx')) {
    return 'fa-file-excel text-green-500';
  } else if (fileType.includes('powerpoint') || fileType.includes('pptx')) {
    return 'fa-file-powerpoint text-orange-500';
  } else if (fileType.includes('image')) {
    return 'fa-file-image text-purple-500';
  } else if (fileType.includes('text')) {
    return 'fa-file-alt text-gray-500';
  } else {
    return 'fa-file text-gray-500';
  }
}

/**
 * Check if file is allowed based on its MIME type
 * @param file File object to check
 * @returns Boolean indicating if the file is allowed
 */
export function isFileAllowed(file: File): boolean {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];
  
  // Also check by file extension as fallback since MIME types can be inconsistent
  // Add null/undefined check before calling toLowerCase()
  const fileName = file.name?.toLowerCase() || '';
  const allowedExtensions = ['.pdf', '.doc', '.docx'];
  const hasAllowedExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
  
  return allowedTypes.includes(file.type) || hasAllowedExtension;
}

/**
 * Get initials from a name
 * @param name Full name
 * @returns Initials (e.g., "John Doe" -> "JD")
 */
export function getInitials(name: string): string {
  if (!name) return '';
  
  const names = name.split(' ').filter(n => n.length > 0);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0].charAt(0).toUpperCase();
  
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
}

/**
 * Validate file size
 * @param file File object to check
 * @param maxSizeMB Maximum allowed size in MB
 * @returns Boolean indicating if the file size is valid
 */
export function isFileSizeValid(file: File, maxSizeMB: number = 5): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024; // Convert MB to bytes
  return file.size <= maxSizeBytes;
}

/**
 * Generate a consistent color based on a string (e.g., for avatar backgrounds)
 * @param str Input string
 * @returns CSS color class
 */
export function stringToColor(str: string): string {
  if (!str) return 'bg-primary-100 text-primary-700';
  
  const colors = [
    'bg-primary-100 text-primary-700',
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-yellow-100 text-yellow-700',
    'bg-red-100 text-red-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100 text-pink-700',
    'bg-indigo-100 text-indigo-700',
  ];
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}
