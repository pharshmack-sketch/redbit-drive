/**
 * DashboardLayout v2.0
 *
 * п.2 ТЗ — логотип перенесён в ПРАВУЮ часть шапки (не перекрывает кнопки macOS).
 *           На macOS hiddenInset первые ~80px слева заняты traffic lights.
 *           Поэтому логотип размещается справа (titlebar-no-drag зона).
 *
 * п.6 ТЗ — локальные горячие клавиши:
 *           F2          — переименовать выделенный файл
 *           Delete/⌫   — удалить выделенный файл
 *           Cmd/Ctrl+A  — выделить всё
 *           Cmd/Ctrl+C  — копировать
 *           Cmd/Ctrl+X  — вырезать
 *           Cmd/Ctrl+V  — вставить
 *           Escape      — снять выделение
 *           Enter       — открыть папку / файл
 *           Backspace   — перейти на уровень выше
 *           Cmd/Ctrl+K  — фокус на поиск
 *           Cmd/Ctrl+Shift+N — новая папка
 *           Cmd/Ctrl+O  — загрузить файлы
 *
 * п.12 ТЗ — слушатель sync:local-change для авто-обновления списка.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import { menu, syncAPI, driveAPI, isElectron, getPlatform } from "@/lib/electron";
import { Bell, RefreshCw, Cloud, CloudOff, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bug 1 fix: логотип в шапке.
 * Используем mascot_original.png — реальное изображение, скачанное с Яндекс.Диска.
 * Путь через import гарантирует корректную работу и в dev (Vite), и в prod (asar).
 * Fallback: inline SVG-заглушка если файл не загрузился.
 */
// Bug 1: @assets alias → desktop-app/assets/icons/mascot_original.png
import mascotUrl from "@assets/icons/mascot_original.png";

const AppLogo = () => (
  <div className="flex items-center gap-1.5 select-none">
    <img
      src={mascotUrl}
      alt="RedBit"
      className="w-6 h-6 object-contain rounded"
      style={{ imageRendering: "auto" }}
      onError={(e) => {
        // Fallback: красный квадрат с буквой R
        const img = e.target as HTMLImageElement;
        img.style.display = "none";
        const parent = img.parentElement;
        if (parent && !parent.querySelector(".logo-fallback")) {
          const fb = document.createElement("div");
          fb.className = "logo-fallback w-6 h-6 rounded bg-destructive flex items-center justify-center text-white text-xs font-bold";
          fb.textContent = "R";
          parent.insertBefore(fb, img);
        }
      }}
    />
    <span
      className="text-sm font-bold text-foreground tracking-tight hidden sm:block"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontStyle: "italic" }}
    >
      RedBit Drive
    </span>
  </div>
);

// Контекст горячих клавиш — диспетчер событий
export type ShortcutEvent =
  | "rename" | "delete" | "select-all" | "copy" | "cut" | "paste"
  | "escape" | "enter" | "go-up" | "new-folder" | "upload" | "search";

const shortcutListeners = new Set<(event: ShortcutEvent) => void>();

export function dispatchShortcut(event: ShortcutEvent) {
  shortcutListeners.forEach((l) => l(event));
}

export function useShortcut(handler: (event: ShortcutEvent) => void) {
  useEffect(() => {
    shortcutListeners.add(handler);
    return () => { shortcutListeners.delete(handler); };
  }, [handler]);
}

export default function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "paused" | "error">("idle");
  const navigate = useNavigate();

  // ── Слушатели меню Electron ─────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      menu.onUpload(()    => { dispatchShortcut("upload"); window.dispatchEvent(new CustomEvent("menu:upload")); }),
      menu.onNewFolder(() => { dispatchShortcut("new-folder"); window.dispatchEvent(new CustomEvent("menu:new-folder")); }),
      menu.onAbout(()     => navigate("/about")),
      menu.onSearch(()    => { dispatchShortcut("search"); navigate("/search"); }),
      menu.onNavigate((p) => navigate(p)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [navigate]);

  // ── Синхронизация ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      syncAPI.onStarted(()  => setSyncStatus("idle")),
      syncAPI.onStopped(()  => setSyncStatus("idle")),
      syncAPI.onError(()    => setSyncStatus("error")),
      syncAPI.onPausedChanged((paused) => setSyncStatus(paused ? "paused" : "idle")),
      syncAPI.onLocalChange(() => {
        setSyncStatus("syncing");
        // Уведомляем FilesPage о необходимости обновления
        window.dispatchEvent(new CustomEvent("sync:files-changed"));
        setTimeout(() => setSyncStatus("idle"), 3000);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // ── Навигация из трея ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = driveAPI.onNavigateTo((id) => {
      navigate("/drive");
      setTimeout(() => window.dispatchEvent(new CustomEvent("drive:navigate-to", { detail: id })), 100);
    });
    return unsub;
  }, [navigate]);

  // ── п.6 ТЗ — Глобальные клавиши (локальные для окна) ───────────────────
  useEffect(() => {
    const isMac = getPlatform() === "darwin";

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inInput = tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable;

      // Только если не в поле ввода (кроме Escape и поиска)
      if (!inInput) {
        if (e.key === "F2")                          { e.preventDefault(); dispatchShortcut("rename"); return; }
        if (e.key === "Delete" || (e.key === "Backspace" && !mod)) { e.preventDefault(); dispatchShortcut("delete"); return; }
        if (e.key === "Escape")                      { e.preventDefault(); dispatchShortcut("escape"); return; }
        if (e.key === "Enter")                       { e.preventDefault(); dispatchShortcut("enter"); return; }
        if (mod && e.key === "a")                    { e.preventDefault(); dispatchShortcut("select-all"); return; }
        if (mod && e.key === "c" && !e.shiftKey)     { dispatchShortcut("copy"); return; }
        if (mod && e.key === "x")                    { dispatchShortcut("cut"); return; }
        if (mod && e.key === "v")                    { dispatchShortcut("paste"); return; }
        if (e.key === "Backspace" && mod)            { e.preventDefault(); dispatchShortcut("go-up"); return; }
      }

      // Работают всегда
      if (mod && e.key === "k")                      { e.preventDefault(); dispatchShortcut("search"); navigate("/search"); return; }
      if (mod && e.shiftKey && e.key === "N")        { e.preventDefault(); dispatchShortcut("new-folder"); return; }
      if (mod && e.key === "o")                      { e.preventDefault(); dispatchShortcut("upload"); return; }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Сайдбар */}
      <div className="relative shrink-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
        />
      </div>

      {/* Основная область */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header syncStatus={syncStatus} setSyncStatus={setSyncStatus} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ── Шапка ──────────────────────────────────────────────────────────────────
function Header({
  syncStatus,
  setSyncStatus,
}: {
  syncStatus: "idle" | "syncing" | "paused" | "error";
  setSyncStatus: (s: "idle" | "syncing" | "paused" | "error") => void;
}) {
  const navigate = useNavigate();
  const isMac = getPlatform() === "darwin";

  const handlePauseToggle = useCallback(async () => {
    if (!isElectron()) return;
    const paused = await syncAPI.pauseToggle();
    setSyncStatus(paused ? "paused" : "idle");
  }, [setSyncStatus]);

  const syncIcon = {
    idle:    <Cloud    className="w-3.5 h-3.5 text-success" />,
    syncing: <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />,
    paused:  <Pause   className="w-3.5 h-3.5 text-warning" />,
    error:   <CloudOff className="w-3.5 h-3.5 text-destructive" />,
  }[syncStatus];

  return (
    <header
      className="h-12 flex items-center border-b border-border bg-card px-4 shrink-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/*
       * п.2 ТЗ — на macOS traffic lights занимают ~80px слева.
       * Поиск размещаем левее центра, логотип — справа.
       * На Windows нет этого ограничения, но логотип всё равно справа
       * для единообразия.
       */}

      {/* Левая зона — поиск (не-drag) */}
      <div
        className={cn("flex items-center gap-2", isMac ? "ml-16" : "ml-0")}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={() => navigate("/search")}
          className="flex items-center gap-2 px-3 h-7 rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-52"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <span className="text-xs">Поиск файлов...</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border font-mono">
            {isMac ? "⌘K" : "Ctrl+K"}
          </kbd>
        </button>
      </div>

      {/* Центральный drag-регион */}
      <div className="flex-1" />

      {/* Правая зона — логотип + статус + колокол (не-drag) */}
      <div
        className="flex items-center gap-3"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {/* Статус синхронизации */}
        {isElectron() && (
          <button
            onClick={handlePauseToggle}
            title={syncStatus === "paused" ? "Возобновить синхронизацию" : syncStatus === "syncing" ? "Синхронизация..." : "Синхронизация в порядке"}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            {syncIcon}
          </button>
        )}

        {/* Колокол уведомлений */}
        <button className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
          <Bell className="w-4 h-4" />
        </button>

        {/* п.2 ТЗ — Логотип в ПРАВОЙ части шапки */}
        <AppLogo />
      </div>
    </header>
  );
}
