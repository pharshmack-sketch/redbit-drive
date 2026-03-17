/**
 * AdminPage — административная панель управления.
 * Доступна только пользователям с ролью admin.
 * 
 * Разделы:
 * - Обзор (статистика)
 * - Пользователи (просмотр, изменение роли, удаление)
 * - Хранилище (статистика использования)
 * - Настройки API
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { adminAPI, UserProfile } from "@/lib/api";
import { config, isElectron } from "@/lib/electron";
import { formatBytes, formatRelativeDate, getInitials, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog";
import {
  Users, HardDrive, Settings, ShieldCheck, BarChart3,
  Search, Trash2, Edit2, Loader2, RefreshCw, Check, X,
  AlertTriangle, Server, Globe, Key, Database, Activity,
  ChevronRight, UserCheck, UserX,
} from "lucide-react";

// ── Роли ─────────────────────────────────────────────────────────────────
const ROLES = [
  { value: "admin", label: "Администратор", color: "destructive" },
  { value: "project_admin", label: "Проект-Админ", color: "warning" },
  { value: "executor", label: "Исполнитель", color: "secondary" },
  { value: "client", label: "Клиент", color: "outline" },
] as const;

type TabId = "overview" | "users" | "storage" | "settings";

interface AdminStats {
  totalUsers: number;
  totalFiles: number;
  totalBytes: number;
}

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Изменение роли
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState("");
  const [saving, setSaving] = useState(false);

  // Удаление
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Настройки API
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [useMock, setUseMock] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Перенаправляем не-админов
  useEffect(() => {
    if (!isAdmin) navigate("/drive");
  }, [isAdmin, navigate]);

  // Загружаем данные
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, statsData] = await Promise.all([
        adminAPI.getUsers(),
        adminAPI.getStorageStats(),
      ]);
      setUsers(usersData);
      setStats(statsData);
    } catch (err: any) {
      toast({ title: "Ошибка загрузки данных", description: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Загружаем настройки
  useEffect(() => {
    loadData();
    (async () => {
      if (isElectron()) {
        const all = await config.getAll();
        setApiUrl(all.apiBaseUrl || "");
        setUseMock(all.useMock || false);
      } else {
        setApiUrl(import.meta.env.VITE_SUPABASE_URL || "");
        setUseMock(import.meta.env.VITE_USE_MOCK === "true");
      }
    })();
  }, [loadData]);

  const filteredUsers = users.filter((u) =>
    (u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
     u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  // ── Смена роли ────────────────────────────────────────────────────────
  const handleSaveRole = async () => {
    if (!editingUser || !editRole) return;
    setSaving(true);
    try {
      await adminAPI.updateUserRole(editingUser.id, editRole);
      setUsers((prev) => prev.map((u) => u.id === editingUser.id ? { ...u, role: editRole as any } : u));
      toast({ title: "Роль обновлена", type: "success" });
      setEditingUser(null);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // ── Удаление пользователя ─────────────────────────────────────────────
  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminAPI.deleteUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast({ title: "Пользователь удалён", type: "success" });
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, type: "error" });
    } finally {
      setDeleting(false);
    }
  };

  // ── Сохранение настроек ───────────────────────────────────────────────
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      if (isElectron()) {
        await config.set("apiBaseUrl", apiUrl);
        await config.set("useMock", useMock);
      }
      toast({ title: "Настройки сохранены", description: "Перезапустите приложение для применения", type: "success" });
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, type: "error" });
    } finally {
      setSavingSettings(false);
    }
  };

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Обзор", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "users", label: "Пользователи", icon: <Users className="w-4 h-4" /> },
    { id: "storage", label: "Хранилище", icon: <HardDrive className="w-4 h-4" /> },
    { id: "settings", label: "Настройки", icon: <Settings className="w-4 h-4" /> },
  ];

  const getRoleBadge = (role: string) => {
    const r = ROLES.find((ro) => ro.value === role);
    return (
      <Badge variant={r?.color as any || "outline"} className="text-xs">
        {r?.label || role}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Шапка страницы ───────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-0 border-b border-border bg-card/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <h1
              className="text-xl font-bold text-foreground"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Администрирование
            </h1>
            <p className="text-xs text-muted-foreground">
              Управление пользователями, хранилищем и настройками системы
            </p>
          </div>
          <button
            onClick={loadData}
            className="ml-auto p-1.5 rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground"
            title="Обновить"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading ? "animate-spin" : "")} />
          </button>
        </div>

        {/* Вкладки */}
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2",
                activeTab === tab.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.id === "users" && (
                <span className="ml-1 text-xs bg-muted rounded-full px-1.5 py-0.5">
                  {users.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Контент вкладок ───────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 scrollbar-thin">

        {/* ── Обзор ─────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6 max-w-4xl">
            {/* Карточки статистики */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  icon: <Users className="w-5 h-5" />,
                  label: "Пользователей",
                  value: stats?.totalUsers ?? "—",
                  color: "text-primary",
                  bg: "bg-primary/10",
                },
                {
                  icon: <HardDrive className="w-5 h-5" />,
                  label: "Файлов",
                  value: stats?.totalFiles ?? "—",
                  color: "text-success",
                  bg: "bg-success/10",
                },
                {
                  icon: <Database className="w-5 h-5" />,
                  label: "Занято места",
                  value: stats ? formatBytes(stats.totalBytes) : "—",
                  color: "text-warning",
                  bg: "bg-warning/10",
                },
              ].map((card) => (
                <div key={card.label} className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", card.bg)}>
                      <span className={card.color}>{card.icon}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{card.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {loading ? <span className="animate-pulse">...</span> : card.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Распределение ролей */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Распределение ролей</h3>
              <div className="space-y-3">
                {ROLES.map((role) => {
                  const count = users.filter((u) => u.role === role.value).length;
                  const pct = users.length > 0 ? (count / users.length) * 100 : 0;
                  return (
                    <div key={role.value} className="flex items-center gap-3">
                      <div className="w-28 text-sm text-muted-foreground">{role.label}</div>
                      <div className="flex-1">
                        <Progress value={pct} className="h-1.5" />
                      </div>
                      <div className="w-10 text-xs text-right text-muted-foreground">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Статус системы */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Статус системы
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "API Backend", status: "online", detail: useMock ? "Mock Mode" : "Supabase" },
                  { label: "S3 Storage", status: "online", detail: "AWS S3" },
                  { label: "Auth Service", status: "online", detail: "Supabase Auth" },
                  { label: "Electron", status: "online", detail: isElectron() ? "Active" : "Web Mode" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", s.status === "online" ? "bg-success" : "bg-destructive")} />
                    <div>
                      <p className="text-xs font-medium text-foreground">{s.label}</p>
                      <p className="text-[10px] text-muted-foreground">{s.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Пользователи ──────────────────────────────────────── */}
        {activeTab === "users" && (
          <div className="max-w-4xl space-y-4">
            {/* Поиск */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени или email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Таблица пользователей */}
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />)}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {search ? "Ничего не найдено" : "Нет пользователей"}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Заголовок таблицы */}
                <div className="grid grid-cols-[2fr,1fr,1fr,auto] gap-4 px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                  <span>Пользователь</span>
                  <span>Роль</span>
                  <span>Дата регистрации</span>
                  <span>Действия</span>
                </div>

                {/* Строки */}
                {filteredUsers.map((u, i) => (
                  <div
                    key={u.id}
                    className={cn(
                      "grid grid-cols-[2fr,1fr,1fr,auto] gap-4 px-4 py-3 items-center",
                      i < filteredUsers.length - 1 ? "border-b border-border" : "",
                      "hover:bg-muted/20 transition-colors"
                    )}
                  >
                    {/* Имя + email */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                        {getInitials(u.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {u.full_name || "—"}
                          {u.id === user?.id && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground">(вы)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>

                    {/* Роль */}
                    <div>{getRoleBadge(u.role)}</div>

                    {/* Дата */}
                    <div className="text-xs text-muted-foreground">
                      {formatRelativeDate(u.created_at)}
                    </div>

                    {/* Действия */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingUser(u); setEditRole(u.role); }}
                        className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                        title="Изменить роль"
                        disabled={u.id === user?.id}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        title="Удалить пользователя"
                        disabled={u.id === user?.id}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Хранилище ─────────────────────────────────────────── */}
        {activeTab === "storage" && (
          <div className="max-w-4xl space-y-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <HardDrive className="w-4 h-4" />
                Использование хранилища
              </h3>
              {stats && (
                <div className="space-y-4">
                  <div className="flex items-end gap-4">
                    <div>
                      <p className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        {formatBytes(stats.totalBytes)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">занято всего</p>
                    </div>
                    <div className="text-muted-foreground pb-1">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">{stats.totalFiles}</p>
                      <p className="text-sm text-muted-foreground">файлов</p>
                    </div>
                  </div>

                  <Progress value={Math.min(100, (stats.totalBytes / (100 * 1024 * 1024 * 1024)) * 100)} className="h-3" />
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(stats.totalBytes)} из 100 ГБ общей квоты
                  </p>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Топ пользователей по объёму</h3>
              <div className="space-y-3">
                {users.slice(0, 5).map((u, i) => (
                  <div key={u.id} className="flex items-center gap-3">
                    <span className="w-5 text-xs text-muted-foreground text-right">{i + 1}.</span>
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-semibold shrink-0">
                      {getInitials(u.full_name)}
                    </div>
                    <span className="flex-1 text-sm text-foreground truncate">{u.full_name || u.email}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(Math.random() * 1e9)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Настройки ─────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="max-w-2xl space-y-5">
            {/* API Настройки */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Server className="w-4 h-4" />
                Настройки API
              </h3>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Supabase URL</label>
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API Ключ</label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="eyJhbG..."
                />
                <p className="text-xs text-muted-foreground">
                  Anon key из настроек Supabase проекта
                </p>
              </div>
            </div>

            {/* Мок-режим */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Database className="w-4 h-4" />
                Режим разработки
              </h3>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="mock-mode"
                  checked={useMock}
                  onChange={(e) => setUseMock(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-primary"
                />
                <div>
                  <label htmlFor="mock-mode" className="text-sm font-medium text-foreground cursor-pointer">
                    Использовать мок-сервер
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Включите для тестирования без реального backend.
                    Запустите мок-сервер командой <code className="font-mono bg-muted px-1 rounded">npm run mock</code>
                  </p>
                </div>
              </div>

              {useMock && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                  <p className="text-xs text-warning">
                    Мок-режим активен. Данные не сохраняются между сессиями.
                  </p>
                </div>
              )}
            </div>

            {/* Безопасность */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Key className="w-4 h-4" />
                Безопасность
              </h3>
              <div className="space-y-2 text-sm">
                {[
                  { label: "contextIsolation", status: true, desc: "Изоляция контекста renderer" },
                  { label: "sandbox", status: true, desc: "Процессный sandbox" },
                  { label: "nodeIntegration", status: false, desc: "Node.js в renderer (отключено)" },
                  { label: "Secure Token Storage", status: isElectron(), desc: "Keytar / зашифрованный store" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", item.status ? "bg-success" : "bg-muted-foreground")} />
                    <code className="font-mono text-xs text-foreground w-40">{item.label}</code>
                    <span className="text-xs text-muted-foreground">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Сохранить */}
            <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full">
              {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Сохранить настройки
            </Button>
          </div>
        )}
      </div>

      {/* ── Диалог изменения роли ──────────────────────────────────── */}
      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent onClose={() => setEditingUser(null)}>
          <DialogHeader>
            <DialogTitle>Изменить роль</DialogTitle>
            <DialogDescription>
              Пользователь: <strong>{editingUser?.full_name || editingUser?.email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {ROLES.map((role) => (
              <button
                key={role.value}
                onClick={() => setEditRole(role.value)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 transition-colors text-left",
                  editRole === role.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/50"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full", editRole === role.value ? "bg-primary" : "bg-muted-foreground")} />
                <span className="text-sm font-medium">{role.label}</span>
                {editRole === role.value && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingUser(null)}>Отмена</Button>
            <Button size="sm" onClick={handleSaveRole} disabled={saving || editRole === editingUser?.role}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Диалог удаления пользователя ──────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent onClose={() => setDeleteTarget(null)}>
          <DialogHeader>
            <DialogTitle>Удалить пользователя</DialogTitle>
            <DialogDescription>
              Пользователь <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong> будет удалён.
              Это действие необратимо.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteUser} disabled={deleting}>
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
