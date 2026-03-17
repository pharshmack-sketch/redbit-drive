/**
 * Sidebar v2.0
 *
 * п.2 ТЗ — логотип убран из заголовка сайдбара (перенесён в правую часть шапки).
 *           Заголовок сайдбара теперь drag-region для macOS (traffic lights корректны).
 *           На macOS кнопки управления окном отображаются в левом верхнем углу шапки,
 *           поэтому верх сайдбара должен быть drag-region.
 *
 * п.11 ТЗ — добавлен пункт "Корзина" в навигацию.
 */

import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import {
  HardDrive, Settings, ShieldCheck, LogOut,
  Sun, Moon, Monitor, ChevronLeft, ChevronRight,
  Info, Search, Trash2,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  adminOnly?: boolean;
  dividerBefore?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "drive",   label: "Мой диск",          icon: <HardDrive   className="w-4 h-4" />, path: "/drive" },
  { id: "search",  label: "Поиск",             icon: <Search      className="w-4 h-4" />, path: "/search" },
  { id: "trash",   label: "Корзина",           icon: <Trash2      className="w-4 h-4" />, path: "/trash" },
  { id: "settings",label: "Настройки",         icon: <Settings    className="w-4 h-4" />, path: "/settings", dividerBefore: true },
  { id: "about",   label: "О приложении",      icon: <Info        className="w-4 h-4" />, path: "/about" },
  { id: "admin",   label: "Администрирование", icon: <ShieldCheck className="w-4 h-4" />, path: "/admin", adminOnly: true, dividerBefore: true },
];

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { signOut, isAdmin, user } = useAuth();
  const { theme, setTheme } = useTheme();

  const visibleItems = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);

  const initials = (user?.user_metadata?.full_name as string | undefined)
    ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U";

  const themeIcon = theme === "dark" ? <Moon className="w-4 h-4" /> : theme === "light" ? <Sun className="w-4 h-4" /> : <Monitor className="w-4 h-4" />;

  const cycleTheme = () => {
    const order = ["light", "dark", "system"] as const;
    setTheme(order[(order.indexOf(theme as any) + 1) % 3]);
  };

  return (
    <aside className={cn(
      "flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0 relative",
      collapsed ? "w-14" : "w-56"
    )}>
      {/*
       * Bug 2 fix: заголовок сайдбара — только drag-region, никакого текста.
       *
       * Проблема: текст «Навигация» перекрывался кнопками управления окном
       * (traffic lights) на macOS при titleBarStyle=hiddenInset.
       *
       * Решение: div полностью пустой, служит только зоной перетаскивания.
       * Высота h-12 совпадает с высотой шапки (header), поэтому drag работает
       * единой полосой вверху окна: сайдбар + header.
       */}
      <div
        className="h-12 border-b border-sidebar-border shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        aria-hidden="true"
      />

      {/* Навигация */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-thin space-y-0.5">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === "/drive" && location.pathname === "/");
          return (
            <React.Fragment key={item.id}>
              {item.dividerBefore && (
                <div className="my-1.5 border-t border-sidebar-border/50" />
              )}
              <button
                onClick={() => navigate(item.path)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors group",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <span className={cn(
                  "shrink-0",
                  isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground",
                  // Корзина — красноватая иконка
                  item.id === "trash" && !isActive ? "text-destructive/60 group-hover:text-destructive" : ""
                )}>
                  {item.icon}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Футер */}
      <div className="px-2 py-3 border-t border-sidebar-border space-y-0.5">
        {/* Пользователь */}
        {!collapsed ? (
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {(user?.user_metadata?.full_name as string | undefined) || user?.email}
              </p>
              {isAdmin && <p className="text-[10px] text-muted-foreground">Администратор</p>}
            </div>
          </button>
        ) : (
          <button onClick={() => navigate("/settings")} title="Профиль"
            className="w-full flex justify-center p-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold">{initials}</div>
          </button>
        )}

        {/* Тема */}
        <button onClick={cycleTheme}
          className={cn("w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors text-sidebar-foreground/70", collapsed ? "justify-center" : "")}>
          {themeIcon}
          {!collapsed && <span className="text-sm">{theme === "system" ? "Системная" : theme === "dark" ? "Тёмная" : "Светлая"}</span>}
        </button>

        {/* Выход */}
        <button onClick={signOut}
          className={cn("w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-sm text-sidebar-foreground/70", collapsed ? "justify-center" : "")}>
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>

      {/* Кнопка свёртывания */}
      <button onClick={onToggle}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shadow-sm z-10">
        {collapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground" /> : <ChevronLeft className="w-3 h-3 text-muted-foreground" />}
      </button>
    </aside>
  );
}
