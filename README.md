# RedBit Drive — Десктопный S3-клиент

Кроссплатформенное десктопное приложение для macOS и Windows, клиент для S3-совместимого облачного хранилища.
Стилистически повторяет веб-версию [Redbit](https://pxbt.io).

---

## Скачать

| Платформа | Файл | Размер |
|-----------|-------|--------|
| **macOS** (Apple Silicon) | [RedBit.Drive-1.0.2-arm64.dmg](https://github.com/pharshmack-sketch/redbit-drive/releases/download/v1.0.2/RedBit.Drive-1.0.2-arm64.dmg) | 102 MB |
| **macOS** (Intel) | [RedBit.Drive-1.0.2-x64.dmg](https://github.com/pharshmack-sketch/redbit-drive/releases/download/v1.0.2/RedBit.Drive-1.0.2-x64.dmg) | 107 MB |
| **Windows** (Установщик) | [RedBit.Drive.Setup.1.0.2.exe](https://github.com/pharshmack-sketch/redbit-drive/releases/download/v1.0.2/RedBit.Drive.Setup.1.0.2.exe) | 80 MB |
| **Windows** (Portable) | [RedBit.Drive.1.0.2-portable.exe](https://github.com/pharshmack-sketch/redbit-drive/releases/download/v1.0.2/RedBit.Drive.1.0.2-portable.exe) | 80 MB |

> Все файлы доступны на странице [Releases](https://github.com/pharshmack-sketch/redbit-drive/releases/tag/v1.0.2).

## Стек технологий

| Слой | Технологии |
|------|-----------|
| Фреймворк | **Electron 31** |
| UI | **React 18** + **TypeScript** |
| Стилизация | **Tailwind CSS v3** (токены — точная копия веб-версии) |
| Backend API | **Supabase** (Auth + Storage + Edge Functions) |
| S3 Storage | AWS S3 через presigned URLs |
| Сборка | **Vite 5** (renderer) |
| Дистрибуция | **electron-builder** (macOS DMG/ZIP, Windows NSIS/Portable) |
| Безопасность | keytar (secure token storage), contextIsolation, sandbox |
| Тестирование | Встроенный мок-сервер (Node.js HTTP) |

---

## Структура проекта

```
desktop-app/
├── src/
│   ├── main/
│   │   ├── index.js          # Главный процесс Electron
│   │   └── preload.js        # Preload script (IPC bridge)
│   └── renderer/
│       ├── index.html        # Точка входа HTML
│       ├── main.tsx          # React entry point
│       ├── App.tsx           # Роутинг приложения
│       ├── index.css         # CSS переменные (дизайн-токены)
│       ├── lib/
│       │   ├── api.ts        # API клиент (Supabase + мок)
│       │   ├── electron.ts   # Типизированный IPC bridge
│       │   └── utils.ts      # Утилиты
│       ├── contexts/
│       │   ├── AuthContext.tsx   # Управление аутентификацией
│       │   └── ThemeContext.tsx  # Управление темой
│       ├── components/
│       │   ├── ui/           # Базовые UI компоненты
│       │   ├── files/        # Компоненты файлового менеджера
│       │   ├── Sidebar.tsx   # Боковая навигация
│       │   └── DashboardLayout.tsx
│       └── pages/
│           ├── AuthPage.tsx      # Экран входа (с маскотом)
│           ├── FilesPage.tsx     # Файловый менеджер
│           ├── AdminPage.tsx     # Административная панель
│           ├── SearchPage.tsx    # Поиск
│           ├── SettingsPage.tsx  # Настройки
│           └── AboutPage.tsx     # О приложении
├── mock-server/
│   └── server.js             # Мок-сервер для тестирования
├── assets/
│   └── icons/
│       ├── icon.svg          # Исходный маскот (SVG)
│       ├── icon.icns         # macOS иконка (создать из SVG)
│       ├── icon.ico          # Windows иконка (создать из SVG)
│       └── icon.png          # PNG 512x512
├── build/
│   └── entitlements.mac.plist  # macOS entitlements
├── .env                      # Переменные окружения (git-ignored)
├── .env.example              # Пример конфигурации
├── package.json
├── vite.renderer.config.ts   # Vite для renderer
├── tailwind.config.ts
└── tsconfig.json
```

---

## Быстрый старт

### Предварительные требования

- **Node.js** 18+
- **npm** 9+
- macOS 12+ или Windows 10/11

### Установка

```bash
cd desktop-app
npm install
```

### Запуск в режиме разработки

#### С мок-сервером (без реального backend):
```bash
# Terminal 1 — запускаем мок-сервер
npm run mock

# Terminal 2 — запускаем приложение
npm run dev
```

#### С реальным Supabase backend:
```bash
# Создайте .env из .env.example и заполните своими данными
cp .env.example .env
# Установите VITE_USE_MOCK=false в .env

npm run dev
```

### Тестовые аккаунты (мок-режим)

| Email | Пароль | Роль |
|-------|--------|------|
| admin@redbit.io | demo | Администратор |
| user@redbit.io | demo | Исполнитель |
| client@redbit.io | demo | Клиент |

---

## Сборка дистрибутива

### macOS (Intel + Apple Silicon)

```bash
npm run dist:mac
```

Выходные файлы в `release/`:
- `RedBit Drive-1.0.0-x64.dmg` (Intel)
- `RedBit Drive-1.0.0-arm64.dmg` (Apple Silicon)
- `RedBit Drive-1.0.0-x64-mac.zip`
- `RedBit Drive-1.0.0-arm64-mac.zip`

### Windows (64-bit)

```bash
npm run dist:win
```

Выходные файлы в `release/`:
- `RedBit Drive Setup 1.0.0.exe` (NSIS installer)
- `RedBit Drive 1.0.0.exe` (Portable)

### Обе платформы (на CI/CD)

```bash
npm run dist
```

---

## Подготовка иконок приложения

Для корректного отображения иконок необходимо создать `.icns` (macOS) и `.ico` (Windows) из SVG маскота.

### macOS (.icns)
```bash
# Установите Inkscape или используйте онлайн конвертер
# Создайте PNG набор:
# icon_16x16.png, icon_32x32.png, icon_64x64.png, 
# icon_128x128.png, icon_256x256.png, icon_512x512.png

mkdir icon.iconset
# ... скопируйте PNG в папку с правильными именами ...
iconutil -c icns icon.iconset -o assets/icons/icon.icns
```

### Windows (.ico)
```bash
# Используйте ImageMagick:
convert assets/icons/icon.png \
  -define icon:auto-resize="256,128,64,48,32,16" \
  assets/icons/icon.ico
```

### Альтернатива — electron-icon-builder
```bash
npx electron-icon-builder --input=assets/icons/icon.png --output=assets/icons/
```

---

## Интеграция с реальным API

Для работы с реальным Supabase backend:

1. Создайте `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-key
VITE_USE_MOCK=false
```

2. Убедитесь, что Supabase проект содержит:
   - Таблицу `user_files` (структура — из миграций основного проекта)
   - Таблицу `profiles` с полем `role`
   - Edge Function `s3-presign` для загрузки в S3
   - Edge Function `s3-delete` для удаления из S3
   - Storage bucket `user-files` для небольших файлов

---

## Архитектура безопасности

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                      │
│  (contextIsolation=true, nodeIntegration=false,         │
│   sandbox=true)                                         │
│                                                         │
│  React App → window.electronAPI (только whitelist IPC)  │
└──────────────────────────┬──────────────────────────────┘
                           │ contextBridge (preload.js)
                           │ (строго ограниченный API)
┌──────────────────────────▼──────────────────────────────┐
│                      Main Process                        │
│  (полный доступ к Node.js и Electron API)               │
│                                                         │
│  - Нативные диалоги (dialog)                            │
│  - Загрузка/скачивание файлов (fs, https)               │
│  - Secure storage токенов (keytar)                      │
│  - Конфигурация (electron-store)                        │
│  - Нативное меню (Menu)                                 │
└─────────────────────────────────────────────────────────┘
```

Токены доступа хранятся в системном keychain через **keytar**:
- macOS: Keychain Access
- Windows: Windows Credential Manager

---

## Функциональность

### Пользовательская часть
- ✅ Аутентификация (email/пароль) с запоминанием
- ✅ Навигация по папкам с хлебными крошками
- ✅ Просмотр в 3 режимах: список, крупная сетка, мелкая сетка
- ✅ Загрузка файлов (drag-and-drop, кнопка, нативный диалог)
- ✅ S3 multipart загрузка для больших файлов (>10MB)
- ✅ Скачивание с нативным диалогом выбора папки
- ✅ Создание/переименование/удаление папок и файлов
- ✅ Поиск по файлам
- ✅ Индикатор прогресса загрузки (скорость, ETA)
- ✅ Индикатор использования хранилища
- ✅ Светлая/тёмная/системная тема

### Административная часть
- ✅ Дашборд с ключевыми метриками
- ✅ Управление пользователями (просмотр, изменение ролей)
- ✅ Статистика хранилища
- ✅ Настройки API
- ✅ Статус системы

---

## Нативные возможности Electron

| Функция | Реализация |
|---------|-----------|
| Перетаскивание окна | `-webkit-app-region: drag` в заголовке |
| macOS traffic lights | `titleBarStyle: "hiddenInset"` |
| Нативное меню | `Menu.buildFromTemplate()` |
| Диалог файлов | `dialog.showOpenDialog()` |
| Диалог папки | `dialog.showOpenDialog({ properties: ["openDirectory"] })` |
| Secure tokens | `keytar` (OS keychain) |
| Настройки | `electron-store` |
| Открыть в Finder/Explorer | `shell.showItemInFolder()` |
| Тема системы | `nativeTheme.shouldUseDarkColors` |

---

## Разработка

### Структура IPC каналов

```
config:get / config:set / config:getAll
theme:get-system / theme:set (→ theme:changed)
dialog:openFile / dialog:selectDirectory
download:file (→ download:progress)
shell:showItemInFolder / shell:openExternal
keytar:get / keytar:set / keytar:delete
app:getInfo
menu:upload / menu:new-folder / menu:about
```

### Добавление новой страницы

1. Создайте `src/renderer/pages/MyPage.tsx`
2. Добавьте маршрут в `App.tsx`
3. Добавьте пункт в `Sidebar.tsx`
4. При необходимости добавьте IPC handler в `main/index.js`
   и метод в `preload.js` + `lib/electron.ts`

---

## Требования к системе

| Платформа | Минимальная версия |
|-----------|-------------------|
| macOS | 12.0 Monterey (Intel & Apple Silicon) |
| Windows | 10 версия 1903 (x64) |
| RAM | 256 MB |
| Диск | 150 MB |
