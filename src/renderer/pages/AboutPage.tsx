/**
 * AboutPage — страница «О приложении».
 *
 * Иконка: icon.svg — красный квадрат с "R", единый стиль с веб-приложением.
 */

import React from "react";
import { ExternalLink } from "lucide-react";
import { shell, appInfo, isElectron } from "@/lib/electron";

import iconUrl from "@assets/icons/icon.svg";

const FEATURES = [
  { icon: "📁", label: "Управление файлами и папками" },
  { icon: "⬆️", label: "S3-загрузка с прогрессом (multipart)" },
  { icon: "⬇️", label: "Нативное скачивание на диск" },
  { icon: "🔒", label: "Безопасное хранение токенов (keytar)" },
  { icon: "🔐", label: "Клиентское шифрование AES-256-GCM" },
  { icon: "🌓", label: "Тёмная и светлая темы" },
  { icon: "🗑️", label: "Корзина с автоудалением через 30 дней" },
  { icon: "🔄", label: "Синхронизация в реальном времени" },
  { icon: "🛡️", label: "Административная панель" },
];

export default function AboutPage() {
  const [version, setVersion] = React.useState("1.0.0");

  React.useEffect(() => {
    if (isElectron()) {
      appInfo.get().then((info) => setVersion(info.version)).catch(() => {});
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8 text-center overflow-auto scrollbar-thin">

      {/* Иконка Redbit — красный квадрат с "R" */}
      <div className="mb-6">
        <img
          src={iconUrl}
          alt="Redbit"
          className="w-24 h-24 object-contain rounded-2xl"
          draggable={false}
        />
      </div>

      {/* Название */}
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-5 h-5 rounded bg-destructive shrink-0" />
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontStyle: "italic" }}
        >
          Redbit Drive
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">Версия {version}</p>

      <div className="max-w-sm w-full space-y-5">

        <p className="text-sm text-muted-foreground leading-relaxed">
          Десктопный S3-клиент для macOS и Windows.
          Безопасное хранение файлов, синхронизация
          и управление облачным хранилищем.
        </p>

        {/* Возможности */}
        <div className="bg-card border border-border rounded-xl p-4 text-left space-y-2">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex items-center gap-2.5 text-sm text-foreground">
              <span className="w-5 text-center shrink-0">{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => shell.openExternal("https://pxbt.io")}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            pxbt.io
          </button>
        </div>

        <p className="text-xs text-muted-foreground/60">
          © 2025 RedBit Team. Все права защищены.
        </p>
      </div>
    </div>
  );
}
