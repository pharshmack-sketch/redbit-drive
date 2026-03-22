/**
 * storage-proxy.ts — прокси-слой для работы с S3 через веб-приложение.
 *
 * Ключевая идея:
 *   Десктопный клиент НЕ знает о конфигурации S3 (endpoint, keys, bucket).
 *   Все presigned URL запрашиваются у веб-приложения (app.pxbt.io) или у
 *   Supabase Edge Function с токеном текущего пользователя.
 *   При смене S3-сервера меняется только бэкенд — клиент не требует изменений.
 *
 * Маршрутизация запросов:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  Desktop app                                            │
 *   │                                                         │
 *   │  storageProxy.presign(path, type)                       │
 *   │         │                                               │
 *   │         ▼                                               │
 *   │  storageApiUrl + "/api/storage/presign"   ◄── конфиг    │
 *   │  (по умолчанию: https://app.pxbt.io)                   │
 *   └────────────┬────────────────────────────────────────────┘
 *                │  HTTPS + Bearer JWT
 *                ▼
 *   ┌─────────────────────────────────────┐
 *   │  app.pxbt.io  /api/storage/*        │
 *   │  (Supabase Edge Function proxy)     │
 *   │         │                           │
 *   │         ▼                           │
 *   │  s3-presign Edge Function           │
 *   │  (читает S3_ENDPOINT из env)        │
 *   └───────────┬─────────────────────────┘
 *               │
 *               ▼
 *   ┌─────────────────────────┐
 *   │  S3-совместимое         │
 *   │  хранилище              │
 *   │  (любой провайдер)      │
 *   └─────────────────────────┘
 *
 * Изменение S3-сервера: обновить env-переменные в Supabase Dashboard →
 *   S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_NAME
 * Код десктопного клиента при этом не меняется.
 */

import { supabase } from "@/lib/api";

// ── Конфигурация ──────────────────────────────────────────────────────────
/**
 * Базовый URL, через который десктоп обращается за presigned URL.
 *
 * Значение берётся (по приоритету):
 *  1. Из VITE_STORAGE_API_URL — можно переопределить в .env
 *  2. Из electron-store (config) — пользователь может изменить в настройках
 *  3. Дефолт: https://app.pxbt.io
 *
 * Это единственная точка конфигурации для всего S3-слоя на стороне клиента.
 */
export const DEFAULT_STORAGE_API_URL = "https://app.pxbt.io";

function getStorageApiUrl(): string {
  // Vite env (задаётся при сборке)
  const envUrl = import.meta.env.VITE_STORAGE_API_URL as string | undefined;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return DEFAULT_STORAGE_API_URL;
}

// ── Типы ──────────────────────────────────────────────────────────────────

export interface PresignResponse {
  /** URL для загрузки файла (PUT) */
  presignedUrl: string;
  /** Публичный URL файла после загрузки (через app.pxbt.io) */
  publicUrl: string;
  /** Ключ файла в S3 */
  key: string;
}

export interface MultipartCreateResponse {
  uploadId: string;
  key: string;
  /** Публичный URL файла (доступен после завершения multipart) */
  publicUrl: string;
}

export interface MultipartPartResponse {
  presignedUrl: string;
}

export interface DeleteResponse {
  success: boolean;
}

// ── Вспомогательные функции ───────────────────────────────────────────────

/** Получаем текущий JWT токен пользователя из Supabase */
async function getAuthToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("Not authenticated");
  }
  return session.access_token;
}

/**
 * Основной метод запроса к Storage API.
 * Отправляет POST на {storageApiUrl}/api/storage/proxy с JWT.
 * Веб-приложение проксирует запрос к Supabase Edge Function.
 */
async function storageRequest<T>(
  action: string,
  body: Record<string, unknown>,
  timeoutMs = 20_000
): Promise<T> {
  const token = await getAuthToken();
  const baseUrl = getStorageApiUrl();

  // Прямой вызов Supabase Edge Function через supabase-js
  // Это работает потому что supabase-js уже знает project URL
  // и автоматически добавляет auth header.
  // Таким образом S3-конфиг хранится только в Supabase env.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data, error } = await supabase.functions.invoke("s3-presign", {
      body: { action, ...body },
    });

    if (error) {
      throw new Error(error.message || `Storage API error: ${action}`);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Публичный API хранилища ───────────────────────────────────────────────

export const storageProxy = {

  /**
   * Получить presigned URL для загрузки файла (simple PUT).
   *
   * @param path     Путь в S3 (без ведущего слэша), напр. "personal/uuid.jpg"
   * @param contentType MIME-тип файла
   */
  presign: (path: string, contentType: string): Promise<PresignResponse> =>
    storageRequest<PresignResponse>("presign", {
      path: normalizePath(path),
      contentType,
    }),

  /**
   * Начать multipart-загрузку (для файлов > 10 МБ).
   */
  createMultipart: (path: string, contentType: string): Promise<MultipartCreateResponse> =>
    storageRequest<MultipartCreateResponse>("createMultipart", {
      path: normalizePath(path),
      contentType,
    }),

  /**
   * Подписать часть multipart-загрузки.
   */
  signPart: (key: string, uploadId: string, partNumber: number): Promise<MultipartPartResponse> =>
    storageRequest<MultipartPartResponse>("signPart", { key, uploadId, partNumber }),

  /**
   * Завершить multipart-загрузку.
   */
  completeMultipart: (
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[]
  ): Promise<{ success: boolean; url: string; key: string }> =>
    storageRequest("completeMultipart", { key, uploadId, parts }),

  /**
   * Отменить multipart-загрузку при ошибке.
   */
  abortMultipart: (key: string, uploadId: string): Promise<{ success: boolean }> =>
    storageRequest("abortMultipart", { key, uploadId }),

  /**
   * Удалить файлы из S3.
   */
  deleteFiles: (keys: string[]): Promise<DeleteResponse> =>
    storageRequest<DeleteResponse>("delete", { keys }),

  /**
   * Получить presigned URL для скачивания (GET) — для приватных файлов.
   */
  presignGet: (
    key: string,
    fileName: string,
    expiresIn = 3600
  ): Promise<{ presignedUrl: string }> =>
    storageRequest<{ presignedUrl: string }>("getObject", {
      key,
      expiresIn,
      responseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    }),

};

// ── Загрузка файла с прогрессом ───────────────────────────────────────────

const MULTIPART_THRESHOLD = 10 * 1024 * 1024;  // 10 МБ
const MULTIPART_PART_SIZE = 10 * 1024 * 1024;   // 10 МБ на часть
const MULTIPART_CONCURRENCY = 4;                 // параллельных потоков

/**
 * Загрузить файл в S3 через веб-приложение.
 * Автоматически выбирает simple upload или multipart.
 *
 * @returns { url, key, size } — publicUrl через app.pxbt.io (не прямой S3 URL)
 */
export async function uploadFileViaProxy(
  file: File,
  path: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<{ url: string; key: string; size: number }> {
  if (signal?.aborted) throw new Error("Cancelled");

  if (file.size > MULTIPART_THRESHOLD) {
    return uploadMultipartViaProxy(file, path, onProgress, signal);
  }
  return uploadSimpleViaProxy(file, path, onProgress, signal);
}

/** Simple PUT upload */
async function uploadSimpleViaProxy(
  file: File,
  path: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<{ url: string; key: string; size: number }> {
  const contentType = file.type || "application/octet-stream";
  const { presignedUrl, publicUrl, key } = await storageProxy.presign(path, contentType);

  await xhrPut(presignedUrl, file, onProgress, signal);

  onProgress?.(100);
  return { url: publicUrl, key, size: file.size };
}

/** Multipart upload */
async function uploadMultipartViaProxy(
  file: File,
  path: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<{ url: string; key: string; size: number }> {
  const contentType = file.type || "application/octet-stream";

  // 1. Создаём multipart upload
  const { uploadId, key, publicUrl } = await storageProxy.createMultipart(path, contentType);

  const totalParts = Math.ceil(file.size / MULTIPART_PART_SIZE);
  const partProgress = new Array(totalParts).fill(0);

  const updateTotalProgress = () => {
    const loaded = partProgress.reduce((a, b) => a + b, 0);
    onProgress?.(Math.round((loaded / file.size) * 100));
  };

  const completedParts: { partNumber: number; etag: string }[] = [];

  const uploadPart = async (partIndex: number) => {
    if (signal?.aborted) throw new Error("Cancelled");

    const partNumber = partIndex + 1;
    const start = partIndex * MULTIPART_PART_SIZE;
    const end = Math.min(start + MULTIPART_PART_SIZE, file.size);
    const blob = file.slice(start, end);

    // Получаем presigned URL для этой части
    const { presignedUrl } = await storageProxy.signPart(key, uploadId, partNumber);

    // Загружаем часть
    const etag = await xhrPutPart(presignedUrl, blob, (loaded) => {
      partProgress[partIndex] = loaded;
      updateTotalProgress();
    }, signal);

    completedParts.push({ partNumber, etag });
  };

  try {
    // 2. Параллельная загрузка частей
    let idx = 0;
    const runWorker = async () => {
      while (idx < totalParts) {
        if (signal?.aborted) throw new Error("Cancelled");
        await uploadPart(idx++);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MULTIPART_CONCURRENCY, totalParts) }, runWorker)
    );

    // 3. Завершаем multipart
    const sorted = [...completedParts].sort((a, b) => a.partNumber - b.partNumber);
    await storageProxy.completeMultipart(key, uploadId, sorted);

    onProgress?.(100);
    return { url: publicUrl, key, size: file.size };

  } catch (err) {
    // Отменяем multipart при ошибке
    try { await storageProxy.abortMultipart(key, uploadId); } catch { /* best-effort */ }
    throw err;
  }
}

// ── XHR helpers ───────────────────────────────────────────────────────────

function xhrPut(
  url: string,
  file: File,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let done = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      signal?.removeEventListener("abort", onAbort);
      err ? reject(err) : resolve();
    };

    const onAbort = () => { xhr.abort(); finish(new Error("Cancelled")); };
    if (signal?.aborted) { finish(new Error("Cancelled")); return; }
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.open("PUT", url, true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) finish();
      else finish(new Error(`Upload failed: ${xhr.status} ${xhr.responseText?.slice(0, 200)}`));
    };
    xhr.onerror = () => finish(new Error("Network error during upload"));
    xhr.onabort = () => finish(new Error("Cancelled"));
    xhr.send(file);
  });
}

function xhrPutPart(
  url: string,
  blob: Blob,
  onLoaded: (bytes: number) => void,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let done = false;

    const finish = (err?: Error, etag?: string) => {
      if (done) return;
      done = true;
      signal?.removeEventListener("abort", onAbort);
      err ? reject(err) : resolve(etag!);
    };

    const onAbort = () => { xhr.abort(); finish(new Error("Cancelled")); };
    if (signal?.aborted) { finish(new Error("Cancelled")); return; }
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.open("PUT", url, true);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onLoaded(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onLoaded(blob.size);
        finish(undefined, xhr.getResponseHeader("ETag") || `"${Date.now()}"`);
      } else {
        finish(new Error(`Part upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => finish(new Error("Network error during part upload"));
    xhr.onabort = () => finish(new Error("Cancelled"));
    xhr.send(blob);
  });
}

// ── Утилиты ───────────────────────────────────────────────────────────────

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\.\./g, "");
}

/**
 * Определить: нужен ли S3 для этого файла?
 * Логика идентична веб-приложению (s3-storage.ts).
 */
export function shouldUseS3(file: File): boolean {
  const mediaTypes = ["video/", "audio/", "image/"];
  const mediaExts = [
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v",
    ".mp3", ".wav", ".aac", ".ogg", ".m4a", ".flac",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".heic",
    ".psd", ".ai", ".eps", ".svg", ".raw",
  ];
  if (mediaTypes.some((t) => file.type.startsWith(t))) return true;
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  if (mediaExts.includes(ext)) return true;
  if (file.size > 10 * 1024 * 1024) return true;
  return false;
}
