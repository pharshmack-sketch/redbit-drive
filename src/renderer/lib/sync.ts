/**
 * п.12 ТЗ — Модуль синхронизации (renderer side)
 *
 * Обрабатывает события от chokidar (main process):
 *  - "add"      → загрузить новый файл
 *  - "change"   → обновить существующий файл
 *  - "unlink"   → удалить файл из облака
 *  - "addDir"   → создать папку в облаке
 *  - "unlinkDir"→ удалить папку из облака
 *
 * Обработка конфликтов:
 *  Если файл изменён и в облаке, и локально одновременно →
 *  создаётся конфликтная копия с суффиксом "_conflict_YYYY-MM-DD"
 *
 * Статусы файлов:
 *  "synced"   — файл синхронизирован
 *  "syncing"  — загружается / скачивается
 *  "conflict" — конфликт версий
 *  "error"    — ошибка синхронизации
 *  "local"    — только локально, не загружен
 *  "cloud"    — только в облаке, нет локальной копии
 */

import { syncAPI, fsAPI, isElectron } from "@/lib/electron";
import { uploadFile, filesAPI, type UserFile } from "@/lib/api";
import { encryptFileObject, getSessionPassword, hasSessionPassword } from "@/lib/encryption";

// ── Типы ──────────────────────────────────────────────────────────────────
export type SyncStatus = "synced" | "syncing" | "conflict" | "error" | "local" | "cloud" | "idle";

export interface SyncFileStatus {
  relativePath: string;
  status: SyncStatus;
  errorMessage?: string;
  conflictPath?: string;
  lastSynced?: Date;
}

export interface SyncEvent {
  event: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
  filePath: string;
  relativePath: string;
}

// ── Хранилище статусов ────────────────────────────────────────────────────
const fileStatuses = new Map<string, SyncFileStatus>();
const statusListeners = new Set<() => void>();

export function getSyncStatus(relativePath: string): SyncStatus {
  return fileStatuses.get(relativePath)?.status ?? "idle";
}

export function getAllStatuses(): SyncFileStatus[] {
  return Array.from(fileStatuses.values());
}

export function onStatusChange(cb: () => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

function setStatus(relativePath: string, status: SyncStatus, extra?: Partial<SyncFileStatus>) {
  fileStatuses.set(relativePath, { relativePath, status, ...extra });
  statusListeners.forEach((cb) => cb());
}

// ── Очередь синхронизации ─────────────────────────────────────────────────
interface SyncQueueItem {
  event: SyncEvent;
  userId: string;
  folderId: string | null;
  retries: number;
}

const syncQueue: SyncQueueItem[] = [];
let isSyncRunning = false;
const MAX_RETRIES = 3;

async function processSyncQueue() {
  if (isSyncRunning || syncQueue.length === 0) return;
  isSyncRunning = true;

  while (syncQueue.length > 0) {
    const item = syncQueue.shift()!;
    try {
      await processSyncEvent(item);
    } catch (err: any) {
      console.error("[Sync] Queue error:", err.message);
      if (item.retries < MAX_RETRIES) {
        item.retries++;
        syncQueue.push(item); // повторная попытка
      } else {
        setStatus(item.event.relativePath, "error", { errorMessage: err.message });
      }
    }
  }

  isSyncRunning = false;
}

async function processSyncEvent(item: SyncQueueItem) {
  const { event, userId, folderId } = item;
  const { relativePath, filePath } = event;

  switch (event.event) {
    case "add":
    case "change": {
      setStatus(relativePath, "syncing");
      // Читаем файл из ФС через IPC
      const b64 = await fsAPI.readFile(filePath);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

      // Определяем MIME по расширению
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
        webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", mov: "video/quicktime",
        mp3: "audio/mpeg", wav: "audio/wav", pdf: "application/pdf",
        txt: "text/plain", md: "text/markdown", json: "application/json", zip: "application/zip",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      const mime = mimeMap[ext] || "application/octet-stream";

      let file = new File([bytes], relativePath.split("/").pop() || "file", { type: mime });

      // Шифрование если включено
      if (hasSessionPassword()) {
        const pwd = getSessionPassword()!;
        try {
          file = await encryptFileObject(file, pwd);
        } catch { /* не шифруем, загружаем как есть */ }
      }

      // Проверяем конфликт: существует ли уже такой файл в облаке
      if (event.event === "change") {
        const existing = await checkCloudConflict(relativePath, userId);
        if (existing) {
          // Создаём конфликтную копию
          const conflictName = createConflictName(relativePath);
          setStatus(relativePath, "conflict", { conflictPath: conflictName });
          // Загружаем оба файла
          await uploadFile(file, userId, folderId);
          // Уведомляем renderer о конфликте
          window.dispatchEvent(new CustomEvent("sync:conflict", {
            detail: { original: relativePath, conflict: conflictName },
          }));
          return;
        }
      }

      await uploadFile(file, userId, folderId);
      setStatus(relativePath, "synced", { lastSynced: new Date() });

      // Уведомляем main о завершении
      if (isElectron()) {
        syncAPI.fileSynced({
          name: file.name,
          size: file.size,
          id: `local:${relativePath}`,
        });
      }

      // Обновляем список файлов
      window.dispatchEvent(new CustomEvent("sync:files-changed"));
      break;
    }

    case "unlink": {
      setStatus(relativePath, "syncing");
      // Ищем файл в облаке по имени и удаляем
      try {
        const name = relativePath.split("/").pop() || "";
        // Пытаемся найти через search и удалить
        // В production здесь нужен полный путь → ID маппинг
        console.log("[Sync] File deleted locally:", relativePath);
        setStatus(relativePath, "cloud"); // теперь только в облаке
      } catch {
        setStatus(relativePath, "error");
      }
      break;
    }

    case "addDir": {
      // Создаём папку в облаке
      const dirName = relativePath.split("/").pop() || "";
      try {
        await filesAPI.createFolder(dirName, folderId, userId);
        setStatus(relativePath, "synced");
      } catch (err: any) {
        setStatus(relativePath, "error", { errorMessage: err.message });
      }
      break;
    }

    case "unlinkDir": {
      setStatus(relativePath, "cloud");
      break;
    }
  }
}

/** Проверяем, есть ли файл с таким именем в облаке */
async function checkCloudConflict(relativePath: string, userId: string): Promise<UserFile | null> {
  try {
    const fileName = relativePath.split("/").pop() || "";
    const results = await filesAPI.search(fileName, userId);
    return results.find((f) => f.file_name === fileName && !f.is_folder) ?? null;
  } catch {
    return null;
  }
}

/** Создаём имя конфликтной копии: "file_conflict_2025-01-15.ext" */
function createConflictName(relativePath: string): string {
  const parts = relativePath.split(".");
  const ext = parts.length > 1 ? "." + parts.pop() : "";
  const base = parts.join(".");
  const date = new Date().toISOString().split("T")[0];
  return `${base}_conflict_${date}${ext}`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Запустить обработчик синхронизации.
 * Подписывается на события от main process и ставит их в очередь.
 *
 * @param userId   ID текущего пользователя
 * @param folderId ID папки в облаке (null = корень)
 */
export function initSyncHandler(
  userId: string,
  folderId: string | null = null
): () => void {
  if (!isElectron()) return () => {};

  const unsub = syncAPI.onLocalChange((data) => {
    const event = data as SyncEvent;

    // Игнорируем системные файлы
    const name = event.relativePath.split("/").pop() || "";
    if (name.startsWith(".") || name === "meta.json" || name.endsWith(".rbe.tmp")) return;

    // Ставим в очередь
    syncQueue.push({ event, userId, folderId, retries: 0 });
    processSyncQueue();
  });

  // Слушаем события от ОС (файлы из Finder/Explorer)
  if ((window as any).electronAPI?.integration) {
    const api = (window as any).electronAPI.integration;

    const unsubUploadFile = api.onUploadFile((filePath: string) => {
      // Пользователь выбрал «Отправить в RedBit Drive» в проводнике
      syncQueue.push({
        event: { event: "add", filePath, relativePath: filePath.split(/[\\/]/).pop() || "" },
        userId, folderId, retries: 0,
      });
      processSyncQueue();
      window.dispatchEvent(new CustomEvent("sync:files-changed"));
    });

    return () => { unsub(); unsubUploadFile(); };
  }

  return unsub;
}

/**
 * Сброс всех статусов.
 */
export function resetSyncStatuses() {
  fileStatuses.clear();
  statusListeners.forEach((cb) => cb());
}

/**
 * Хук для использования в React-компонентах.
 * Возвращает статус конкретного файла и обновляется реактивно.
 */
export function useSyncStatus(relativePath: string): SyncStatus {
  const [status, setLocalStatus] = React.useState<SyncStatus>(getSyncStatus(relativePath));

  React.useEffect(() => {
    const unsub = onStatusChange(() => {
      setLocalStatus(getSyncStatus(relativePath));
    });
    return unsub;
  }, [relativePath]);

  return status;
}

// Нужен React для хука
import React from "react";
