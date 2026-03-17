/**
 * п.11 ТЗ — Корзина
 *
 * Функции:
 * - Список удалённых файлов с датой удаления
 * - Восстановление файлов
 * - Безвозвратное удаление (purge)
 * - Очистка всей корзины
 * - Автоудаление через 30 дней
 */

import React, { useState, useCallback, useEffect } from "react";
import { trashAPI, isElectron, type TrashItem } from "@/lib/electron";
import { filesAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { formatBytes, formatRelativeDate, cn } from "@/lib/utils";
import { Trash2, RotateCcw, AlertTriangle, Package, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog";

interface CloudTrashItem {
  id: string;
  name: string;
  size: number;
  deletedAt: string;
  source: "cloud";
}

export default function TrashPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<TrashItem[]>([]);
  const [cloudItems, setCloudItems] = useState<CloudTrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      // Локальная корзина (Electron)
      if (isElectron()) {
        const local = await trashAPI.list();
        setItems(local);
        // Автоочистка старых файлов
        trashAPI.cleanupOld();
      }

      // Облачные удалённые файлы (если есть поддержка в API)
      // В текущей реализации API пометим is_deleted=true файлы
      // (для полной реализации нужна миграция БД)
    } catch (err: any) {
      toast({ title: "Ошибка загрузки корзины", description: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleRestore = useCallback(async (item: TrashItem) => {
    setRestoring(item.id);
    try {
      const syncRoot = isElectron() ? await (window as any).electronAPI?.sync.getRoot() : "";
      const originalPath = syncRoot ? `${syncRoot}/${item.name}` : item.name;

      const result = await trashAPI.restore({ localPath: item.localPath, originalPath });
      if (result.success) {
        toast({ title: "Файл восстановлен", description: item.name, type: "success" });
        await loadItems();
      } else {
        toast({ title: "Ошибка восстановления", description: result.error, type: "error" });
      }
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, type: "error" });
    } finally {
      setRestoring(null);
    }
  }, [loadItems, toast]);

  const handlePurge = useCallback(async (item: TrashItem) => {
    try {
      await trashAPI.purge(item.id);
      toast({ title: "Файл удалён безвозвратно", type: "success" });
      await loadItems();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, type: "error" });
    }
  }, [loadItems, toast]);

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    try {
      for (const item of items) {
        await trashAPI.purge(item.id);
      }
      toast({ title: "Корзина очищена", type: "success" });
      setItems([]);
      setConfirmClear(false);
    } catch (err: any) {
      toast({ title: "Ошибка очистки", description: err.message, type: "error" });
    } finally {
      setClearing(false);
    }
  }, [items, toast]);

  const totalCount = items.length + cloudItems.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Шапка */}
      <div className="px-6 pt-5 pb-4 border-b border-border bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Корзина
              </h1>
              <p className="text-xs text-muted-foreground">
                {totalCount > 0
                  ? `${totalCount} объект${totalCount === 1 ? "" : totalCount < 5 ? "а" : "ов"} · Автоудаление через 30 дней`
                  : "Корзина пуста"
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadItems}
              className="p-1.5 rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {totalCount > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmClear(true)}
                className="gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Очистить корзину
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Содержимое */}
      <div className="flex-1 overflow-auto px-6 py-4 scrollbar-thin">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-foreground">Корзина пуста</p>
            <p className="text-xs text-muted-foreground mt-1">
              Удалённые файлы появятся здесь
            </p>
          </div>
        ) : (
          <div className="space-y-1 max-w-3xl">
            {/* Предупреждение о сроке хранения */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 mb-4">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning">
                Файлы в корзине автоматически удаляются через 30 дней после перемещения.
              </p>
            </div>

            {/* Список */}
            {items.map((item) => {
              const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - item.deletedAt) / 86400000));
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors group"
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Удалён {formatRelativeDate(new Date(item.deletedAt).toISOString())}
                      {daysLeft <= 7 && (
                        <span className="text-destructive ml-2">· Осталось {daysLeft} дн.</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRestore(item)}
                      disabled={restoring === item.id}
                      title="Восстановить"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
                    >
                      {restoring === item.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <RotateCcw className="w-3 h-3" />
                      }
                      Восстановить
                    </button>
                    <button
                      onClick={() => handlePurge(item)}
                      title="Удалить безвозвратно"
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Диалог очистки */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent onClose={() => setConfirmClear(false)}>
          <DialogHeader>
            <DialogTitle>Очистить корзину</DialogTitle>
            <DialogDescription>
              Будут безвозвратно удалены <strong>{totalCount}</strong> объект(ов).
              Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handleClearAll} disabled={clearing}>
              {clearing && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Очистить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
