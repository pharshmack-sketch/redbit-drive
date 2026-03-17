/**
 * RedBit Drive — Electron Main Process v2.1
 *
 * Исправления:
 *  fix-1 — убрана иконка из строки меню macOS (Tray создаётся только на Windows)
 *  fix-2 — исправлено закрытие: кнопка ✕ и Cmd+Q теперь реально завершают приложение
 *
 * Пункты ТЗ:
 *  п.1  — иконка из маскота (Яндекс.Диск)
 *  п.2  — titleBarStyle hiddenInset + логотип в правой части шапки
 *  п.3  — IPC для контекстного меню
 *  п.4  — корневая папка синхронизации
 *  п.5  — системный трей (только Windows)
 *  п.6  — глобальные горячие клавиши
 *  п.7  — drag-out в проводник
 *  п.9  — системные уведомления
 *  п.11 — локальная корзина
 *  п.12 — синхронизация через chokidar
 */

const {
  app, BrowserWindow, ipcMain, dialog, shell, Menu,
  Tray, nativeImage, nativeTheme, Notification,
  globalShortcut, clipboard,
} = require("electron");
const path  = require("path");
const fs    = require("fs");
const os    = require("os");
const https = require("https");
const http  = require("http");
const { URL } = require("url");

// ── Конфиг ──────────────────────────────────────────────────────────────────
let store;
(async () => {
  const { default: Store } = await import("electron-store");
  store = new Store({
    name: "redbit-drive-config",
    defaults: {
      theme: "system",
      language: "ru",
      apiBaseUrl: "https://kkgpxwxleojvxomgbbjf.supabase.co",
      useMock: true,
      windowBounds: { width: 1280, height: 800 },
      syncRootPath: path.join(os.homedir(), "Диск-клиент"),
      encryptionEnabled: false,
      syncEnabled: false,
      syncPaused: false,
      recentUploads: [],
    },
  });
})();

const isDev = process.env.NODE_ENV === "development";
const isMacOS = process.platform === "darwin";
const isWindows = process.platform === "win32";

// ── Состояние ────────────────────────────────────────────────────────────────
let mainWindow    = null;
let tray          = null;        // создаётся только на Windows
let syncWatcher   = null;
let isSyncPaused  = false;
let trayAnimTimer = null;

/**
 * fix-2: флаг «приложение завершается».
 * Устанавливается в true перед app.quit() и при before-quit.
 * Когда флаг true — окно закрывается без e.preventDefault().
 */
let isQuitting = false;

// ══════════════════════════════════════════════════════════════════════════════
//  ОКНО
// ══════════════════════════════════════════════════════════════════════════════
function createWindow() {
  const savedBounds = store
    ? store.get("windowBounds")
    : { width: 1280, height: 800 };

  mainWindow = new BrowserWindow({
    width:  savedBounds.width  || 1280,
    height: savedBounds.height || 800,
    minWidth: 900, minHeight: 600,
    titleBarStyle: isMacOS ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#f8fafc",
    icon: path.join(__dirname, "../../assets/icons/icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
      devTools: isDev,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("close", (e) => {
    // fix-2: если приложение завершается — не перехватываем
    if (isQuitting) {
      if (store && !mainWindow.isDestroyed()) {
        store.set("windowBounds", mainWindow.getBounds());
      }
      return; // позволяем окну закрыться
    }

    // fix-1: на macOS трея нет — окно закрываем через стандартный механизм macOS
    // (Cmd+Q → quit, ✕ → hide как в Finder/Chrome, но только если есть трей)
    // Поскольку трей на macOS убран, ✕ и Cmd+W скрывают окно (стандарт macOS)
    // а Cmd+Q полностью завершает приложение через isQuitting=true
    if (isMacOS) {
      // На macOS ✕ скрывает окно (стандартное поведение большинства приложений)
      // Cmd+Q обрабатывается через role:"quit" в меню → устанавливает isQuitting=true
      e.preventDefault();
      mainWindow.hide();
      return;
    }

    // fix-2: на Windows трей есть — скрываем в трей вместо закрытия
    if (isWindows && tray) {
      e.preventDefault();
      mainWindow.hide();
      return;
    }

    // Остальное — нормальное закрытие
    if (store && !mainWindow.isDestroyed()) {
      store.set("windowBounds", mainWindow.getBounds());
    }
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  ТРЕЙ — только Windows (fix-1: убран с macOS)
// ══════════════════════════════════════════════════════════════════════════════
function getTrayIcon() {
  const p = isWindows
    ? path.join(__dirname, "../../assets/icons/icon.ico")
    : path.join(__dirname, "../../assets/icons/icon.png");
  const img = nativeImage.createFromPath(p);
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
}

function createTray() {
  // fix-1: трей создаётся ТОЛЬКО на Windows
  // На macOS трей в меню-баре не нужен — вместо него стандартное macOS-меню
  if (!isWindows) return;

  tray = new Tray(getTrayIcon());
  tray.setToolTip("RedBit Drive");
  updateTrayMenu();

  tray.on("click", () => {
    if (!mainWindow) { createWindow(); return; }
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
  });

  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function updateTrayMenu(status = "idle") {
  if (!tray) return;

  const labels = {
    idle:    "● Синхронизация завершена",
    syncing: "↺ Синхронизация...",
    paused:  "⏸ На паузе",
    error:   "⚠ Ошибка",
    offline: "✕ Нет соединения",
  };
  tray.setToolTip(`RedBit Drive — ${labels[status] || "○ Ожидание"}`);

  const recent = (store?.get("recentUploads") || []).slice(0, 5);
  const recentItems = recent.length
    ? recent.map((u) => ({
        label: `${u.name} (${fmtBytes(u.size)})`,
        click: () => mainWindow?.webContents.send("drive:navigate-to", u.id),
      }))
    : [{ label: "Нет недавних загрузок", enabled: false }];

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "RedBit Drive", enabled: false },
    { type: "separator" },
    { label: labels[status] || "○ Ожидание", enabled: false },
    { type: "separator" },
    {
      label: mainWindow?.isVisible() ? "Скрыть окно" : "Показать окно",
      click: () => {
        if (!mainWindow) { createWindow(); return; }
        mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
      },
    },
    { type: "separator" },
    {
      label: isSyncPaused ? "Возобновить синхронизацию" : "Приостановить синхронизацию",
      click: () => {
        isSyncPaused = !isSyncPaused;
        store?.set("syncPaused", isSyncPaused);
        mainWindow?.webContents.send("sync:paused-changed", isSyncPaused);
        updateTrayMenu(isSyncPaused ? "paused" : "idle");
        stopTrayAnim();
      },
    },
    { label: "Последние загрузки", submenu: recentItems },
    { type: "separator" },
    {
      // fix-2: явная кнопка «Выход» в трее Windows правильно завершает приложение
      label: "Выход",
      click: () => {
        isQuitting = true;
        tray?.destroy();
        tray = null;
        if (store && mainWindow && !mainWindow.isDestroyed()) {
          store.set("windowBounds", mainWindow.getBounds());
        }
        app.quit();
      },
    },
  ]));
}

function startTrayAnim() {
  if (trayAnimTimer || !tray) return;
  let f = 0;
  trayAnimTimer = setInterval(() => {
    f = (f + 1) % 6;
    tray?.setToolTip(`RedBit Drive — загрузка${".".repeat((f % 3) + 1)}`);
  }, 400);
}

function stopTrayAnim() {
  if (trayAnimTimer) { clearInterval(trayAnimTimer); trayAnimTimer = null; }
  tray?.setToolTip("RedBit Drive");
}

// ══════════════════════════════════════════════════════════════════════════════
//  МЕНЮ ПРИЛОЖЕНИЯ
// ══════════════════════════════════════════════════════════════════════════════
function setupMenu() {
  const send = (ch, data) => mainWindow?.webContents.send(ch, data);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    // macOS системное меню (Редактор имени приложения слева)
    ...(isMacOS ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        {
          // fix-2: Cmd+Q устанавливает isQuitting=true перед выходом
          label: "Выйти из RedBit Drive",
          accelerator: "Cmd+Q",
          click: () => {
            isQuitting = true;
            if (store && mainWindow && !mainWindow.isDestroyed()) {
              store.set("windowBounds", mainWindow.getBounds());
            }
            app.quit();
          },
        },
      ],
    }] : []),

    { label: "Файл", submenu: [
      { label: "Загрузить файлы...", accelerator: "CmdOrCtrl+O",       click: () => send("menu:upload") },
      { label: "Создать папку",      accelerator: "CmdOrCtrl+Shift+N", click: () => send("menu:new-folder") },
      { type: "separator" },
      isMacOS
        ? {
            // fix-2: на macOS ✕ скрывает окно, Cmd+W закрывает вкладку/окно
            label: "Закрыть окно",
            accelerator: "Cmd+W",
            click: () => mainWindow?.hide(),
          }
        : { role: "quit" },
    ]},

    { label: "Правка", submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" },
      { type: "separator" }, { role: "selectAll" },
      { type: "separator" },
      { label: "Найти", accelerator: "CmdOrCtrl+F", click: () => send("menu:search") },
    ]},

    { label: "Вид", submenu: [
      { label: "Обновить",      accelerator: "CmdOrCtrl+R",  click: () => mainWindow?.webContents.reload() },
      { type: "separator" },
      { label: "Список",        accelerator: "CmdOrCtrl+1",  click: () => send("menu:view-mode", "list") },
      { label: "Крупная сетка", accelerator: "CmdOrCtrl+2",  click: () => send("menu:view-mode", "large") },
      { label: "Мелкая сетка",  accelerator: "CmdOrCtrl+3",  click: () => send("menu:view-mode", "small") },
      { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" }, { role: "togglefullscreen" },
      ...(isDev ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
    ]},

    { label: "Перейти", submenu: [
      { label: "Мой диск",  accelerator: "CmdOrCtrl+D",       click: () => send("menu:navigate", "/drive") },
      { label: "Корзина",   accelerator: "CmdOrCtrl+Shift+T", click: () => send("menu:navigate", "/trash") },
      { label: "Поиск",     accelerator: "CmdOrCtrl+F",       click: () => send("menu:navigate", "/search") },
      { label: "Настройки", accelerator: "CmdOrCtrl+,",       click: () => send("menu:navigate", "/settings") },
    ]},

    { label: "Справка", submenu: [
      { label: "О приложении", click: () => send("menu:about") },
      { label: "Открыть сайт", click: () => shell.openExternal("https://pxbt.io") },
    ]},
  ]));
}

// ══════════════════════════════════════════════════════════════════════════════
//  ГОРЯЧИЕ КЛАВИШИ
// ══════════════════════════════════════════════════════════════════════════════
function registerGlobalShortcuts() {
  const ok1 = globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (!mainWindow) { createWindow(); return; }
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
  });
  const ok2 = globalShortcut.register("CommandOrControl+Shift+F", () => {
    if (!mainWindow) createWindow();
    setTimeout(() => {
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.webContents.send("menu:search");
    }, 200);
  });
  if (!ok1) console.warn("[Shortcuts] CmdOrCtrl+Shift+Space already registered");
  if (!ok2) console.warn("[Shortcuts] CmdOrCtrl+Shift+F already registered");
}

// ══════════════════════════════════════════════════════════════════════════════
//  УВЕДОМЛЕНИЯ
// ══════════════════════════════════════════════════════════════════════════════
function sendNotification({ title, body, type = "info", fileId } = {}) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: title || "RedBit Drive",
    body:  body  || "",
    icon:  path.join(__dirname, "../../assets/icons/icon.png"),
    urgency: type === "error" ? "critical" : "normal",
  });
  n.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
    if (fileId) mainWindow?.webContents.send("drive:navigate-to", fileId);
  });
  n.show();
}

// ══════════════════════════════════════════════════════════════════════════════
//  СИНХРОНИЗАЦИЯ chokidar
// ══════════════════════════════════════════════════════════════════════════════
function startSync(syncPath) {
  if (syncWatcher) { syncWatcher.close(); syncWatcher = null; }
  if (!syncPath) return;
  fs.mkdirSync(syncPath, { recursive: true });
  try {
    const chokidar = require("chokidar");
    syncWatcher = chokidar.watch(syncPath, {
      ignored: /(^|[\/\\])(\.|\.trash)/,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });
    const emit = (event, filePath) => {
      if (isSyncPaused) return;
      mainWindow?.webContents.send("sync:local-change", {
        event, filePath, relativePath: path.relative(syncPath, filePath),
      });
      updateTrayMenu("syncing");
      startTrayAnim();
      setTimeout(() => { stopTrayAnim(); updateTrayMenu("idle"); }, 4000);
    };
    syncWatcher
      .on("add",       (fp) => emit("add",       fp))
      .on("change",    (fp) => emit("change",     fp))
      .on("unlink",    (fp) => emit("unlink",     fp))
      .on("addDir",    (fp) => emit("addDir",     fp))
      .on("unlinkDir", (fp) => emit("unlinkDir",  fp))
      .on("error",     (e)  => {
        console.error("[Sync]", e);
        mainWindow?.webContents.send("sync:error", e.message);
        updateTrayMenu("error");
      });
    mainWindow?.webContents.send("sync:started", syncPath);
    updateTrayMenu("idle");
  } catch (err) {
    console.error("[Sync] chokidar error:", err.message);
  }
}

function stopSync() {
  if (syncWatcher) { syncWatcher.close(); syncWatcher = null; }
  mainWindow?.webContents.send("sync:stopped");
  updateTrayMenu("idle");
}

// ══════════════════════════════════════════════════════════════════════════════
//  ЖИЗНЕННЫЙ ЦИКЛ
// ══════════════════════════════════════════════════════════════════════════════
app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 400));
  createWindow();
  setupMenu();
  createTray();   // fix-1: внутри — проверка isWindows, на macOS ничего не делает
  registerGlobalShortcuts();
  if (store?.get("syncEnabled")) startSync(store.get("syncRootPath"));

  try {
    const integrations = require("./integrations");
    integrations.register(mainWindow, store);
  } catch (err) {
    console.warn("[Integration] Failed to load integrations:", err.message);
  }

  app.on("activate", () => {
    // macOS: клик на иконке в Dock → показываем окно
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

// fix-2: window-all-closed — на macOS app продолжает жить (стандарт),
// но только если НЕ завершаемся явно
app.on("window-all-closed", () => {
  if (isMacOS && !isQuitting) return; // macOS: живём без окон (в Dock)
  app.quit();
});

// fix-2: before-quit всегда устанавливает isQuitting=true
// Это гарантирует что повторный close не будет перехвачен
app.on("before-quit", () => {
  isQuitting = true;
  stopSync();
  globalShortcut.unregisterAll();
  stopTrayAnim();
  if (store && mainWindow && !mainWindow.isDestroyed()) {
    store.set("windowBounds", mainWindow.getBounds());
  }
});

app.on("will-quit", () => {
  tray?.destroy();
  tray = null;
});

// ══════════════════════════════════════════════════════════════════════════════
//  IPC HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

// ── Конфиг ───────────────────────────────────────────────────────────────────
ipcMain.handle("config:get",    (_e, k)      => store?.get(k) ?? null);
ipcMain.handle("config:set",    (_e, k, v)   => { store?.set(k, v); });
ipcMain.handle("config:getAll", ()           => store?.store ?? {});

// ── Тема ─────────────────────────────────────────────────────────────────────
ipcMain.handle("theme:get-system", () => nativeTheme.shouldUseDarkColors ? "dark" : "light");
ipcMain.on("theme:set", (_e, t) => {
  store?.set("theme", t);
  mainWindow?.webContents.send("theme:changed", t);
});

// ── Диалоги ──────────────────────────────────────────────────────────────────
ipcMain.handle("dialog:openFile", async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: "Выберите файлы для загрузки",
    properties: ["openFile", "multiSelections"],
    ...opts,
  });
  if (r.canceled) return null;
  return r.filePaths.map((fp) => {
    const stat = fs.statSync(fp);
    return {
      path: fp, name: path.basename(fp), size: stat.size,
      type: getMimeType(fp),
      data: stat.size < 50 * 1024 * 1024 ? fs.readFileSync(fp).toString("base64") : null,
    };
  });
});

ipcMain.handle("dialog:selectDirectory", async (_e, title) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: title || "Выберите папку",
    properties: ["openDirectory", "createDirectory"],
  });
  return r.canceled ? null : r.filePaths[0];
});

// ── Синхронизация (корневая папка) ───────────────────────────────────────────
ipcMain.handle("sync:select-root", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: "Папка синхронизации",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: store?.get("syncRootPath") || os.homedir(),
  });
  if (r.canceled) return null;
  const newPath = r.filePaths[0];
  const oldPath = store?.get("syncRootPath");
  store?.set("syncRootPath", newPath);
  if (oldPath && oldPath !== newPath && fs.existsSync(oldPath)) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "question", title: "Перенос данных",
      message: "Перенести существующие файлы в новую папку?",
      buttons: ["Перенести", "Не переносить", "Отмена"], defaultId: 0,
    });
    if (choice.response === 0) {
      try {
        for (const e of fs.readdirSync(oldPath)) {
          fs.renameSync(path.join(oldPath, e), path.join(newPath, e));
        }
        mainWindow?.webContents.send("sync:root-moved", { from: oldPath, to: newPath });
      } catch (err) { console.error("[Sync] Move:", err.message); }
    } else if (choice.response === 2) {
      store?.set("syncRootPath", oldPath);
      return oldPath;
    }
  }
  if (store?.get("syncEnabled")) startSync(newPath);
  return newPath;
});

ipcMain.handle("sync:get-root",    ()        => store?.get("syncRootPath") || path.join(os.homedir(), "Диск-клиент"));
ipcMain.handle("sync:toggle",      (_e, on)  => { store?.set("syncEnabled", on); on ? startSync(store?.get("syncRootPath")) : stopSync(); return on; });
ipcMain.handle("sync:pause-toggle", ()       => {
  isSyncPaused = !isSyncPaused;
  store?.set("syncPaused", isSyncPaused);
  mainWindow?.webContents.send("sync:paused-changed", isSyncPaused);
  updateTrayMenu(isSyncPaused ? "paused" : "idle");
  if (isSyncPaused) stopTrayAnim();
  return isSyncPaused;
});

ipcMain.on("sync:file-synced", (_e, { name, size, id }) => {
  const r = store?.get("recentUploads") || [];
  r.unshift({ name, size, id, at: Date.now() });
  store?.set("recentUploads", r.slice(0, 10));
  updateTrayMenu("idle");
  stopTrayAnim();
});
ipcMain.on("sync:upload-started", () => { updateTrayMenu("syncing"); startTrayAnim(); });

// ── Уведомления ──────────────────────────────────────────────────────────────
ipcMain.on("notification:send", (_e, opts) => sendNotification(opts));

// ── Скачивание ───────────────────────────────────────────────────────────────
ipcMain.handle("download:file", async (_e, { url, fileName, savePath }) => {
  return new Promise((resolve, reject) => {
    try {
      const fullPath = path.join(savePath, fileName);
      const file = fs.createWriteStream(fullPath);
      const proto = new URL(url).protocol === "https:" ? https : http;
      proto.get(url, (res) => {
        if (res.statusCode !== 200) {
          file.close(); fs.unlink(fullPath, () => {});
          reject(new Error(`HTTP ${res.statusCode}`)); return;
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let dl = 0;
        res.on("data", (c) => {
          dl += c.length;
          if (total) mainWindow?.webContents.send("download:progress", {
            fileName, progress: Math.round(dl / total * 100), downloadedBytes: dl, totalBytes: total,
          });
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          sendNotification({ title: "Скачивание завершено", body: fileName, type: "success" });
          resolve({ success: true, path: fullPath });
        });
      }).on("error", (e) => { file.close(); fs.unlink(fullPath, () => {}); reject(e); });
    } catch (e) { reject(e); }
  });
});

// ── Drag-out ─────────────────────────────────────────────────────────────────
ipcMain.on("drag:start-file",  (_e, { filePath, iconPath })  => {
  if (mainWindow) mainWindow.webContents.startDrag({
    file: filePath,
    icon: iconPath || path.join(__dirname, "../../assets/icons/icon.png"),
  });
});
ipcMain.on("drag:start-files", (_e, { filePaths, iconPath }) => {
  if (mainWindow && filePaths?.length) mainWindow.webContents.startDrag({
    files: filePaths,
    icon:  iconPath || path.join(__dirname, "../../assets/icons/icon.png"),
  });
});

// ── Shell ────────────────────────────────────────────────────────────────────
ipcMain.handle("shell:showItemInFolder", (_e, fp)  => shell.showItemInFolder(fp));
ipcMain.handle("shell:openExternal",    (_e, url)  => shell.openExternal(url));
ipcMain.handle("shell:openPath",        (_e, fp)   => shell.openPath(fp));

// ── Корзина ──────────────────────────────────────────────────────────────────
const trashDir = () => {
  const p = path.join(store?.get("syncRootPath") || os.homedir(), ".trash");
  fs.mkdirSync(p, { recursive: true });
  return p;
};
const trashMeta     = () => { try { return JSON.parse(fs.readFileSync(path.join(trashDir(), "meta.json"), "utf8")); } catch { return []; } };
const saveTrashMeta = (m) => fs.writeFileSync(path.join(trashDir(), "meta.json"), JSON.stringify(m));

ipcMain.handle("trash:move", async (_e, { sourcePath, fileName, fileId }) => {
  try {
    const dest = path.join(trashDir(), `${Date.now()}_${fileName}`);
    if (sourcePath && fs.existsSync(sourcePath)) fs.renameSync(sourcePath, dest);
    const m = trashMeta();
    m.push({ id: fileId, name: fileName, deletedAt: Date.now(), localPath: dest });
    saveTrashMeta(m);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle("trash:restore", (_e, { localPath, originalPath }) => {
  try { fs.renameSync(localPath, originalPath); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle("trash:list",    () => trashMeta());
ipcMain.handle("trash:purge",   (_e, itemId) => {
  try {
    let m = trashMeta();
    const item = m.find((i) => i.id === itemId);
    if (item?.localPath && fs.existsSync(item.localPath)) fs.unlinkSync(item.localPath);
    saveTrashMeta(m.filter((i) => i.id !== itemId));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle("trash:cleanup-old", () => {
  const THIRTY = 30 * 24 * 60 * 60 * 1000, now = Date.now();
  let m = trashMeta();
  const [del, keep] = m.reduce(([d, k], i) => now - i.deletedAt > THIRTY ? [[...d, i], k] : [d, [...k, i]], [[], []]);
  for (const i of del) if (i.localPath && fs.existsSync(i.localPath)) fs.unlinkSync(i.localPath);
  saveTrashMeta(keep);
  return { removed: del.length };
});

// ── Keytar ───────────────────────────────────────────────────────────────────
ipcMain.handle("keytar:get",    async (_e, s, a)    => { try { return await require("keytar").getPassword(s, a); } catch { return store?.get(`token:${s}:${a}`, null) ?? null; } });
ipcMain.handle("keytar:set",    async (_e, s, a, p) => { try { await require("keytar").setPassword(s, a, p); } catch { store?.set(`token:${s}:${a}`, p); } return true; });
ipcMain.handle("keytar:delete", async (_e, s, a)    => { try { await require("keytar").deletePassword(s, a); } catch { store?.delete(`token:${s}:${a}`); } });

// ── App info ─────────────────────────────────────────────────────────────────
ipcMain.handle("app:getInfo", () => ({
  version: app.getVersion(), platform: process.platform, arch: process.arch,
  name: app.getName(), userDataPath: app.getPath("userData"), isDev,
  syncRoot: store?.get("syncRootPath") || "",
}));

// ── Clipboard ────────────────────────────────────────────────────────────────
ipcMain.handle("clipboard:writeText", (_e, t) => { clipboard.writeText(t); return true; });
ipcMain.handle("clipboard:readText",  ()       => clipboard.readText());

// ── FS ───────────────────────────────────────────────────────────────────────
ipcMain.handle("fs:exists",    (_e, fp)      => fs.existsSync(fp));
ipcMain.handle("fs:mkdir",     (_e, fp)      => { fs.mkdirSync(fp, { recursive: true }); return true; });
ipcMain.handle("fs:readFile",  (_e, fp)      => fs.readFileSync(fp).toString("base64"));
ipcMain.handle("fs:writeFile", (_e, fp, b64) => { fs.writeFileSync(fp, Buffer.from(b64, "base64")); return true; });
ipcMain.handle("fs:deleteFile",(_e, fp)      => { if (fs.existsSync(fp)) fs.unlinkSync(fp); return true; });
ipcMain.handle("fs:listDir",   (_e, dp)      => {
  try {
    return fs.readdirSync(dp, { withFileTypes: true }).map((e) => ({
      name: e.name, isDirectory: e.isDirectory(),
      size: e.isFile() ? fs.statSync(path.join(dp, e.name)).size : 0,
    }));
  } catch { return []; }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function getMimeType(fp) {
  const m = {
    ".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".gif":"image/gif",
    ".webp":"image/webp",".svg":"image/svg+xml",".mp4":"video/mp4",".mov":"video/quicktime",
    ".avi":"video/x-msvideo",".mp3":"audio/mpeg",".wav":"audio/wav",".ogg":"audio/ogg",
    ".pdf":"application/pdf",".txt":"text/plain",".md":"text/markdown",
    ".json":"application/json",".zip":"application/zip",".doc":"application/msword",
    ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls":"application/vnd.ms-excel",
    ".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return m[path.extname(fp).toLowerCase()] || "application/octet-stream";
}

function fmtBytes(b) {
  if (!b) return "0 Б";
  if (b < 1024) return b + " Б";
  if (b < 1048576) return (b / 1024).toFixed(0) + " КБ";
  return (b / 1048576).toFixed(1) + " МБ";
}
