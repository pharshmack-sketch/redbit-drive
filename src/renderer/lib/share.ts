/**
 * Формирование ссылок для функции «Поделиться».
 *
 * Требование: S3-ссылки вида
 *   https://s3c3.001.gpucloud.ru/redbit/users/.../file.mp4
 * должны отдаваться пользователю с подменой домена на app.pxbt.io:
 *   https://app.pxbt.io/redbit/users/.../file.mp4
 *
 * Логика:
 *  1. Любой файл с file_url → берём путь (pathname + search) и
 *     заменяем домен на https://app.pxbt.io.
 *     Это скрывает реальный адрес S3-хранилища от пользователя,
 *     маршрутизация происходит через прокси на app.pxbt.io.
 *
 *  2. Если file_url отсутствует и есть s3_key →
 *     строим URL вида https://app.pxbt.io/{s3_key}.
 *
 *  3. Fallback: https://app.pxbt.io/#/files/{fileId}
 *     (ссылка на страницу файла в веб-интерфейсе).
 */

import { supabase } from "@/lib/api";
import type { UserFile } from "@/lib/api";

/** Домен, через который отдаём все публичные ссылки */
const PUBLIC_ORIGIN = "https://app.pxbt.io";

export interface ShareResult {
  url: string;
  /**
   * "proxied" — URL с заменённым доменом (через app.pxbt.io)
   * "webui"   — ссылка на страницу файла в веб-интерфейсе (fallback)
   */
  type: "proxied" | "webui";
}

/**
 * Сформировать ссылку для «Поделиться».
 * Всегда возвращает URL с доменом app.pxbt.io — реальный адрес S3 не раскрывается.
 */
export function generateShareUrl(file: UserFile): ShareResult {
  // ── Основной путь: подменяем домен в file_url ────────────────────────────
  if (file.file_url) {
    const proxied = proxyUrl(file.file_url);
    if (proxied) return { url: proxied, type: "proxied" };
  }

  // ── Fallback через s3_key ─────────────────────────────────────────────────
  if (file.s3_key) {
    const key = file.s3_key.startsWith("/") ? file.s3_key : `/${file.s3_key}`;
    return { url: `${PUBLIC_ORIGIN}${key}`, type: "proxied" };
  }

  // ── Последний fallback: страница файла в веб-интерфейсе ──────────────────
  return { url: `${PUBLIC_ORIGIN}/#/files/${file.id}`, type: "webui" };
}

/**
 * Заменяет домен в URL на PUBLIC_ORIGIN, сохраняя путь и query-параметры.
 *
 * Пример:
 *   https://s3c3.001.gpucloud.ru/redbit/users/ef39.../personal/7356...mp4
 *   → https://app.pxbt.io/redbit/users/ef39.../personal/7356...mp4
 *
 * Суппортирует любой S3-хост — не завязано на конкретный адрес хранилища.
 */
function proxyUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);

    // Уже наш домен — возвращаем как есть
    if (u.origin === PUBLIC_ORIGIN) return rawUrl;

    // Собираем проксированный URL: наш origin + путь + query
    const proxied = new URL(PUBLIC_ORIGIN);
    proxied.pathname = u.pathname;
    proxied.search   = u.search;   // сохраняем query-параметры (если есть токены)
    proxied.hash     = u.hash;

    return proxied.toString();
  } catch {
    return null;
  }
}

// ── Утилиты для UI ────────────────────────────────────────────────────────

/**
 * Скопировать ссылку в буфер обмена.
 * В Electron — через IPC, в браузере — через navigator.clipboard.
 */
export async function copyShareUrl(url: string): Promise<void> {
  const api = (window as any).electronAPI;
  if (api?.clipboard?.writeText) {
    await api.clipboard.writeText(url);
  } else {
    await navigator.clipboard.writeText(url);
  }
}

/**
 * Читаемое описание типа ссылки для пользователя.
 */
export function describeShareType(result: ShareResult): string {
  switch (result.type) {
    case "proxied": return "Ссылка на файл";
    case "webui":   return "Ссылка на файл в веб-интерфейсе";
  }
}
