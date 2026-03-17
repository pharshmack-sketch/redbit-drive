/**
 * Иконка файла/папки в зависимости от MIME-типа.
 */

import React from "react";
import {
  File, FileText, FileImage, FileVideo, FileAudio,
  FileSpreadsheet, FileArchive, Folder, FileJson,
  FilePdf,
} from "lucide-react";
import { getMimeIcon } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface FileIconProps {
  mimeType: string | null;
  isFolder?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  xs: "w-3.5 h-3.5",
  sm: "w-5 h-5",
  md: "w-6 h-6",
  lg: "w-10 h-10",
};

export default function FileIcon({ mimeType, isFolder = false, size = "sm", className }: FileIconProps) {
  const cls = cn(SIZE_MAP[size], className);

  if (isFolder) return <Folder className={cn(cls, "text-primary/80")} />;

  const kind = getMimeIcon(mimeType);

  switch (kind) {
    case "image":   return <FileImage className={cn(cls, "text-primary")} />;
    case "video":   return <FileVideo className={cn(cls, "text-success")} />;
    case "audio":   return <FileAudio className={cn(cls, "text-warning")} />;
    case "pdf":     return <FileText className={cn(cls, "text-destructive")} />;
    case "spreadsheet": return <FileText className={cn(cls, "text-success")} />;
    case "document": return <FileText className={cn(cls, "text-primary")} />;
    case "archive": return <File className={cn(cls, "text-warning")} />;
    case "text":    return <FileText className={cn(cls, "text-muted-foreground")} />;
    default:        return <File className={cn(cls, "text-muted-foreground")} />;
  }
}
