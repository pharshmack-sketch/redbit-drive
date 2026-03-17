/**
 * п.9 ТЗ — Интеграция с файловым менеджером ОС
 *
 * Windows: пункт «Отправить в RedBit Drive» в контекстном меню проводника
 *          через запись в реестр HKCU\Software\Classes\*\shell\...
 *
 * macOS:   NSServices (пункт в меню Сервисы Finder)
 *          + регистрация через Info.plist (electron-builder добавляет это автоматически
 *            при наличии поля "extendInfo" в package.json)
 *
 * Вызов: require('./integrations').register(app, mainWindow)
 */

const { app, ipcMain } = require("electron");
const path = require("path");
const fs   = require("fs");
const os   = require("os");

// ── Windows: реестр ──────────────────────────────────────────────────────────
function registerWindowsContextMenu() {
  if (process.platform !== "win32") return;

  try {
    // regedit недоступен без нативного модуля, используем reg.exe напрямую
    const { execSync } = require("child_process");
    const exePath = process.execPath.replace(/\\/g, "\\\\");
    const appName = "RedBit Drive";

    // Пункт для файлов: HKCU\Software\Classes\*\shell\RedBitDrive
    const cmds = [
      // Файлы — все типы
      `reg add "HKCU\\Software\\Classes\\*\\shell\\RedBitDrive" /ve /d "Отправить в ${appName}" /f`,
      `reg add "HKCU\\Software\\Classes\\*\\shell\\RedBitDrive" /v "Icon" /d "${exePath}" /f`,
      `reg add "HKCU\\Software\\Classes\\*\\shell\\RedBitDrive\\command" /ve /d "\\\"${exePath}\\\" --upload \\\"%%1\\\"" /f`,

      // Директории
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\RedBitDrive" /ve /d "Отправить папку в ${appName}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\RedBitDrive" /v "Icon" /d "${exePath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\RedBitDrive\\command" /ve /d "\\\"${exePath}\\\" --upload-folder \\\"%%1\\\"" /f`,

      // Background (ПКМ на пустом месте в папке)
      `reg add "HKCU\\Software\\Classes\\Directory\\Background\\shell\\RedBitDrive" /ve /d "Открыть ${appName} здесь" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\Background\\shell\\RedBitDrive" /v "Icon" /d "${exePath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\Background\\shell\\RedBitDrive\\command" /ve /d "\\\"${exePath}\\\" --open-folder \\\"%%V\\\"" /f`,
    ];

    for (const cmd of cmds) {
      execSync(cmd, { stdio: "pipe" });
    }
    console.log("[Integration] Windows context menu registered");
    return true;
  } catch (err) {
    console.warn("[Integration] Windows registry write failed:", err.message);
    return false;
  }
}

function unregisterWindowsContextMenu() {
  if (process.platform !== "win32") return;
  try {
    const { execSync } = require("child_process");
    execSync(`reg delete "HKCU\\Software\\Classes\\*\\shell\\RedBitDrive" /f`, { stdio: "pipe" });
    execSync(`reg delete "HKCU\\Software\\Classes\\Directory\\shell\\RedBitDrive" /f`, { stdio: "pipe" });
    execSync(`reg delete "HKCU\\Software\\Classes\\Directory\\Background\\shell\\RedBitDrive" /f`, { stdio: "pipe" });
    console.log("[Integration] Windows context menu unregistered");
  } catch { /* already removed */ }
}

// ── macOS: обработка командной строки и URL-схем ─────────────────────────────
function registerMacOSHandlers(mainWindow) {
  if (process.platform !== "darwin") return;

  // Обработка файлов, открытых через «Открыть с помощью...»
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("os:open-file", filePath);
    }
  });

  // Обработка URL-схем redbitdrive://
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("os:open-url", url);
    }
  });

  console.log("[Integration] macOS handlers registered");
}

// ── Общий обработчик аргументов командной строки ─────────────────────────────
/**
 * Парсим аргументы запуска приложения:
 *   --upload "path/to/file"      → отправить файл
 *   --upload-folder "path"       → отправить папку
 *   --open-folder "path"         → открыть папку синхронизации
 */
function parseCommandLineArgs(argv, mainWindow, store) {
  const args = argv.slice(process.defaultApp ? 2 : 1);

  const uploadIdx = args.indexOf("--upload");
  if (uploadIdx >= 0 && args[uploadIdx + 1]) {
    const filePath = args[uploadIdx + 1];
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("os:upload-file", filePath);
    }
    return;
  }

  const folderIdx = args.indexOf("--upload-folder");
  if (folderIdx >= 0 && args[folderIdx + 1]) {
    const folderPath = args[folderIdx + 1];
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("os:upload-folder", folderPath);
    }
    return;
  }

  const openIdx = args.indexOf("--open-folder");
  if (openIdx >= 0 && args[openIdx + 1]) {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  }
}

// ── IPC handlers для управления интеграцией из renderer ─────────────────────
function registerIPC(store) {
  ipcMain.handle("integration:register-windows", async () => {
    const ok = registerWindowsContextMenu();
    if (store) store.set("windowsContextMenuRegistered", ok);
    return ok;
  });

  ipcMain.handle("integration:unregister-windows", async () => {
    unregisterWindowsContextMenu();
    if (store) store.set("windowsContextMenuRegistered", false);
    return true;
  });

  ipcMain.handle("integration:is-registered", () => {
    if (process.platform === "win32") {
      return store?.get("windowsContextMenuRegistered") || false;
    }
    return true; // macOS регистрируется через Info.plist автоматически
  });
}

// ── Главная функция регистрации ───────────────────────────────────────────────
function register(mainWindow, store) {
  registerMacOSHandlers(mainWindow);
  registerIPC(store);

  // Windows: авторегистрация при первом запуске
  if (process.platform === "win32" && !store?.get("windowsContextMenuRegistered")) {
    const ok = registerWindowsContextMenu();
    if (store && ok) store.set("windowsContextMenuRegistered", true);
  }

  // Обрабатываем аргументы текущего запуска
  parseCommandLineArgs(process.argv, mainWindow, store);

  // second-instance: обработка аргументов при попытке открыть второй экземпляр
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    parseCommandLineArgs(argv, mainWindow, store);
  });
}

module.exports = { register, unregisterWindowsContextMenu };
