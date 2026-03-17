/**
 * SettingsPage v2.0
 *
 * Разделы:
 * - Профиль
 * - Внешний вид (тема)
 * - п.4 ТЗ — Синхронизация (папка, вкл/выкл, пауза)
 * - п.8 ТЗ — Шифрование AES-256 (вкл/выкл, задать пароль)
 * - п.6 ТЗ — Горячие клавиши (таблица)
 * - О приложении
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/api";
import { appInfo, syncAPI, config, isElectron, getPlatform } from "@/lib/electron";
import { setSessionPassword, getSessionPassword, clearSessionPassword, hasSessionPassword } from "@/lib/encryption";
import { getInitials } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Sun, Moon, Monitor, User, Shield, Info, Loader2,
  FolderOpen, RefreshCw, Lock, Unlock, Eye, EyeOff,
  Keyboard, Cloud, CloudOff, Pause, Play, HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // Профиль
  const [fullName, setFullName] = useState((user?.user_metadata?.full_name as string | undefined) || "");
  const [saving, setSaving] = useState(false);

  // Приложение
  const [appInfoData, setAppInfoData] = useState<any>(null);

  // п.4 Синхронизация
  const [syncRoot, setSyncRoot] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncPaused, setSyncPaused] = useState(false);
  const [selectingRoot, setSelectingRoot] = useState(false);

  // п.8 Шифрование
  const [encEnabled, setEncEnabled] = useState(false);
  const [encPassword, setEncPassword] = useState("");
  const [encConfirm, setEncConfirm] = useState("");
  const [showEncPwd, setShowEncPwd] = useState(false);
  const [hasEncPassword, setHasEncPassword] = useState(false);

  useEffect(() => {
    (async () => {
      if (isElectron()) {
        const info = await appInfo.get();
        setAppInfoData(info);
        setSyncRoot(info.syncRoot || "");
        const cfg = await config.getAll();
        setSyncEnabled(!!cfg.syncEnabled);
        setSyncPaused(!!cfg.syncPaused);
        setEncEnabled(!!cfg.encryptionEnabled);
      }
      setHasEncPassword(hasSessionPassword());
    })();
  }, []);

  // Профиль
  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
      if (error) throw error;
      toast({ title: "Профиль обновлён", type: "success" });
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, type: "error" });
    } finally { setSaving(false); }
  };

  // п.4 — Выбор папки синхронизации
  const handleSelectRoot = useCallback(async () => {
    setSelectingRoot(true);
    try {
      const newPath = await syncAPI.selectRoot();
      if (newPath) {
        setSyncRoot(newPath);
        toast({ title: "Папка синхронизации изменена", description: newPath, type: "success" });
      }
    } finally { setSelectingRoot(false); }
  }, [toast]);

  // п.4 — Вкл/выкл синхронизации
  const handleToggleSync = useCallback(async () => {
    const newState = !syncEnabled;
    await syncAPI.toggle(newState);
    setSyncEnabled(newState);
    toast({ title: newState ? "Синхронизация включена" : "Синхронизация остановлена", type: "success" });
  }, [syncEnabled, toast]);

  // п.4 — Пауза
  const handlePauseToggle = useCallback(async () => {
    const paused = await syncAPI.pauseToggle();
    setSyncPaused(paused);
  }, []);

  // п.8 — Сохранить пароль шифрования
  const handleSaveEncPassword = useCallback(() => {
    if (encPassword.length < 8) {
      toast({ title: "Пароль должен быть не менее 8 символов", type: "error" });
      return;
    }
    if (encPassword !== encConfirm) {
      toast({ title: "Пароли не совпадают", type: "error" });
      return;
    }
    setSessionPassword(encPassword);
    setHasEncPassword(true);
    setEncPassword("");
    setEncConfirm("");
    toast({ title: "Пароль шифрования установлен", description: "Файлы будут шифроваться перед загрузкой", type: "success" });
  }, [encPassword, encConfirm, toast]);

  // п.8 — Вкл/выкл шифрования
  const handleToggleEncryption = useCallback(async (enabled: boolean) => {
    if (enabled && !hasSessionPassword()) {
      toast({ title: "Сначала задайте пароль шифрования", type: "error" });
      return;
    }
    await config.set("encryptionEnabled", enabled);
    setEncEnabled(enabled);
    if (!enabled) clearSessionPassword();
    toast({ title: enabled ? "Шифрование включено" : "Шифрование отключено", type: "success" });
  }, [hasSessionPassword, toast]);

  const themeOptions = [
    { value: "light", label: "Светлая", icon: <Sun className="w-4 h-4" /> },
    { value: "dark",  label: "Тёмная",  icon: <Moon className="w-4 h-4" /> },
    { value: "system",label: "Системная",icon: <Monitor className="w-4 h-4" /> },
  ] as const;

  const isMac = getPlatform() === "darwin";

  // Горячие клавиши
  const shortcuts = [
    { keys: ["F2"],                          desc: "Переименовать выделенный файл" },
    { keys: ["Delete"],                      desc: "Удалить в корзину" },
    { keys: [isMac ? "⌘" : "Ctrl", "O"],    desc: "Загрузить файлы" },
    { keys: [isMac ? "⌘" : "Ctrl", "Shift","N"], desc: "Создать папку" },
    { keys: [isMac ? "⌘" : "Ctrl", "K"],    desc: "Поиск файлов" },
    { keys: [isMac ? "⌘" : "Ctrl", "D"],    desc: "Мой диск" },
    { keys: [isMac ? "⌘" : "Ctrl", "Shift","T"], desc: "Корзина" },
    { keys: [isMac ? "⌘" : "Ctrl", ","],    desc: "Настройки" },
    { keys: [isMac ? "⌘" : "Ctrl", "1/2/3"], desc: "Режим просмотра (список/сетка)" },
    { keys: [isMac ? "⌘" : "Ctrl", "Shift", "Space"], desc: "Показать/скрыть окно (глобальный)" },
    { keys: [isMac ? "⌘" : "Ctrl", "Shift", "F"], desc: "Открыть поиск (глобальный)" },
  ];

  return (
    <div className="h-full overflow-auto px-6 py-6 scrollbar-thin">
      <h1 className="text-xl font-bold text-foreground mb-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        Настройки
      </h1>

      <div className="max-w-2xl space-y-5">

        {/* Профиль */}
        <Section icon={<User className="w-4 h-4" />} title="Профиль">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-semibold">
              {getInitials((user?.user_metadata?.full_name as string | undefined) || null)}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{(user?.user_metadata?.full_name as string | undefined) || "—"}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Отображаемое имя" className="flex-1" />
            <Button onClick={handleSaveProfile} disabled={saving} size="sm">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Сохранить
            </Button>
          </div>
        </Section>

        {/* Внешний вид */}
        <Section icon={<Sun className="w-4 h-4" />} title="Внешний вид">
          <p className="text-sm font-medium text-foreground mb-3">Тема оформления</p>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map((opt) => (
              <button key={opt.value} onClick={() => setTheme(opt.value)}
                className={cn("flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors",
                  theme === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30 text-muted-foreground hover:text-foreground")}>
                {opt.icon}
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* п.4 — Синхронизация */}
        {isElectron() && (
          <Section icon={<HardDrive className="w-4 h-4" />} title="Синхронизация">
            {/* Папка */}
            <div className="space-y-2 mb-4">
              <label className="text-sm font-medium text-foreground">Локальная папка</label>
              <div className="flex gap-2">
                <Input
                  value={syncRoot}
                  readOnly
                  placeholder="Не выбрана"
                  className="flex-1 text-sm font-mono"
                />
                <Button variant="outline" size="sm" onClick={handleSelectRoot} disabled={selectingRoot}>
                  {selectingRoot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                  Изменить
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Файлы в этой папке автоматически синхронизируются с облаком
              </p>
            </div>

            {/* Вкл/выкл */}
            <div className="flex items-center justify-between py-2 border-t border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Автосинхронизация</p>
                <p className="text-xs text-muted-foreground">Отслеживать изменения в локальной папке</p>
              </div>
              <button
                onClick={handleToggleSync}
                className={cn("relative w-10 h-5 rounded-full transition-colors",
                  syncEnabled ? "bg-primary" : "bg-muted")}
              >
                <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                  syncEnabled ? "translate-x-5" : "translate-x-0.5")} />
              </button>
            </div>

            {/* Пауза */}
            {syncEnabled && (
              <div className="flex items-center justify-between py-2 border-t border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">Статус</p>
                  <p className="text-xs text-muted-foreground">{syncPaused ? "На паузе" : "Активна"}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handlePauseToggle}>
                  {syncPaused ? <><Play className="w-3.5 h-3.5 mr-1" /> Возобновить</> : <><Pause className="w-3.5 h-3.5 mr-1" /> Приостановить</>}
                </Button>
              </div>
            )}
          </Section>
        )}

        {/* п.8 — Шифрование */}
        <Section icon={<Lock className="w-4 h-4" />} title="Клиентское шифрование (AES-256)">
          <p className="text-xs text-muted-foreground mb-4">
            При включении файлы шифруются на вашем устройстве перед отправкой на сервер.
            Ключ не покидает устройство. Без пароля файлы не будут доступны даже администратору.
          </p>

          {/* Вкл/выкл */}
          <div className="flex items-center justify-between py-2 border-t border-border mb-3">
            <div>
              <p className="text-sm font-medium text-foreground">Шифрование файлов</p>
              <p className="text-xs text-muted-foreground">{encEnabled ? "Включено (AES-256-GCM)" : "Отключено"}</p>
            </div>
            <button
              onClick={() => handleToggleEncryption(!encEnabled)}
              className={cn("relative w-10 h-5 rounded-full transition-colors",
                encEnabled ? "bg-primary" : "bg-muted")}
            >
              <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                encEnabled ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          </div>

          {/* Статус ключа */}
          <div className={cn("flex items-center gap-2 p-2.5 rounded-lg text-xs mb-3",
            hasEncPassword ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
            {hasEncPassword ? <Lock className="w-3.5 h-3.5 shrink-0" /> : <Unlock className="w-3.5 h-3.5 shrink-0" />}
            {hasEncPassword ? "Пароль шифрования установлен в текущей сессии" : "Пароль не задан. Файлы не будут зашифрованы."}
          </div>

          {/* Задать пароль */}
          <div className="space-y-2">
            <div className="relative">
              <Input
                type={showEncPwd ? "text" : "password"}
                placeholder="Пароль шифрования (мин. 8 символов)"
                value={encPassword}
                onChange={(e) => setEncPassword(e.target.value)}
                className="pr-10"
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowEncPwd(!showEncPwd)}>
                {showEncPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Input
              type={showEncPwd ? "text" : "password"}
              placeholder="Повторите пароль"
              value={encConfirm}
              onChange={(e) => setEncConfirm(e.target.value)}
            />
            <Button
              size="sm"
              onClick={handleSaveEncPassword}
              disabled={encPassword.length < 8 || encPassword !== encConfirm}
            >
              <Lock className="w-3.5 h-3.5 mr-1" />
              {hasEncPassword ? "Изменить пароль" : "Установить пароль"}
            </Button>
          </div>

          <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground">
            ⚠ <strong>Важно:</strong> пароль хранится только в памяти текущей сессии.
            При каждом запуске приложения нужно вводить пароль повторно.
            Если пароль утерян — зашифрованные файлы не восстановить.
          </div>
        </Section>

        {/* п.6 — Горячие клавиши */}
        <Section icon={<Keyboard className="w-4 h-4" />} title="Горячие клавиши">
          <div className="space-y-1">
            {shortcuts.map((s, i) => (
              <div key={i} className={cn("flex items-center justify-between py-1.5", i < shortcuts.length - 1 ? "border-b border-border/50" : "")}>
                <span className="text-sm text-muted-foreground">{s.desc}</span>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  {s.keys.map((k, ki) => (
                    <React.Fragment key={ki}>
                      {ki > 0 && <span className="text-muted-foreground/50 text-xs">+</span>}
                      <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[11px] font-mono text-foreground">{k}</kbd>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* О приложении */}
        <Section icon={<Info className="w-4 h-4" />} title="О приложении">
          <div className="space-y-1.5">
            {appInfoData && [
              ["Версия",    appInfoData.version],
              ["Платформа", `${appInfoData.platform} (${appInfoData.arch})`],
              ["Режим",     appInfoData.isDev ? "Разработка" : "Production"],
              ["Данные",    appInfoData.userDataPath],
            ].map(([l, v]) => (
              <div key={l} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{l}</span>
                <span className="text-sm font-medium text-foreground truncate max-w-xs text-right">{v}</span>
              </div>
            ))}
            {!appInfoData && <p className="text-sm text-muted-foreground">RedBit Drive v1.0.0</p>}
          </div>
        </Section>

        {/* Аккаунт */}
        <Section icon={<Shield className="w-4 h-4" />} title="Аккаунт">
          <Button variant="destructive" onClick={signOut}>Выйти из аккаунта</Button>
        </Section>

      </div>
    </div>
  );
}

// ── Вспомогательный компонент секции ─────────────────────────────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
        {icon}{title}
      </h2>
      {children}
    </div>
  );
}
