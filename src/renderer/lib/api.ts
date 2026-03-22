/**
 * RedBit Drive — API Client
 *
 * Обёртка над Supabase + S3.
 * S3-операции проксируются через веб-приложение (app.pxbt.io) посредством
 * storageProxy — десктоп не знает о конфигурации S3.
 * При смене S3-сервера достаточно обновить env в Supabase Dashboard.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { uploadFileViaProxy, shouldUseS3, storageProxy } from "@/lib/storage-proxy";

// ── Конфигурация ─────────────────────────────────────────────────────────
export interface ApiConfig {
  supabaseUrl: string;
  supabaseKey: string;
  useMock?: boolean;
  mockUrl?: string;
}

const DEFAULT_CONFIG: ApiConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "https://kkgpxwxleojvxomgbbjf.supabase.co",
  supabaseKey: import.meta.env.VITE_SUPABASE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrZ3B4d3hsZW9qdnhvbWdiYmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMzIyMjQsImV4cCI6MjA4ODYwODIyNH0.A7ddafbpRoXgg9M9TO49eXea3ptxFZtFF5uX3GkhrPY",
  useMock: import.meta.env.VITE_USE_MOCK === "true",
  mockUrl: import.meta.env.VITE_MOCK_URL || "http://localhost:3001",
};

// ── Supabase singleton ────────────────────────────────────────────────────
let _supabase: SupabaseClient | null = null;

export function getSupabase(cfg: Partial<ApiConfig> = {}): SupabaseClient {
  const c = { ...DEFAULT_CONFIG, ...cfg };
  if (!_supabase) {
    _supabase = createClient(c.supabaseUrl, c.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: localStorage,
      },
    });
  }
  return _supabase;
}

export const supabase = getSupabase();

// ── Типы данных ───────────────────────────────────────────────────────────
export interface UserFile {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string | null;
  file_size: number;
  file_type: string | null;
  is_folder: boolean;
  folder_id: string | null;
  source: "upload" | "ai_generation" | "project";
  storage_backend: "supabase" | "s3";
  s3_key: string | null;
  is_public: boolean;
  share_password: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: "admin" | "project_admin" | "executor" | "client";
  phone: string | null;
  telegram_nickname: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  created_by: string;
}

export interface StorageStats {
  usedBytes: number;
  quotaBytes: number;
  fileCount: number;
}

// ── Файловый API ──────────────────────────────────────────────────────────
export const filesAPI = {
  /** Получить список файлов/папок в указанной директории */
  list: async (folderId: string | null, userId: string): Promise<UserFile[]> => {
    if (DEFAULT_CONFIG.useMock) {
      return mockAPI.files.list(folderId);
    }

    let query = supabase
      .from("user_files")
      .select("*")
      .eq("user_id", userId)
      .order("is_folder", { ascending: false })
      .order("created_at", { ascending: false });

    if (folderId) {
      query = query.eq("folder_id", folderId);
    } else {
      query = query.is("folder_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as UserFile[];
  },

  /** Создать папку */
  createFolder: async (name: string, parentId: string | null, userId: string): Promise<UserFile> => {
    if (DEFAULT_CONFIG.useMock) {
      return mockAPI.files.createFolder(name, parentId);
    }

    const { data, error } = await supabase
      .from("user_files")
      .insert({
        user_id: userId,
        file_name: name,
        is_folder: true,
        folder_id: parentId,
      })
      .select()
      .single();

    if (error) throw error;
    return data as UserFile;
  },

  /** Переименовать файл или папку */
  rename: async (id: string, newName: string): Promise<void> => {
    if (DEFAULT_CONFIG.useMock) {
      return mockAPI.files.rename(id, newName);
    }

    const { error } = await supabase
      .from("user_files")
      .update({ file_name: newName })
      .eq("id", id);

    if (error) throw error;
  },

  /** Удалить файл или папку */
  delete: async (item: UserFile): Promise<void> => {
    if (DEFAULT_CONFIG.useMock) {
      return mockAPI.files.delete(item.id);
    }

    // Удаляем из S3 через прокси (Edge Function на стороне бэкенда)
    if (!item.is_folder && item.storage_backend === "s3" && item.s3_key) {
      try {
        await storageProxy.deleteFiles([item.s3_key]);
      } catch { /* best-effort */ }
    } else if (!item.is_folder && item.file_url) {
      const parts = item.file_url.split("/user-files/");
      const path = parts[1] ? decodeURIComponent(parts[1]) : null;
      if (path) {
        await supabase.storage.from("user-files").remove([path]);
      }
    }

    await supabase.from("user_files").delete().eq("id", item.id);
  },

  /** Получить статистику хранилища */
  getStats: async (userId: string): Promise<StorageStats> => {
    if (DEFAULT_CONFIG.useMock) {
      return mockAPI.files.getStats();
    }

    const { data, error } = await supabase
      .from("user_files")
      .select("file_size")
      .eq("user_id", userId)
      .eq("is_folder", false);

    if (error) throw error;
    const usedBytes = (data || []).reduce((sum, f) => sum + (f.file_size || 0), 0);
    return {
      usedBytes,
      quotaBytes: 10 * 1024 * 1024 * 1024, // 10 GB базовый лимит
      fileCount: data?.length || 0,
    };
  },

  /** Поиск файлов по имени */
  search: async (query: string, userId: string): Promise<UserFile[]> => {
    if (DEFAULT_CONFIG.useMock) {
      return mockAPI.files.search(query);
    }

    const { data, error } = await supabase
      .from("user_files")
      .select("*")
      .eq("user_id", userId)
      .ilike("file_name", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return (data || []) as UserFile[];
  },

  /** Сделать файл публичным / приватным */
  setPublic: async (id: string, isPublic: boolean, password?: string | null): Promise<void> => {
    if (DEFAULT_CONFIG.useMock) return;

    const { error } = await supabase
      .from("user_files")
      .update({ is_public: isPublic, share_password: password ?? null })
      .eq("id", id);

    if (error) throw error;
  },
};

// ── Загрузка файлов ────────────────────────────────────────────────────────
/**
 * Загрузка файла.
 *
 * Все S3-операции делегируются в storageProxy → Supabase Edge Function.
 * Десктоп не знает о конфигурации S3 (endpoint, keys, bucket).
 * При смене провайдера меняются только env-переменные в Supabase Dashboard.
 */
export async function uploadFile(
  file: File,
  userId: string,
  folderId: string | null,
  onProgress?: (pct: number) => void
): Promise<UserFile> {
  // Mock-режим
  if (DEFAULT_CONFIG.useMock) {
    return mockAPI.files.upload(file, folderId, onProgress);
  }

  let fileUrl: string;
  let storageBackend: "supabase" | "s3" = "supabase";
  let s3Key: string | undefined;

  if (shouldUseS3(file)) {
    // ── S3 через прокси-слой (storageProxy → Edge Function) ──────────────
    // Десктоп не обращается к S3 напрямую — только через веб-приложение.
    const fileId = crypto.randomUUID();
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const path = `personal/${fileId}.${ext}`;

    const result = await uploadFileViaProxy(file, path, onProgress);

    fileUrl = result.url;
    storageBackend = "s3";
    s3Key = result.key;
  } else {
    // ── Небольшие файлы — Supabase Storage (не требует S3) ────────────────
    const path = `${userId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("user-files")
      .upload(path, file, {
        onUploadProgress: (p) => {
          if (p.totalBytes > 0) {
            onProgress?.(Math.round((p.uploadedBytes / p.totalBytes) * 100));
          }
        },
      });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("user-files").getPublicUrl(path);
    fileUrl = data.publicUrl;
    onProgress?.(100);
  }

  // Сохраняем метаданные в БД
  const { data, error: insertError } = await supabase
    .from("user_files")
    .insert({
      user_id:          userId,
      file_name:        file.name,
      file_url:         fileUrl,
      file_size:        file.size,
      file_type:        file.type || null,
      folder_id:        folderId,
      source:           "upload",
      storage_backend:  storageBackend,
      s3_key:           s3Key || null,
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return data as UserFile;
}

// ── Auth API ──────────────────────────────────────────────────────────────
export const authAPI = {
  signIn: async (email: string, password: string) => {
    if (DEFAULT_CONFIG.useMock) return mockAPI.auth.signIn(email, password);
    return supabase.auth.signInWithPassword({ email, password });
  },

  signOut: async () => {
    if (DEFAULT_CONFIG.useMock) return mockAPI.auth.signOut();
    return supabase.auth.signOut();
  },

  getSession: async () => {
    if (DEFAULT_CONFIG.useMock) return mockAPI.auth.getSession();
    return supabase.auth.getSession();
  },

  onAuthStateChange: (cb: (event: string, session: any) => void) => {
    if (DEFAULT_CONFIG.useMock) {
      // Mock: просто вернём unsubscribe пустышку
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
    return supabase.auth.onAuthStateChange(cb);
  },
};

// ── Admin API ─────────────────────────────────────────────────────────────
export const adminAPI = {
  getUsers: async (): Promise<UserProfile[]> => {
    if (DEFAULT_CONFIG.useMock) return mockAPI.admin.getUsers();

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as UserProfile[];
  },

  updateUserRole: async (userId: string, role: string): Promise<void> => {
    if (DEFAULT_CONFIG.useMock) return;

    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);

    if (error) throw error;
  },

  deleteUser: async (userId: string): Promise<void> => {
    if (DEFAULT_CONFIG.useMock) return;
    await supabase.from("profiles").delete().eq("id", userId);
  },

  getStorageStats: async (): Promise<{ totalUsers: number; totalFiles: number; totalBytes: number }> => {
    if (DEFAULT_CONFIG.useMock) return mockAPI.admin.getStorageStats();

    const [usersResult, filesResult] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("user_files").select("file_size").eq("is_folder", false),
    ]);

    const totalBytes = (filesResult.data || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0);
    return {
      totalUsers: usersResult.count || 0,
      totalFiles: filesResult.data?.length || 0,
      totalBytes,
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  MOCK API — для тестирования без backend
// ═══════════════════════════════════════════════════════════════════════════
const MOCK_FILES: UserFile[] = [
  {
    id: "f1", user_id: "u1", file_name: "Документы", file_url: null,
    file_size: 0, file_type: null, is_folder: true, folder_id: null,
    source: "upload", storage_backend: "supabase", s3_key: null,
    is_public: false, share_password: null,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "f2", user_id: "u1", file_name: "Медиа", file_url: null,
    file_size: 0, file_type: null, is_folder: true, folder_id: null,
    source: "upload", storage_backend: "supabase", s3_key: null,
    is_public: false, share_password: null,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "f3", user_id: "u1", file_name: "presentation.pdf",
    file_url: "https://example.com/presentation.pdf",
    file_size: 2_450_000, file_type: "application/pdf", is_folder: false,
    folder_id: null, source: "upload", storage_backend: "supabase", s3_key: null,
    is_public: true, share_password: null,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "f4", user_id: "u1", file_name: "photo.jpg",
    file_url: "https://picsum.photos/400/300",
    file_size: 1_200_000, file_type: "image/jpeg", is_folder: false,
    folder_id: null, source: "ai_generation", storage_backend: "s3", s3_key: "personal/abc.jpg",
    is_public: false, share_password: null,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "f5", user_id: "u1", file_name: "report.xlsx",
    file_url: "https://example.com/report.xlsx",
    file_size: 890_000, file_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    is_folder: false, folder_id: null, source: "project", storage_backend: "supabase", s3_key: null,
    is_public: false, share_password: null,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "f6", user_id: "u1", file_name: "video.mp4",
    file_url: "https://example.com/video.mp4",
    file_size: 125_000_000, file_type: "video/mp4", is_folder: false,
    folder_id: null, source: "upload", storage_backend: "s3", s3_key: "personal/video.mp4",
    is_public: false, share_password: null,
    created_at: new Date(Date.now() - 10800000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let mockFilesState = [...MOCK_FILES];

const MOCK_USERS: UserProfile[] = [
  { id: "u1", full_name: "Иван Петров", email: "ivan@example.com", avatar_url: null, role: "admin", phone: "+7 999 123-45-67", telegram_nickname: "@ivan_petrov", created_at: new Date(Date.now() - 86400000 * 30).toISOString() },
  { id: "u2", full_name: "Анна Смирнова", email: "anna@example.com", avatar_url: null, role: "executor", phone: "+7 999 987-65-43", telegram_nickname: "@anna_s", created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: "u3", full_name: "Пётр Козлов", email: "petr@example.com", avatar_url: null, role: "client", phone: null, telegram_nickname: null, created_at: new Date(Date.now() - 86400000 * 10).toISOString() },
  { id: "u4", full_name: "Мария Иванова", email: "maria@example.com", avatar_url: null, role: "executor", phone: "+7 800 000-00-01", telegram_nickname: "@mariia", created_at: new Date(Date.now() - 86400000 * 5).toISOString() },
];

const mockAPI = {
  auth: {
    signIn: async (email: string, password: string) => {
      await new Promise((r) => setTimeout(r, 600));
      if (password === "demo" || password === "admin") {
        const user = { id: "u1", email, user_metadata: { full_name: "Demo User", role: "admin" } };
        return { data: { user, session: { access_token: "mock-token", user } }, error: null };
      }
      return { data: { user: null, session: null }, error: { message: "Неверный email или пароль" } };
    },
    signOut: async () => ({ error: null }),
    getSession: async () => {
      const token = localStorage.getItem("mock_session");
      if (token) {
        return { data: { session: { access_token: token, user: { id: "u1", email: "demo@example.com", user_metadata: { full_name: "Demo User", role: "admin" } } } }, error: null };
      }
      return { data: { session: null }, error: null };
    },
  },

  files: {
    list: async (folderId: string | null) => {
      await new Promise((r) => setTimeout(r, 200));
      return mockFilesState.filter((f) => (folderId ? f.folder_id === folderId : f.folder_id === null));
    },
    createFolder: async (name: string, parentId: string | null): Promise<UserFile> => {
      const folder: UserFile = {
        id: crypto.randomUUID(), user_id: "u1", file_name: name, file_url: null,
        file_size: 0, file_type: null, is_folder: true, folder_id: parentId,
        source: "upload", storage_backend: "supabase", s3_key: null,
        is_public: false, share_password: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      mockFilesState = [folder, ...mockFilesState];
      return folder;
    },
    rename: async (id: string, newName: string) => {
      mockFilesState = mockFilesState.map((f) => f.id === id ? { ...f, file_name: newName } : f);
    },
    delete: async (id: string) => {
      mockFilesState = mockFilesState.filter((f) => f.id !== id);
    },
    upload: async (file: File, folderId: string | null, onProgress?: (p: number) => void): Promise<UserFile> => {
      // Симулируем прогресс загрузки
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((r) => setTimeout(r, 80));
        onProgress?.(i);
      }
      const newFile: UserFile = {
        id: crypto.randomUUID(), user_id: "u1", file_name: file.name,
        file_url: URL.createObjectURL(file),
        file_size: file.size, file_type: file.type, is_folder: false,
        folder_id: folderId, source: "upload", storage_backend: "supabase", s3_key: null,
        is_public: false, share_password: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      mockFilesState = [newFile, ...mockFilesState];
      return newFile;
    },
    search: async (q: string) => {
      return mockFilesState.filter((f) => f.file_name.toLowerCase().includes(q.toLowerCase()));
    },
    getStats: async (): Promise<StorageStats> => {
      const files = mockFilesState.filter((f) => !f.is_folder);
      return {
        usedBytes: files.reduce((s, f) => s + f.file_size, 0),
        quotaBytes: 10 * 1024 * 1024 * 1024,
        fileCount: files.length,
      };
    },
  },

  admin: {
    getUsers: async () => { await new Promise((r) => setTimeout(r, 300)); return MOCK_USERS; },
    getStorageStats: async () => ({
      totalUsers: MOCK_USERS.length,
      totalFiles: mockFilesState.filter((f) => !f.is_folder).length,
      totalBytes: mockFilesState.filter((f) => !f.is_folder).reduce((s, f) => s + f.file_size, 0),
    }),
  },
};
