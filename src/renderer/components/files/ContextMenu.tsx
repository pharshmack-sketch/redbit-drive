/**
 * п.3 ТЗ — Контекстное меню файлов/папок (правая кнопка мыши).
 *
 * Пункты для папки:   Создать папку, Вырезать, Копировать, Вставить, Удалить, Переименовать
 * Пункты для файла:   Открыть, Скачать, Оставить в облаке, Вырезать, Копировать, Удалить, Переименовать
 * Групповые операции: Вырезать всё, Копировать всё, Удалить всё, Скачать всё
 */

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { UserFile } from "@/lib/api";
import {
  Download, Trash2, Edit2, Copy, Scissors, Clipboard,
  FolderPlus, ExternalLink, Cloud, CloudOff, Share2,
  FolderOpen, File, ChevronRight,
} from "lucide-react";

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  dividerBefore?: boolean;
  disabled?: boolean;
  submenu?: ContextMenuAction[];
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuAction[];
  onAction: (id: string) => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onAction, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Закрытие по клику вне меню и по Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Корректируем позицию если меню выходит за границы экрана
  const adjustedX = Math.min(x, window.innerWidth  - 220);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 34 - 16);

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] bg-popover border border-border rounded-lg shadow-modal py-1 min-w-[200px] animate-fade-in"
      style={{ left: adjustedX, top: adjustedY }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => (
        <React.Fragment key={item.id}>
          {item.dividerBefore && idx > 0 && (
            <div className="my-1 border-t border-border/50" />
          )}
          {item.submenu ? (
            <SubmenuItem item={item} onAction={onAction} onClose={onClose} parentX={adjustedX} />
          ) : (
            <button
              disabled={item.disabled}
              onClick={() => { if (!item.disabled) { onAction(item.id); onClose(); } }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors text-left",
                item.disabled
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : item.danger
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-accent"
              )}
            >
              {item.icon && <span className="w-4 h-4 shrink-0 flex items-center">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <kbd className="text-[10px] text-muted-foreground font-mono ml-2 shrink-0">{item.shortcut}</kbd>
              )}
            </button>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function SubmenuItem({ item, onAction, onClose, parentX }: { item: ContextMenuAction; onAction: (id: string) => void; onClose: () => void; parentX: number }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent text-left">
        {item.icon && <span className="w-4 h-4 shrink-0 flex items-center">{item.icon}</span>}
        <span className="flex-1">{item.label}</span>
        <ChevronRight className="w-3 h-3 text-muted-foreground ml-2" />
      </button>
      {open && item.submenu && (
        <div className={cn(
          "absolute top-0 bg-popover border border-border rounded-lg shadow-modal py-1 min-w-[160px] z-[201] animate-fade-in",
          parentX > window.innerWidth / 2 ? "right-full" : "left-full"
        )}>
          {item.submenu.map((sub) => (
            <button
              key={sub.id}
              onClick={() => { onAction(sub.id); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent text-left text-foreground"
            >
              {sub.icon && <span className="w-4 h-4 shrink-0 flex items-center">{sub.icon}</span>}
              <span>{sub.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Фабрики пунктов меню ─────────────────────────────────────────────────

/** Пункты контекстного меню для папки */
export function getFolderMenuItems(
  hasClipboard: boolean,
  canPaste: boolean
): ContextMenuAction[] {
  return [
    { id: "open",        label: "Открыть",          icon: <FolderOpen className="w-4 h-4" /> },
    { id: "new-folder",  label: "Создать папку",     icon: <FolderPlus className="w-4 h-4" />, dividerBefore: true },
    { id: "rename",      label: "Переименовать",     icon: <Edit2      className="w-4 h-4" />, shortcut: "F2", dividerBefore: true },
    { id: "cut",         label: "Вырезать",          icon: <Scissors   className="w-4 h-4" />, shortcut: "⌘X" },
    { id: "copy",        label: "Копировать",        icon: <Copy       className="w-4 h-4" />, shortcut: "⌘C" },
    { id: "paste",       label: "Вставить",          icon: <Clipboard  className="w-4 h-4" />, shortcut: "⌘V", disabled: !canPaste, dividerBefore: false },
    { id: "delete",      label: "Удалить",           icon: <Trash2     className="w-4 h-4" />, shortcut: "Del", danger: true, dividerBefore: true },
  ];
}

/** Пункты контекстного меню для файла */
export function getFileMenuItems(
  file: UserFile,
  hasLocalCopy: boolean,
  canPaste: boolean
): ContextMenuAction[] {
  return [
    { id: "open",       label: "Открыть",                  icon: <ExternalLink className="w-4 h-4" /> },
    { id: "download",   label: "Скачать / Сохранить на компьютер", icon: <Download className="w-4 h-4" />, dividerBefore: true },
    ...(hasLocalCopy ? [{ id: "remove-local", label: "Оставить только в облаке", icon: <CloudOff className="w-4 h-4 text-warning" /> }] : []),
    { id: "rename",     label: "Переименовать",            icon: <Edit2    className="w-4 h-4" />, shortcut: "F2", dividerBefore: true },
    { id: "cut",        label: "Вырезать",                 icon: <Scissors className="w-4 h-4" />, shortcut: "⌘X" },
    { id: "copy",       label: "Копировать",               icon: <Copy     className="w-4 h-4" />, shortcut: "⌘C" },
    { id: "paste",      label: "Вставить",                 icon: <Clipboard className="w-4 h-4" />, shortcut: "⌘V", disabled: !canPaste },
    { id: "share",      label: "Поделиться",               icon: <Share2   className="w-4 h-4" />, dividerBefore: true },
    { id: "delete",     label: "Удалить",                  icon: <Trash2   className="w-4 h-4" />, shortcut: "Del", danger: true, dividerBefore: true },
  ];
}

/** Пункты для пустой области (фон) */
export function getBackgroundMenuItems(canPaste: boolean): ContextMenuAction[] {
  return [
    { id: "new-folder", label: "Создать папку",   icon: <FolderPlus className="w-4 h-4" /> },
    { id: "upload",     label: "Загрузить файлы", icon: <File       className="w-4 h-4" /> },
    { id: "paste",      label: "Вставить",        icon: <Clipboard  className="w-4 h-4" />, shortcut: "⌘V", disabled: !canPaste, dividerBefore: true },
    { id: "refresh",    label: "Обновить",        dividerBefore: true },
  ];
}

/** Пункты для нескольких выделенных объектов */
export function getMultiSelectMenuItems(count: number): ContextMenuAction[] {
  return [
    { id: "download-all", label: `Скачать все (${count})`, icon: <Download  className="w-4 h-4" /> },
    { id: "cut-all",      label: "Вырезать всё",           icon: <Scissors  className="w-4 h-4" /> },
    { id: "copy-all",     label: "Копировать всё",         icon: <Copy      className="w-4 h-4" /> },
    { id: "delete-all",   label: `Удалить все (${count})`, icon: <Trash2    className="w-4 h-4" />, danger: true, dividerBefore: true },
  ];
}

// ── Хук для контекстного меню ─────────────────────────────────────────────
export function useContextMenu() {
  const [menu, setMenu] = React.useState<{ x: number; y: number; items: ContextMenuAction[]; onAction: (id: string) => void } | null>(null);

  const openMenu = React.useCallback((
    e: React.MouseEvent,
    items: ContextMenuAction[],
    onAction: (id: string) => void
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items, onAction });
  }, []);

  const closeMenu = React.useCallback(() => setMenu(null), []);

  const MenuElement = menu ? (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      items={menu.items}
      onAction={menu.onAction}
      onClose={closeMenu}
    />
  ) : null;

  return { openMenu, closeMenu, MenuElement };
}
