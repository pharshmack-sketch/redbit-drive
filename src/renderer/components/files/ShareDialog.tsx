/**
 * Диалог «Поделиться».
 *
 * Показывает ссылку с доменом app.pxbt.io вместо прямого адреса S3.
 * generateShareUrl — синхронная функция, loading нужен только для
 * опционального сохранения статуса is_public.
 */

import React, { useState, useEffect, useCallback } from "react";
import { type UserFile, filesAPI } from "@/lib/api";
import { generateShareUrl, copyShareUrl, describeShareType, type ShareResult } from "@/lib/share";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Link, Copy, Check, Globe, Lock, ExternalLink, AlertCircle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ShareDialogProps {
  file: UserFile | null;
  onClose: () => void;
}

export default function ShareDialog({ file, onClose }: ShareDialogProps) {
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);
  const [copied,      setCopied]      = useState(false);
  const [makePublic,  setMakePublic]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const open = !!file;

  // generateShareUrl синхронная — вычисляем сразу при открытии
  useEffect(() => {
    if (!file) { setShareResult(null); setError(null); return; }
    setCopied(false);
    setError(null);
    setMakePublic(file.is_public);
    setShareResult(generateShareUrl(file));
  }, [file]);

  const handleCopy = useCallback(async () => {
    if (!shareResult) return;
    try {
      await copyShareUrl(shareResult.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      try {
        await navigator.clipboard.writeText(shareResult.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch { /* ignore */ }
    }
  }, [shareResult]);

  const handleOpenInBrowser = useCallback(() => {
    if (!shareResult) return;
    const api = (window as any).electronAPI;
    if (api?.shell?.openExternal) api.shell.openExternal(shareResult.url);
    else window.open(shareResult.url, "_blank");
  }, [shareResult]);

  // Переключение публичного доступа
  const handleTogglePublic = useCallback(async () => {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const next = !makePublic;
      await filesAPI.setPublic(file.id, next);
      setMakePublic(next);
      // Пересчитываем ссылку с обновлённым is_public
      setShareResult(generateShareUrl({ ...file, is_public: next }));
    } catch (err: any) {
      setError(err.message || "Не удалось изменить настройки доступа");
    } finally {
      setSaving(false);
    }
  }, [file, makePublic]);

  // Иконка статуса ссылки
  const typeIcon = shareResult?.type === "proxied"
    ? <Globe className="w-4 h-4 text-success" />
    : <ExternalLink className="w-4 h-4 text-muted-foreground" />;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-4 h-4" />
            Поделиться файлом
          </DialogTitle>
          {file && (
            <DialogDescription className="truncate">
              {file.file_name}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Тип ссылки */}
          {shareResult && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border",
              shareResult.type === "proxied"
                ? "bg-success/10 border-success/30 text-success"
                : "bg-muted/50 border-border text-muted-foreground"
            )}>
              {typeIcon}
              <span className="font-medium">{describeShareType(shareResult)}</span>
            </div>
          )}

          {/* URL + кнопка «Копировать» */}
          {shareResult && (
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareResult.url}
                className="flex-1 font-mono text-xs bg-muted/30"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                size="sm"
                variant={copied ? "success" : "default"}
                onClick={handleCopy}
                className="shrink-0 gap-1.5"
              >
                {copied
                  ? <><Check className="w-3.5 h-3.5" /> Скопировано</>
                  : <><Copy className="w-3.5 h-3.5" /> Копировать</>
                }
              </Button>
            </div>
          )}

          {/* Открыть в браузере */}
          {shareResult && (
            <button
              onClick={handleOpenInBrowser}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Открыть в браузере
            </button>
          )}

          {/* Ошибка */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Переключатель публичного доступа */}
          {file && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                {makePublic
                  ? <Globe className="w-4 h-4 text-primary" />
                  : <Lock className="w-4 h-4 text-muted-foreground" />
                }
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {makePublic ? "Публичный доступ" : "Приватный файл"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {makePublic
                      ? "Файл доступен всем по ссылке без авторизации"
                      : "Ссылка работает только для авторизованных"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleTogglePublic}
                disabled={saving}
                className={cn(
                  "relative w-10 h-5 rounded-full transition-colors shrink-0",
                  makePublic ? "bg-primary" : "bg-muted",
                  saving && "opacity-50 cursor-not-allowed"
                )}
              >
                {saving && (
                  <Loader2 className="absolute inset-0 m-auto w-3 h-3 animate-spin text-muted-foreground" />
                )}
                {!saving && (
                  <span className={cn(
                    "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    makePublic ? "translate-x-5" : "translate-x-0.5"
                  )} />
                )}
              </button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
