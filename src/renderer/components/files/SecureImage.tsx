import React, { useState, useEffect } from "react";
import { storageProxy } from "@/lib/storage-proxy";

interface SecureImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  s3Key?: string | null;
  storageBackend?: "supabase" | "s3";
  fileName?: string;
}

/**
 * Image component that auto-resolves presigned URLs for private S3 files.
 * For Supabase-hosted or public files, uses the URL directly.
 */
export default function SecureImage({ src, s3Key, storageBackend, fileName, alt, ...imgProps }: SecureImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string>(src ?? "");

  useEffect(() => {
    if (!src) { setResolvedSrc(""); return; }

    if (storageBackend === "s3" && s3Key) {
      let cancelled = false;
      storageProxy.presignGet(s3Key, fileName ?? "image", 3600)
        .then(({ presignedUrl }) => { if (!cancelled) setResolvedSrc(presignedUrl); })
        .catch(() => { if (!cancelled) setResolvedSrc(src); });
      return () => { cancelled = true; };
    }

    setResolvedSrc(src);
  }, [src, s3Key, storageBackend, fileName]);

  if (!resolvedSrc) return null;

  return <img src={resolvedSrc} alt={alt} {...imgProps} />;
}
