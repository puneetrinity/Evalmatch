import React from 'react';
import {
  File as FileIcon,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
} from 'lucide-react';

type Props = {
  fileType: string;
  className?: string;
  size?: number;
};

export function FileTypeIcon({ fileType, className, size = 20 }: Props) {
  const type = (fileType || '').toLowerCase();

  if (type.includes('pdf')) {
    return <FileText className={className} size={size} />;
  }
  if (type.includes('word') || type.includes('doc') || type.includes('docx')) {
    return <FileText className={className} size={size} />;
  }
  if (type.includes('excel') || type.includes('xlsx') || type.includes('sheet')) {
    return <FileSpreadsheet className={className} size={size} />;
  }
  if (type.includes('image') || type.includes('.png') || type.includes('.jpg') || type.includes('.jpeg')) {
    return <ImageIcon className={className} size={size} />;
  }
  if (type.includes('text') || type.includes('.txt')) {
    return <FileText className={className} size={size} />;
  }
  return <FileIcon className={className} size={size} />;
}

export default FileTypeIcon;

