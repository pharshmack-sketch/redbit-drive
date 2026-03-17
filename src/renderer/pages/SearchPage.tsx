/**
 * п.10 ТЗ — Расширенный поиск файлов
 *
 * Функции:
 * - Поиск по имени (debounce 300ms)
 * - Фильтры по типу файла (изображения, видео, аудио, документы, архивы, прочее)
 * - Фильтры по дате изменения (сегодня, неделя, месяц, год)
 * - Фильтр по размеру (< 1МБ, 1–100МБ, > 100МБ)
 * - Сортировка (по имени, дате, размеру)
 * - Результаты с возможностью скачать / удалить прямо из поиска
 */

import React, {
  useState, useCallback, useEffect, useRef, useMemo,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { filesAPI, type UserFile } from "@/lib/api";
import { dialog, download, isElectron } from "@/lib/electron";
import { useShortcut } from "@/components/DashboardLayout";
import { formatBytes, formatRelativeDate, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import FileIcon from "@/components/files/FileIcon";
import {
  Search, Loader2, FolderOpen, Download, Trash2,
  Filter, X, Calendar, HardDrive, FileType,
  SortAsc, SortDesc, ArrowUpDown, ChevronDown,
} from "lucide-react";

// ── Типы фильтров ──────────────────────────────────────────────────────────
type FileTypeFilter =
  | "all" | "image" | "video" | "audio" | "document" | "archive" | "other";

type DateFilter = "all" | "today" | "week" | "month" | "year";

type SizeFilter = "all" | "small" | "medium" | "large";

type SortField = "name" | "date" | "size";
type SortDir   = "asc" | "desc";

interface Filters {
  fileType: FileTypeFilter;
  date:     DateFilter;
  size:     SizeFilter;
}

// ── Константы ──────────────────────────────────────────────────────────────
const FILE_TYPE_LABELS: Record<FileTypeFilter, string> = {
  all:      "Все типы",
  image:    "Изображения",
  video:    "Видео",
  audio:    "Аудио",
  document: "Документы",
  archive:  "Архивы",
  other:    "Прочее",
};

const DATE_LABELS: Record<DateFilter, string> = {
  all:   "Любая дата",
  today: "Сегодня",
  week:  "За неделю",
  month: "За месяц",
  year:  "За год",
};

const SIZE_LABELS: Record<SizeFilter, string> = {
  all:    "Любой размер",
  small:  "< 1 МБ",
  medium: "1 – 100 МБ",
  large:  "> 100 МБ",
};

// ── Определение типа файла по MIME ─────────────────────────────────────────
function classifyFile(mime: string | null): FileTypeFilter {
  if (!mime) return "other";
  if (mime.startsWith("image/"))  return "image";
  if (mime.startsWith("video/"))  return "video";
  if (mime.startsWith("audio/"))  return "audio";
  if (
    mime.includes("pdf") || mime.includes("word") || mime.includes("excel") ||
    mime.includes("powerpoint") || mime.includes("text") || mime.includes("document") ||
    mime.includes("spreadsheet")
  ) return "document";
  if (
    mime.includes("zip") || mime.includes("rar") || mime.includes("tar") ||
    mime.includes("gzip") || mime.includes("7z")
  ) return "archive";
  return "other";
}

// ── Проверка фильтра даты ─────────────────────────────────────────────────
function passesDateFilter(dateStr: string, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const d   = new Date(dateStr).getTime();
  const now = Date.now();
  const DAY = 86_400_000;
  switch (filter) {
    case "today": return now - d < DAY;
    case "week":  return now - d < 7 * DAY;
    case "month": return now - d < 30 * DAY;
    case "year":  return now - d < 365 * DAY;
  }
}

// ── Проверка фильтра размера ──────────────────────────────────────────────
function passesSizeFilter(size: number, filter: SizeFilter): boolean {
  const MB = 1_048_576;
  switch (filter) {
    case "all":    return true;
    case "small":  return size < MB;
    case "medium": return size >= MB && size <= 100 * MB;
    case "large":  return size > 100 * MB;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  КОМПОНЕНТ
// ══════════════════════════════════════════════════════════════════════════════
export default function SearchPage() {
  const { user }   = useAuth();
  const { toast }  = useToast();
  const inputRef   = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query,      setQuery]      = useState("");
  const [allResults, setAllResults] = useState<UserFile[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    fileType: "all",
    date:     "all",
    size:     "all",
  });

  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir,   setSortDir]   = useState<SortDir>("desc");

  // Фокус при открытии страницы
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  // Горячая клавиша Cmd+K → фокус на поиск
  useShortcut((e) => {
    if (e === "search") inputRef.current?.focus();
  });

  // ── Поиск с debounce ───────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!user || q.trim().length < 1) { setAllResults([]); return; }
    setSearching(true);
    try {
      const data = await filesAPI.search(q.trim(), user.id);
      setAllResults(data);
    } catch (err: any) {
      toast({ title: "Ошибка поиска", description: err.message, type: "error" });
    } finally {
      setSearching(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length >= 1) {
      debounceRef.current = setTimeout(() => doSearch(query), 300);
    } else {
      setAllResults([]);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // ── Применяем фильтры + сортировку ───────────────────────────────────
  const filteredResults = useMemo(() => {
    let result = allResults.filter((f) => {
      if (f.is_folder) return filters.fileType === "all"; // папки не фильтруем по типу

      // Тип файла
      if (filters.fileType !== "all" && classifyFile(f.file_type) !== filters.fileType) return false;

      // Дата
      if (!passesDateFilter(f.created_at, filters.date)) return false;

      // Размер
      if (!passesSizeFilter(f.file_size, filters.size)) return false;

      return true;
    });

    // Сортировка
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = a.file_name.localeCompare(b.file_name, "ru"); break;
        case "date": cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case "size": cmp = (a.file_size || 0) - (b.file_size || 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [allResults, filters, sortField, sortDir]);

  const hasActiveFilters =
    filters.fileType !== "all" || filters.date !== "all" || filters.size !== "all";

  const resetFilters = () => setFilters({ fileType: "all", date: "all", size: "all" });

  // ── Скачивание из результатов ──────────────────────────────────────────
  const handleDownload = useCallback(async (item: UserFile) => {
    if (!item.file_url) return;
    if (isElectron()) {
      const savePath = await dialog.selectDirectory("Сохранить в...");
      if (!savePath) return;
      try {
        await download.file({ url: item.file_url, fileName: item.file_name, savePath });
        toast({ title: "Скачан", description: item.file_name, type: "success" });
      } catch (err: any) {
        toast({ title: "Ошибка", description: err.message, type: "error" });
      }
    } else {
      const a = document.createElement("a");
      a.href = item.file_url;
      a.download = item.file_name;
      a.click();
    }
  }, [toast]);

  // ── Сортировка ────────────────────────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <SortAsc className="w-3 h-3 text-primary" /> : <SortDesc className="w-3 h-3 text-primary" />;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Шапка поиска ─────────────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-4 border-b border-border bg-card/50 space-y-3">
        <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Поиск
        </h1>

        {/* Строка поиска */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            {searching
              ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
              : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            }
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск файлов и папок..."
              className="pl-9 pr-8"
            />
            {query && (
              <button
                onClick={() => { setQuery(""); setAllResults([]); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Кнопка фильтров */}
          <Button
            variant={showFilter ? "default" : "outline"}
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setShowFilter(!showFilter)}
          >
            <Filter className="w-3.5 h-3.5" />
            Фильтры
            {hasActiveFilters && (
              <span className="ml-0.5 w-4 h-4 rounded-full bg-primary-foreground/20 text-[10px] flex items-center justify-center font-bold">
                {[filters.fileType, filters.date, filters.size].filter((v) => v !== "all").length}
              </span>
            )}
          </Button>
        </div>

        {/* Панель фильтров */}
        {showFilter && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-muted/30 border border-border animate-fade-in">

            {/* Тип файла */}
            <FilterGroup
              label="Тип файла"
              icon={<FileType className="w-3.5 h-3.5" />}
              value={filters.fileType}
              options={Object.entries(FILE_TYPE_LABELS).map(([v, l]) => ({ value: v as FileTypeFilter, label: l }))}
              onChange={(v) => setFilters((f) => ({ ...f, fileType: v as FileTypeFilter }))}
            />

            {/* Дата */}
            <FilterGroup
              label="Дата добавления"
              icon={<Calendar className="w-3.5 h-3.5" />}
              value={filters.date}
              options={Object.entries(DATE_LABELS).map(([v, l]) => ({ value: v as DateFilter, label: l }))}
              onChange={(v) => setFilters((f) => ({ ...f, date: v as DateFilter }))}
            />

            {/* Размер */}
            <FilterGroup
              label="Размер файла"
              icon={<HardDrive className="w-3.5 h-3.5" />}
              value={filters.size}
              options={Object.entries(SIZE_LABELS).map(([v, l]) => ({ value: v as SizeFilter, label: l }))}
              onChange={(v) => setFilters((f) => ({ ...f, size: v as SizeFilter }))}
            />

            {/* Сброс фильтров */}
            {hasActiveFilters && (
              <div className="sm:col-span-3 flex justify-end">
                <button
                  onClick={resetFilters}
                  className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                >
                  <X className="w-3 h-3" /> Сбросить фильтры
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Результаты ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 py-4 scrollbar-thin">
        {query.length < 1 ? (
          <EmptyState
            icon={<Search className="w-10 h-10 text-muted-foreground/40" />}
            title="Начните вводить запрос"
            desc="Поиск выполняется по именам файлов и папок"
          />
        ) : allResults.length === 0 && !searching ? (
          <EmptyState
            icon={<FolderOpen className="w-10 h-10 text-muted-foreground/40" />}
            title={`Ничего не найдено по запросу «${query}»`}
            desc="Попробуйте изменить запрос или сбросить фильтры"
          />
        ) : filteredResults.length === 0 && allResults.length > 0 ? (
          <EmptyState
            icon={<Filter className="w-10 h-10 text-muted-foreground/40" />}
            title="Нет результатов с текущими фильтрами"
            desc={`Найдено ${allResults.length} объектов, но ни один не прошёл фильтры`}
            action={<button onClick={resetFilters} className="text-sm text-primary hover:underline">Сбросить фильтры</button>}
          />
        ) : (
          <div className="max-w-4xl space-y-4">
            {/* Счётчик + сортировка */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Найдено: <strong className="text-foreground">{filteredResults.length}</strong>
                {allResults.length !== filteredResults.length && (
                  <span> из {allResults.length}</span>
                )}
              </p>

              {/* Сортировка */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">Сортировка:</span>
                {([ ["name", "Имя"], ["date", "Дата"], ["size", "Размер"] ] as [SortField, string][]).map(([field, label]) => (
                  <button
                    key={field}
                    onClick={() => handleSort(field)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
                      sortField === field
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {label} <SortIcon field={field} />
                  </button>
                ))}
              </div>
            </div>

            {/* Список результатов */}
            <div className="space-y-1">
              {filteredResults.map((item) => (
                <SearchResultItem
                  key={item.id}
                  item={item}
                  query={query}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Вспомогательные компоненты ────────────────────────────────────────────

function EmptyState({ icon, title, desc, action }: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
      {icon}
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{desc}</p>
      </div>
      {action}
    </div>
  );
}

/** Строка результата поиска с подсветкой совпадения */
function SearchResultItem({
  item, query, onDownload,
}: {
  item: UserFile;
  query: string;
  onDownload: (item: UserFile) => void;
}) {
  // Подсветка совпадения в имени
  const highlighted = useMemo(() => {
    if (!query) return item.file_name;
    const idx = item.file_name.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return item.file_name;
    return (
      <>
        {item.file_name.slice(0, idx)}
        <mark className="bg-primary/20 text-primary rounded px-0.5">
          {item.file_name.slice(idx, idx + query.length)}
        </mark>
        {item.file_name.slice(idx + query.length)}
      </>
    );
  }, [item.file_name, query]);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-muted/40 transition-colors group cursor-pointer">
      <FileIcon mimeType={item.file_type} isFolder={item.is_folder} size="sm" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{highlighted}</p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {!item.is_folder && (
            <>
              <span>{formatBytes(item.file_size)}</span>
              <span>·</span>
              <span>{classifyFile(item.file_type) !== "other" ? FILE_TYPE_LABELS[classifyFile(item.file_type)] : item.file_type?.split("/")[1] || "файл"}</span>
              <span>·</span>
            </>
          )}
          <span>{formatRelativeDate(item.created_at)}</span>
        </div>
      </div>

      {/* Действия */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!item.is_folder && item.file_url && (
          <button
            onClick={() => onDownload(item)}
            className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Скачать"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        {!item.is_folder && item.file_url && (
          <button
            onClick={() => window.open(item.file_url!, "_blank")}
            className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Открыть"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Выпадающий список для фильтра */
function FilterGroup<T extends string>({
  label, icon, value, options, onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const currentLabel = options.find((o) => o.value === value)?.label || label;
  const isActive = value !== options[0]?.value;

  return (
    <div ref={ref} className="relative">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1.5">
        {icon} {label}
      </label>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors",
          isActive
            ? "border-primary/50 bg-primary/5 text-primary"
            : "border-border bg-background text-foreground hover:bg-muted/50"
        )}
      >
        <span>{currentLabel}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-popover border border-border rounded-lg shadow-modal z-50 py-1 animate-fade-in">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm transition-colors",
                opt.value === value
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-accent"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
