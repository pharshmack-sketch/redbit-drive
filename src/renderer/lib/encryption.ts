/**
 * п.8 ТЗ — Клиентское шифрование AES-256-GCM
 *
 * Использует Web Crypto API (доступен в Electron renderer без nodeIntegration).
 * Ключ деривируется из пароля пользователя через PBKDF2.
 *
 * Формат зашифрованного файла (бинарный):
 *   [4 bytes: "RBE1"] + [16 bytes: salt] + [12 bytes: iv] + [encrypted data]
 *
 * Безопасность:
 *   - AES-256-GCM: аутентифицированное шифрование, защита от подмены
 *   - PBKDF2 с 310 000 итераций (рекомендация NIST 2023)
 *   - Уникальный salt + IV при каждом шифровании
 *   - Ключ хранится только в памяти, не сериализуется
 */

const MAGIC = new Uint8Array([0x52, 0x42, 0x45, 0x31]); // "RBE1"
const SALT_LEN = 16;
const IV_LEN   = 12;
const PBKDF2_ITERATIONS = 310_000;

/**
 * Деривация ключа из пароля пользователя.
 * Результат кэшируем в модуле — не нужно каждый раз деривировать.
 */
let _cachedKey: CryptoKey | null = null;
let _cachedPassword = "";
let _cachedSalt: Uint8Array | null = null;

export async function deriveKey(password: string, salt?: Uint8Array): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(SALT_LEN));

  if (_cachedKey && _cachedPassword === password && _cachedSalt && arraysEqual(_cachedSalt, s)) {
    return { key: _cachedKey, salt: s };
  }

  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: s, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  _cachedKey = key;
  _cachedPassword = password;
  _cachedSalt = s;

  return { key, salt: s };
}

/** Очищаем кэш ключа при смене пароля или выходе */
export function clearKeyCache(): void {
  _cachedKey = null;
  _cachedPassword = "";
  _cachedSalt = null;
}

/**
 * Зашифровать файл (ArrayBuffer → ArrayBuffer).
 * @param data    Исходные данные
 * @param password Пароль пользователя
 * @returns Зашифрованные данные с заголовком RBE1
 */
export async function encryptFile(data: ArrayBuffer, password: string): Promise<ArrayBuffer> {
  const { key, salt } = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  // Собираем: MAGIC(4) + salt(16) + iv(12) + encrypted
  const result = new Uint8Array(4 + SALT_LEN + IV_LEN + encrypted.byteLength);
  result.set(MAGIC, 0);
  result.set(salt, 4);
  result.set(iv, 4 + SALT_LEN);
  result.set(new Uint8Array(encrypted), 4 + SALT_LEN + IV_LEN);

  return result.buffer;
}

/**
 * Расшифровать файл (ArrayBuffer → ArrayBuffer).
 * @param data     Зашифрованные данные с заголовком RBE1
 * @param password Пароль пользователя
 * @returns Исходные данные
 */
export async function decryptFile(data: ArrayBuffer, password: string): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(data);

  // Проверяем magic bytes
  if (bytes[0] !== 0x52 || bytes[1] !== 0x42 || bytes[2] !== 0x45 || bytes[3] !== 0x31) {
    throw new Error("Файл не зашифрован или повреждён (неверный заголовок)");
  }

  const salt       = bytes.slice(4, 4 + SALT_LEN);
  const iv         = bytes.slice(4 + SALT_LEN, 4 + SALT_LEN + IV_LEN);
  const ciphertext = bytes.slice(4 + SALT_LEN + IV_LEN);

  const { key } = await deriveKey(password, salt);

  try {
    return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch {
    throw new Error("Неверный пароль или файл повреждён");
  }
}

/**
 * Проверить, является ли файл зашифрованным нашим форматом.
 */
export function isEncrypted(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data.slice(0, 4));
  return bytes[0] === 0x52 && bytes[1] === 0x42 && bytes[2] === 0x45 && bytes[3] === 0x31;
}

/**
 * Шифрование File объекта → File (с добавлением суффикса .rbe).
 */
export async function encryptFileObject(file: File, password: string): Promise<File> {
  const buf = await file.arrayBuffer();
  const encrypted = await encryptFile(buf, password);
  return new File([encrypted], file.name + ".rbe", { type: "application/octet-stream" });
}

/**
 * Расшифровка File объекта (убирает суффикс .rbe).
 */
export async function decryptFileObject(file: File, password: string): Promise<File> {
  const buf = await file.arrayBuffer();
  const decrypted = await decryptFile(buf, password);
  const originalName = file.name.endsWith(".rbe") ? file.name.slice(0, -4) : file.name;
  return new File([decrypted], originalName);
}

// ── Утилиты ───────────────────────────────────────────────────────────────
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Хранение пароля шифрования в сессии (только в памяти).
 * Не используем keytar для пароля — пользователь вводит его при каждом запуске.
 */
let _sessionPassword: string | null = null;

export function setSessionPassword(password: string): void {
  _sessionPassword = password;
}

export function getSessionPassword(): string | null {
  return _sessionPassword;
}

export function clearSessionPassword(): void {
  _sessionPassword = null;
  clearKeyCache();
}

export function hasSessionPassword(): boolean {
  return _sessionPassword !== null && _sessionPassword.length > 0;
}
