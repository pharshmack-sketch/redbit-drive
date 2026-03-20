/**
 * AuthPage — экран входа в систему.
 * Включает маскота RedBit, форму логина, переключатель темы.
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { Eye, EyeOff, Sun, Moon, Monitor, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import mascotUrl from "@assets/icons/mascot_original.png";

export default function AuthPage() {
  const { signIn } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Восстанавливаем сохранённый email
  useEffect(() => {
    const saved = localStorage.getItem("remembered_email");
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Заполните все поля", type: "error" });
      return;
    }

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      toast({ title: "Ошибка входа", description: error, type: "error" });
    } else {
      if (rememberMe) {
        localStorage.setItem("remembered_email", email);
      } else {
        localStorage.removeItem("remembered_email");
      }
    }
  };

  const themeOptions: { value: "light" | "dark" | "system"; icon: React.ReactNode; label: string }[] = [
    { value: "light", icon: <Sun className="w-3.5 h-3.5" />, label: "Светлая" },
    { value: "system", icon: <Monitor className="w-3.5 h-3.5" />, label: "Системная" },
    { value: "dark", icon: <Moon className="w-3.5 h-3.5" />, label: "Тёмная" },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Левая панель — маскот и брендинг ─────────────────────────────── */}
      <div className="hidden lg:flex w-1/2 relative bg-gradient-to-br from-primary/10 via-primary/5 to-background flex-col items-center justify-center p-12 overflow-hidden">
        {/* Декоративный фон */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 rounded-full bg-destructive/10 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center space-y-6 max-w-sm">
          {/* Маскот — реальный PNG Redbit */}
          <div className="w-48 h-48 drop-shadow-xl animate-fade-in">
            <img
              src={mascotUrl}
              alt="Redbit"
              className="w-full h-full object-contain"
              draggable={false}
            />
          </div>

          {/* Лого и название */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <div className="w-6 h-6 rounded bg-destructive" />
              <span
                className="text-3xl font-bold tracking-tight"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontStyle: "italic" }}
              >
                Redbit
              </span>
            </div>
            <h2
              className="text-2xl font-bold text-foreground"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Drive
            </h2>
          </div>

          <p className="text-muted-foreground text-base leading-relaxed">
            Безопасное облачное хранилище для&nbsp;ваших файлов, генераций и&nbsp;материалов проектов
          </p>

          {/* Фичи */}
          <div className="grid grid-cols-2 gap-3 w-full mt-4">
            {[
              { icon: "📁", text: "Файлы и папки" },
              { icon: "⬆️", text: "Загрузка S3" },
              { icon: "🔒", text: "Безопасность" },
              { icon: "🌐", text: "Общий доступ" },
            ].map((f) => (
              <div
                key={f.text}
                className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm text-foreground"
              >
                <span>{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Правая панель — форма входа ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
        {/* Переключатель темы */}
        <div className="absolute top-4 right-4 flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              title={opt.label}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                theme === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {opt.icon}
            </button>
          ))}
        </div>

        {/* Мобильный логотип */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <img src={mascotUrl} alt="Redbit" className="w-10 h-10 object-contain" draggable={false} />
          <div>
            <span
              className="text-2xl font-bold"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontStyle: "italic" }}
            >
              Redbit Drive
            </span>
          </div>
        </div>

        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <h1
              className="text-2xl font-bold text-foreground"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Войти в аккаунт
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Введите данные для доступа к хранилищу
            </p>
          </div>

          {/* Карточка формы */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-elevated">
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Пароль
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Минимум 6 символов"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Запомнить меня
                </label>
              </div>

              {/* Submit */}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Вход...
                  </div>
                ) : (
                  "Войти"
                )}
              </Button>
            </form>

            {/* Мок-подсказка */}
            {import.meta.env.VITE_USE_MOCK === "true" && (
              <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground text-center">
                  🧪 <strong>Тестовый режим</strong>: любой email + пароль{" "}
                  <code className="font-mono bg-muted px-1 rounded">demo</code>
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            Система работает в соответствии с&nbsp;политикой конфиденциальности
          </p>

          {/* App info */}
          <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-muted-foreground/60">
            <HardDrive className="w-3 h-3" />
            <span>RedBit Drive v1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
