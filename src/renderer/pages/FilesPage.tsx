/**
 * FilesPage v2.1
 *
 * Bug 4 fix: функция «Поделиться» теперь генерирует прямые S3/Supabase
 *            presigned URL вместо ссылки на веб-интерфейс app.pxbt.io.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { filesAPI, uploadFile, type UserFile, type StorageStats } from "@/lib/api";
import { dialog, download, isElectron, dragAPI, notificationAPI, syncAPI } from "@/lib/electron";
import { formatBytes, formatRelativeDate, formatSpeed, formatEta, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog";
import FileIcon from "@/components/files/FileIcon";
import {
  useContextMenu, getFolderMenuItems, getFileMenuItems,
  getBackgroundMenuItems, getMultiSelectMenuItems,
} from "@/components/files/ContextMenu";
import { useShortcut, type ShortcutEvent } from "@/components/DashboardLayout";
import { getSessionPassword, hasSessionPassword, encryptFileObject } from "@/lib/encryption";
// Bug 4: импортируем ShareDialog с корректной логикой URL
import ShareDialog from "@/components/files/ShareDialog";
import {
  Upload, Download, Trash2, Loader2, FolderPlus, ChevronRight, Home,
  LayoutList, LayoutGrid, Grid3X3, HardDrive, AlertTriangle,
  Sparkles, Globe, Edit2, Check, X, RefreshCw, FolderOpen, Share2,
} from "lucide-react";

// ── Типы ──────────────────────────────────────────────────────────────────
type ViewMode = "list" | "large" | "small";
interface BreadcrumbItem { id: string | null; name: string; }
interface UploadProgress { fileName: string; totalFiles: number; currentFileIndex: number; progress: number; uploadedBytes: number; totalBytes: number; speedBps: number; startedAt: number; }
interface DownloadProgress { fileName: string; progress: number; downloadedBytes: number; totalBytes: number; }

const SOURCE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  upload:        { label: "Загружено",   icon: <Upload    className="w-3 h-3" />, color: "secondary" },
  ai_generation: { label: "AI",          icon: <Sparkles  className="w-3 h-3" />, color: "warning" },
  project:       { label: "Из проекта", icon: <FolderOpen className="w-3 h-3" />, color: "secondary" },
};

// ── Буфер копирования/вырезания ───────────────────────────────────────────
interface ClipboardBuffer { items: UserFile[]; mode: "copy" | "cut"; }
let globalClipboard: ClipboardBuffer | null = null;

export default function FilesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const dropZoneRef   = useRef<HTMLDivElement>(null);

  // ── Состояние ─────────────────────────────────────────────────────────
  const [items,           setItems]           = useState<UserFile[]>([]);
  const [isLoading,       setIsLoading]       = useState(true);
  const [stats,           setStats]           = useState<StorageStats | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb,      setBreadcrumb]      = useState<BreadcrumbItem[]>([{ id: null, name: "Мой диск" }]);
  const [viewMode,        setViewMode]        = useState<ViewMode>(() => (localStorage.getItem("files-view-mode") as ViewMode) || "list");
  const [selected,        setSelected]        = useState<Set<string>>(new Set());

  // Диалоги
  const [showNewFolder,  setShowNewFolder]  = useState(false);
  const [newFolderName,  setNewFolderName]  = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingId,     setRenamingId]     = useState<string | null>(null);
  const [renameValue,    setRenameValue]    = useState("");
  const [deleteTarget,   setDeleteTarget]   = useState<UserFile | null>(null);
  const [deleting,       setDeleting]       = useState(false);
  // Bug 4: диалог «Поделиться» с корректной генерацией URL
  const [shareFile,      setShareFile]      = useState<UserFile | null>(null);

  // Прогресс
  const [uploadProgress,   setUploadProgress]   = useState<UploadProgress | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  // Drag
  const [isDragOver, setIsDragOver] = useState(false);

  // Контекстное меню
  const { openMenu, MenuElement } = useContextMenu();

  // ── Загрузка данных ───────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await filesAPI.list(currentFolderId, user.id);
      setItems(data);
    } catch (err: any) {
      toast({ title: "Ошибка загрузки", description: err.message, type: "error" });
    } finally { setIsLoading(false); }
  }, [user, currentFolderId, toast]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    try { setStats(await filesAPI.getStats(user.id)); } catch { /* silent */ }
  }, [user]);

  useEffect(() => { loadItems(); loadStats(); }, [loadItems, loadStats]);

  // п.12 — слушатель синхронизации
  useEffect(() => {
    const handler = () => { loadItems(); loadStats(); };
    window.addEventListener("sync:files-changed", handler);
    return () => window.removeEventListener("sync:files-changed", handler);
  }, [loadItems, loadStats]);

  // Слушатели меню
  useEffect(() => {
    const h1 = () => fileInputRef.current?.click();
    const h2 = () => setShowNewFolder(true);
    window.addEventListener("menu:upload",     h1);
    window.addEventListener("menu:new-folder", h2);
    return () => { window.removeEventListener("menu:upload", h1); window.removeEventListener("menu:new-folder", h2); };
  }, []);

  // Прогресс скачивания
  useEffect(() => {
    if (!isElectron()) return;
    const unsub = download.onProgress((d) => {
      setDownloadProgress(d);
      if (d.progress >= 100) setTimeout(() => setDownloadProgress(null), 1500);
    });
    return unsub;
  }, []);

  useEffect(() => { localStorage.setItem("files-view-mode", viewMode); }, [viewMode]);

  // Слушатель смены режима просмотра из меню
  useEffect(() => {
    // Читаем из API menu через событие
    const h = (e: any) => { if (["list","large","small"].includes(e.detail)) setViewMode(e.detail); };
    window.addEventListener("menu:view-mode-change", h);
    return () => window.removeEventListener("menu:view-mode-change", h);
  }, []);

  // ── п.6 — Горячие клавиши ────────────────────────────────────────────
  const handleShortcut = useCallback((event: ShortcutEvent) => {
    const selectedArr = items.filter((i) => selected.has(i.id));
    switch (event) {
      case "new-folder": setShowNewFolder(true); break;
      case "upload":     fileInputRef.current?.click(); break;
      case "escape":     setSelected(new Set()); break;
      case "select-all": setSelected(new Set(items.map((i) => i.id))); break;
      case "rename":
        if (selectedArr.length === 1) startRename(selectedArr[0]);
        break;
      case "delete":
        if (selectedArr.length === 1) setDeleteTarget(selectedArr[0]);
        break;
      case "copy":
        globalClipboard = { items: selectedArr, mode: "copy" };
        toast({ title: `Скопировано: ${selectedArr.length}`, type: "info" });
        break;
      case "cut":
        globalClipboard = { items: selectedArr, mode: "cut" };
        toast({ title: `Вырезано: ${selectedArr.length}`, type: "info" });
        break;
      case "paste": handlePaste(); break;
      case "go-up":
        if (breadcrumb.length > 1) {
          const parent = breadcrumb[breadcrumb.length - 2];
          navigateToFolder(parent.id, parent.name);
        }
        break;
    }
  }, [items, selected, breadcrumb, toast]);

  useShortcut(handleShortcut);

  // ── Навигация ─────────────────────────────────────────────────────────
  const navigateToFolder = useCallback((folderId: string | null, folderName: string) => {
    setCurrentFolderId(folderId);
    setSelected(new Set());
    if (folderId === null) {
      setBreadcrumb([{ id: null, name: "Мой диск" }]);
    } else {
      setBreadcrumb((prev) => {
        const idx = prev.findIndex((b) => b.id === folderId);
        if (idx >= 0) return prev.slice(0, idx + 1);
        return [...prev, { id: folderId, name: folderName }];
      });
    }
  }, []);

  // ── п.8 — Загрузка с шифрованием ─────────────────────────────────────
  const handleUploadFiles = useCallback(async (files: File[]) => {
    if (!user || !files.length) return;
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    const startedAt  = Date.now();
    let overallUploaded = 0;

    if (isElectron()) syncAPI.uploadStarted();

    for (let idx = 0; idx < files.length; idx++) {
      let file = files[idx];

      // п.8 — шифруем если включено
      const encEnabled = await (isElectron() ? (window as any).electronAPI?.config.get("encryptionEnabled") : false);
      if (encEnabled && hasSessionPassword()) {
        try {
          const pwd = getSessionPassword()!;
          file = await encryptFileObject(file, pwd);
          toast({ title: `${files[idx].name} → зашифрован`, type: "info" });
        } catch (err: any) {
          toast({ title: "Ошибка шифрования", description: err.message, type: "error" });
          continue;
        }
      }

      setUploadProgress({
        fileName: files[idx].name, totalFiles: files.length, currentFileIndex: idx + 1,
        progress: Math.round((overallUploaded / totalBytes) * 100),
        uploadedBytes: overallUploaded, totalBytes, speedBps: 0, startedAt,
      });

      try {
        const result = await uploadFile(file, user.id, currentFolderId, (pct) => {
          const current = overallUploaded + Math.round((pct / 100) * file.size);
          const elapsed = (Date.now() - startedAt) / 1000;
          setUploadProgress((prev) => prev ? { ...prev,
            progress: Math.round((current / totalBytes) * 100),
            uploadedBytes: current,
            speedBps: elapsed > 0 ? current / elapsed : 0,
          } : null);
        });
        overallUploaded += file.size;

        // п.9 — уведомление + запись в историю трея
        if (isElectron()) {
          syncAPI.fileSynced({ name: result.file_name, size: result.file_size, id: result.id });
        }
      } catch (err: any) {
        toast({ title: `Ошибка загрузки ${files[idx].name}`, description: err.message, type: "error" });
      }
    }

    setUploadProgress(null);
    await loadItems();
    await loadStats();

    // п.9 — системное уведомление
    notificationAPI.send({ title: "Загрузка завершена", body: `Загружено файлов: ${files.length}`, type: "success" });
    toast({ title: `Загружено: ${files.length}`, type: "success" });
  }, [user, currentFolderId, loadItems, loadStats, toast]);

  const handleElectronUpload = useCallback(async () => {
    if (!isElectron()) { fileInputRef.current?.click(); return; }
    const selected = await dialog.openFile();
    if (!selected?.length) return;
    const files = selected
      .filter((f) => f.data)
      .map((f) => {
        const binary = atob(f.data!);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], f.name, { type: f.type });
      });
    await handleUploadFiles(files);
  }, [handleUploadFiles]);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    await handleUploadFiles(files);
  }, [handleUploadFiles]);

  // ── Drag & Drop ───────────────────────────────────────────────────────
  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false); }, []);
  const handleDrop      = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) await handleUploadFiles(files);
  }, [handleUploadFiles]);

  // ── Скачивание ────────────────────────────────────────────────────────
  const handleDownload = useCallback(async (item: UserFile) => {
    if (!item.file_url) return;
    if (isElectron()) {
      const savePath = await dialog.selectDirectory("Выберите папку для сохранения");
      if (!savePath) return;
      try {
        await download.file({ url: item.file_url, fileName: item.file_name, savePath });
        toast({ title: "Файл скачан", description: item.file_name, type: "success" });
      } catch (err: any) {
        toast({ title: "Ошибка скачивания", description: err.message, type: "error" });
      }
    } else {
      const a = document.createElement("a");
      a.href = item.file_url; a.download = item.file_name; a.click();
    }
  }, [toast]);

  // ── Создание папки ─────────────────────────────────────────────────────
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim() || !user) return;
    setCreatingFolder(true);
    try {
      await filesAPI.createFolder(newFolderName.trim(), currentFolderId, user.id);
      await loadItems();
      toast({ title: "Папка создана", type: "success" });
      setShowNewFolder(false); setNewFolderName("");
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, type: "error" });
    } finally { setCreatingFolder(false); }
  }, [newFolderName, user, currentFolderId, loadItems, toast]);

  // ── Переименование ────────────────────────────────────────────────────
  const startRename  = (item: UserFile) => { setRenamingId(item.id); setRenameValue(item.file_name); };
  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    try {
      await filesAPI.rename(renamingId, renameValue.trim());
      await loadItems();
      toast({ title: "Переименовано", type: "success" });
    } catch (err: any) { toast({ title: "Ошибка", description: err.message, type: "error" }); }
    setRenamingId(null);
  };

  // ── Удаление ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await filesAPI.delete(deleteTarget);
      await loadItems(); await loadStats();
      toast({ title: "Удалено", type: "success" });
      setDeleteTarget(null);
    } catch (err: any) { toast({ title: "Ошибка", description: err.message, type: "error" }); }
    finally { setDeleting(false); }
  }, [deleteTarget, loadItems, loadStats, toast]);

  // ── Копировать/Вставить ───────────────────────────────────────────────
  const handlePaste = useCallback(async () => {
    if (!globalClipboard || !user) return;
    // Упрощённая реализация — копируем записи в БД в текущую папку
    for (const item of globalClipboard.items) {
      try {
        if (!item.is_folder) {
          await uploadFile(
            new File([], item.file_name, { type: item.file_type || undefined }),
            user.id, currentFolderId
          );
        }
      } catch { /* silent */ }
    }
    if (globalClipboard.mode === "cut") globalClipboard = null;
    await loadItems();
    toast({ title: "Вставлено", type: "success" });
  }, [user, currentFolderId, loadItems, toast]);

  // ── п.3 — Контекстное меню ────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, item?: UserFile) => {
    e.preventDefault();
    const selectedArr  = items.filter((i) => selected.has(i.id));
    const canPaste     = !!globalClipboard?.items.length;

    if (selectedArr.length > 1) {
      // Групповые операции
      openMenu(e, getMultiSelectMenuItems(selectedArr.length), (actionId) => {
        switch (actionId) {
          case "download-all": selectedArr.forEach((i) => handleDownload(i)); break;
          case "copy-all":     globalClipboard = { items: selectedArr, mode: "copy" }; toast({ title: `Скопировано: ${selectedArr.length}`, type: "info" }); break;
          case "cut-all":      globalClipboard = { items: selectedArr, mode: "cut" }; toast({ title: `Вырезано: ${selectedArr.length}`, type: "info" }); break;
          case "delete-all":   setDeleteTarget(selectedArr[0]); break; // упрощённо, можно расширить
        }
      });
      return;
    }

    if (!item) {
      // Фон (пустая область)
      openMenu(e, getBackgroundMenuItems(canPaste), (actionId) => {
        switch (actionId) {
          case "new-folder": setShowNewFolder(true); break;
          case "upload":     fileInputRef.current?.click(); break;
          case "paste":      handlePaste(); break;
          case "refresh":    loadItems(); break;
        }
      });
      return;
    }

    // Файл или папка
    if (item.is_folder) {
      openMenu(e, getFolderMenuItems(!!globalClipboard, canPaste), (actionId) => {
        switch (actionId) {
          case "open":       navigateToFolder(item.id, item.file_name); break;
          case "new-folder": setShowNewFolder(true); break;
          case "rename":     startRename(item); break;
          case "cut":        globalClipboard = { items: [item], mode: "cut" }; toast({ title: "Вырезано", type: "info" }); break;
          case "copy":       globalClipboard = { items: [item], mode: "copy" }; toast({ title: "Скопировано", type: "info" }); break;
          case "paste":      handlePaste(); break;
          case "delete":     setDeleteTarget(item); break;
        }
      });
    } else {
      const hasLocal = false;
      openMenu(e, getFileMenuItems(item, hasLocal, canPaste), (actionId) => {
        switch (actionId) {
          case "open":         if (item.file_url) window.open(item.file_url, "_blank"); break;
          case "download":     handleDownload(item); break;
          case "rename":       startRename(item); break;
          case "cut":          globalClipboard = { items: [item], mode: "cut" }; toast({ title: "Вырезано", type: "info" }); break;
          case "copy":         globalClipboard = { items: [item], mode: "copy" }; toast({ title: "Скопировано", type: "info" }); break;
          case "paste":        handlePaste(); break;
          case "delete":       setDeleteTarget(item); break;
          // Bug 4: открываем ShareDialog вместо генерации ссылки app.pxbt.io
          case "share":        setShareFile(item); break;
          case "drag-out":
            if (item.file_url) dragAPI.startFile(item.file_url);
            break;
        }
      });
    }
  }, [items, selected, openMenu, navigateToFolder, handleDownload, handlePaste, loadItems, toast]);

  // ── Выделение ─────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    } else {
      setSelected((prev) => prev.size === 1 && prev.has(id) ? new Set() : new Set([id]));
    }
  }, []);

  const allItems = [...items.filter((i) => i.is_folder), ...items.filter((i) => !i.is_folder)];

  // ── Рендер строки списка ──────────────────────────────────────────────
  const renderListItem = (item: UserFile) => {
    const isSelected = selected.has(item.id);
    const isRenaming = renamingId === item.id;
    const src = SOURCE_LABELS[item.source] || SOURCE_LABELS.upload;

    return (
      <div
        key={item.id}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors group cursor-pointer",
          isSelected ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/50",
        )}
        onClick={(e) => { if (!isRenaming) { toggleSelect(item.id, e); if (!e.shiftKey && !e.ctrlKey && !e.metaKey && item.is_folder) navigateToFolder(item.id, item.file_name); } }}
        onDoubleClick={() => { if (!item.is_folder && item.file_url) window.open(item.file_url, "_blank"); }}
        onContextMenu={(e) => handleContextMenu(e, item)}
        // п.7 — drag-out: начать перетаскивание файла в ОС
        draggable={!item.is_folder && !!item.file_url}
        onDragStart={(e) => {
          if (!item.is_folder && item.file_url) {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData("text/uri-list", item.file_url);
            // Если Electron — передаём настоящий файл
            if (isElectron()) {
              e.preventDefault(); // Electron обрабатывает это сам
              dragAPI.startFile(item.file_url);
            }
          }
        }}
      >
        <FileIcon mimeType={item.file_type} isFolder={item.is_folder} size="sm" />

        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                className="h-7 text-sm py-0" autoFocus />
              <Button size="icon-sm" variant="ghost" onClick={commitRename}><Check className="w-3 h-3" /></Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setRenamingId(null)}><X className="w-3 h-3" /></Button>
            </div>
          ) : (
            <p className="text-sm font-medium text-foreground truncate file-name">{item.file_name}</p>
          )}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
            {!item.is_folder && <span>{formatBytes(item.file_size)}</span>}
            <span>{formatRelativeDate(item.created_at)}</span>
          </div>
        </div>

        {!item.is_folder && <Badge variant={src.color as any} className="text-[10px] shrink-0">{src.icon}{src.label}</Badge>}
        {!item.is_folder && item.is_public && <Globe className="w-3.5 h-3.5 text-primary shrink-0" />}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          {!item.is_folder && (
            <>
              {/* Bug 4: кнопка «Поделиться» открывает ShareDialog с прямым S3 URL */}
              <button
                className={cn(
                  "p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground",
                  item.is_public && "text-primary"
                )}
                onClick={() => setShareFile(item)}
                title="Поделиться"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
              <button className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" onClick={() => handleDownload(item)} title="Скачать">
                <Download className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" onClick={() => startRename(item)} title="Переименовать">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(item)} title="Удалить">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderGridCard = (item: UserFile, size: "large" | "small") => {
    const isLg = size === "large";
    const isSelected = selected.has(item.id);

    return (
      <div
        key={item.id}
        className={cn(
          "bg-card border rounded-xl overflow-hidden hover:shadow-elevated transition-all group cursor-pointer flex flex-col",
          isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border hover:border-primary/20"
        )}
        onClick={(e) => { toggleSelect(item.id, e); if (item.is_folder && !e.shiftKey && !e.ctrlKey && !e.metaKey) navigateToFolder(item.id, item.file_name); }}
        onDoubleClick={() => { if (!item.is_folder && item.file_url) window.open(item.file_url, "_blank"); }}
        onContextMenu={(e) => handleContextMenu(e, item)}
        draggable={!item.is_folder && !!item.file_url}
        onDragStart={(e) => {
          if (!item.is_folder && item.file_url) {
            e.dataTransfer.effectAllowed = "copy";
            if (isElectron()) { e.preventDefault(); dragAPI.startFile(item.file_url); }
          }
        }}
      >
        <div className={cn("bg-muted flex items-center justify-center relative overflow-hidden", isLg ? "h-32" : "h-20")}>
          {item.is_folder ? <FileIcon isFolder mimeType={null} size={isLg ? "lg" : "md"} />
            : item.file_type?.startsWith("image") && item.file_url
              ? <img src={item.file_url} alt={item.file_name} className="w-full h-full object-cover" />
              : <FileIcon mimeType={item.file_type} size={isLg ? "lg" : "md"} />
          }
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            {!item.is_folder && <button className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-primary/80 transition-colors" onClick={() => handleDownload(item)}><Download className="w-4 h-4" /></button>}
            <button className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-accent/80 transition-colors" onClick={() => startRename(item)}><Edit2 className="w-4 h-4" /></button>
            <button className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-destructive/80 transition-colors" onClick={() => setDeleteTarget(item)}><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        <div className={cn("px-3 py-2", !isLg && "px-2 py-1.5")}>
          {renamingId === item.id ? (
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
              <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }} className="h-6 text-xs py-0" autoFocus />
              <Button size="icon-sm" variant="ghost" onClick={commitRename}><Check className="w-3 h-3" /></Button>
            </div>
          ) : (
            <p className={cn("font-medium text-foreground truncate", isLg ? "text-sm" : "text-xs")}>{item.file_name}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {!item.is_folder && `${formatBytes(item.file_size)} · `}{formatRelativeDate(item.created_at)}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={dropZoneRef}
      className={cn("flex flex-col h-full overflow-hidden", isDragOver && "ring-2 ring-inset ring-primary/50 bg-primary/5")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => { if (e.target === dropZoneRef.current) handleContextMenu(e); }}
    >
      {/* Шапка */}
      <div className="px-6 pt-5 pb-3 border-b border-border bg-card/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Мой диск</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Центральное хранилище файлов и генераций</p>
          </div>
          {stats && (() => {
            const pct = Math.min(100, (stats.usedBytes / stats.quotaBytes) * 100);
            return (
              <div className="flex items-center gap-3 min-w-48">
                <HardDrive className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={pct >= 90 ? "text-destructive font-medium" : "text-muted-foreground"}>
                      {formatBytes(stats.usedBytes)} / {formatBytes(stats.quotaBytes)}
                    </span>
                    {pct >= 90 && <AlertTriangle className="w-3 h-3 text-destructive" />}
                  </div>
                  <Progress value={pct} className={cn("h-1.5", pct >= 90 && "[&>div]:bg-destructive")} />
                </div>
              </div>
            );
          })()}
        </div>

        {/* Тулбар */}
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          {/* Хлебные крошки */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            {breadcrumb.map((crumb, i) => (
              <React.Fragment key={crumb.id ?? "root"}>
                {i > 0 && <ChevronRight className="w-3 h-3 shrink-0" />}
                <button
                  className={cn("hover:text-foreground transition-colors", i === breadcrumb.length - 1 && "text-foreground font-medium")}
                  onClick={() => navigateToFolder(crumb.id, crumb.name)}
                >
                  {i === 0 ? <Home className="w-3.5 h-3.5 inline" /> : crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Действия */}
          <div className="flex items-center gap-2">
            {/* Режим просмотра */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 bg-muted/30">
              {([["list", <LayoutList className="w-3.5 h-3.5" />], ["large", <LayoutGrid className="w-3.5 h-3.5" />], ["small", <Grid3X3 className="w-3.5 h-3.5" />]] as const).map(([v, icon]) => (
                <button key={v} onClick={() => setViewMode(v)} title={v}
                  className={cn("p-1.5 rounded-md transition-colors", viewMode === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {icon}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => setShowNewFolder(true)}><FolderPlus className="w-3.5 h-3.5" /> Папка</Button>
            <Button size="sm" className="gap-1.5 h-7" onClick={handleElectronUpload} disabled={!!uploadProgress}>
              {uploadProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Загрузить
            </Button>
            <button onClick={() => { loadItems(); loadStats(); }} className="p-1.5 rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground" title="Обновить">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />
          </div>
        </div>
      </div>

      {/* Список файлов */}
      <div
        className="flex-1 overflow-auto px-6 py-4 scrollbar-thin"
        onContextMenu={(e) => { if ((e.target as HTMLElement) === e.currentTarget) handleContextMenu(e); }}
      >
        {isLoading ? (
          <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}</div>
        ) : allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className={cn("w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-4", isDragOver && "scale-110 bg-primary/10")}>
              {currentFolderId ? <FolderOpen className="w-10 h-10 text-muted-foreground/50" /> : <HardDrive className="w-10 h-10 text-muted-foreground/50" />}
            </div>
            <p className="text-sm font-medium text-foreground">{isDragOver ? "Отпустите для загрузки" : "Нет файлов"}</p>
            <p className="text-xs text-muted-foreground mt-1">{isDragOver ? "Файлы будут загружены" : "Перетащите файлы или нажмите «Загрузить»"}</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-1">{allItems.map((item) => renderListItem(item))}</div>
        ) : (
          <div className={cn("grid gap-3", viewMode === "large" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8")}>
            {allItems.map((item) => renderGridCard(item, viewMode as "large" | "small"))}
          </div>
        )}
      </div>

      {/* Прогресс загрузки */}
      {uploadProgress && (
        <div className="border-t border-border bg-card px-4 py-3 animate-fade-in">
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium truncate max-w-[200px]">
                  {uploadProgress.fileName}
                  {uploadProgress.totalFiles > 1 && <span className="text-muted-foreground ml-1">({uploadProgress.currentFileIndex}/{uploadProgress.totalFiles})</span>}
                </span>
                <span className="text-muted-foreground shrink-0 ml-2">
                  {formatBytes(uploadProgress.uploadedBytes)} / {formatBytes(uploadProgress.totalBytes)}
                  {uploadProgress.speedBps > 0 && ` · ${formatSpeed(uploadProgress.speedBps)} · ${formatEta((uploadProgress.totalBytes - uploadProgress.uploadedBytes) / uploadProgress.speedBps)}`}
                </span>
              </div>
              <Progress value={uploadProgress.progress} className="h-1.5" />
            </div>
          </div>
        </div>
      )}

      {/* Прогресс скачивания */}
      {downloadProgress && (
        <div className="border-t border-border bg-card px-4 py-3 animate-fade-in">
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <Download className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium truncate max-w-[200px]">{downloadProgress.fileName}</span>
                <span className="text-muted-foreground">{downloadProgress.progress >= 100 ? "Готово ✓" : `${formatBytes(downloadProgress.downloadedBytes)} / ${formatBytes(downloadProgress.totalBytes)}`}</span>
              </div>
              <Progress value={downloadProgress.progress} className={cn("h-1.5", downloadProgress.progress >= 100 && "[&>div]:bg-success")} />
            </div>
          </div>
        </div>
      )}

      {/* Диалог папки */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent onClose={() => setShowNewFolder(false)}>
          <DialogHeader><DialogTitle>Новая папка</DialogTitle></DialogHeader>
          <Input placeholder="Название папки" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()} autoFocus />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNewFolder(false)}>Отмена</Button>
            <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim() || creatingFolder}>
              {creatingFolder && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent onClose={() => setDeleteTarget(null)}>
          <DialogHeader>
            <DialogTitle>Подтверждение удаления</DialogTitle>
            <DialogDescription>{deleteTarget?.is_folder ? `Папка «${deleteTarget?.file_name}» и всё содержимое будут удалены.` : `Файл «${deleteTarget?.file_name}» будет удалён.`}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bug 4: ShareDialog с корректной генерацией S3/Supabase presigned URL */}
      <ShareDialog
        file={shareFile}
        onClose={() => setShareFile(null)}
      />

      {/* Контекстное меню */}
      {MenuElement}
    </div>
  );
}
