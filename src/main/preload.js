/**
 * RedBit Drive — Preload Script v2.0
 * Расширен для поддержки: трей, синхронизация, корзина,
 * горячие клавиши, drag-out, уведомления, clipboard, fs-утилиты.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {

  // ── Конфиг ───────────────────────────────────────────────────────────────
  config: {
    get:    (key)        => ipcRenderer.invoke("config:get", key),
    set:    (key, value) => ipcRenderer.invoke("config:set", key, value),
    getAll: ()           => ipcRenderer.invoke("config:getAll"),
  },

  // ── Тема ─────────────────────────────────────────────────────────────────
  theme: {
    getSystem: ()      => ipcRenderer.invoke("theme:get-system"),
    set:       (theme) => ipcRenderer.send("theme:set", theme),
    onChange:  (cb)    => {
      const h = (_e, t) => cb(t);
      ipcRenderer.on("theme:changed", h);
      return () => ipcRenderer.removeListener("theme:changed", h);
    },
  },

  // ── Диалоги ──────────────────────────────────────────────────────────────
  dialog: {
    openFile:        (opts)  => ipcRenderer.invoke("dialog:openFile", opts),
    selectDirectory: (title) => ipcRenderer.invoke("dialog:selectDirectory", title),
  },

  // ── Скачивание ───────────────────────────────────────────────────────────
  download: {
    file: (params) => ipcRenderer.invoke("download:file", params),
    onProgress: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on("download:progress", h);
      return () => ipcRenderer.removeListener("download:progress", h);
    },
  },

  // ── Shell ────────────────────────────────────────────────────────────────
  shell: {
    showItemInFolder: (fp)  => ipcRenderer.invoke("shell:showItemInFolder", fp),
    openExternal:    (url)  => ipcRenderer.invoke("shell:openExternal", url),
    openPath:        (fp)   => ipcRenderer.invoke("shell:openPath", fp),
  },

  // ── Keytar ───────────────────────────────────────────────────────────────
  keytar: {
    get:    (svc, acc)        => ipcRenderer.invoke("keytar:get",    svc, acc),
    set:    (svc, acc, pass)  => ipcRenderer.invoke("keytar:set",    svc, acc, pass),
    delete: (svc, acc)        => ipcRenderer.invoke("keytar:delete", svc, acc),
  },

  // ── App ──────────────────────────────────────────────────────────────────
  app: {
    getInfo: () => ipcRenderer.invoke("app:getInfo"),
  },

  // ── Clipboard ────────────────────────────────────────────────────────────
  clipboard: {
    writeText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
    readText:  ()     => ipcRenderer.invoke("clipboard:readText"),
  },

  // ── п.4 Синхронизация ────────────────────────────────────────────────────
  sync: {
    selectRoot:    ()     => ipcRenderer.invoke("sync:select-root"),
    getRoot:       ()     => ipcRenderer.invoke("sync:get-root"),
    toggle:        (on)   => ipcRenderer.invoke("sync:toggle", on),
    pauseToggle:   ()     => ipcRenderer.invoke("sync:pause-toggle"),
    fileSynced:    (data) => ipcRenderer.send("sync:file-synced",    data),
    uploadStarted: ()     => ipcRenderer.send("sync:upload-started"),

    onLocalChange:   (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on("sync:local-change",   h); return () => ipcRenderer.removeListener("sync:local-change",   h); },
    onPausedChanged: (cb) => { const h = (_e, v) => cb(v); ipcRenderer.on("sync:paused-changed", h); return () => ipcRenderer.removeListener("sync:paused-changed", h); },
    onStarted:       (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on("sync:started",        h); return () => ipcRenderer.removeListener("sync:started",        h); },
    onStopped:       (cb) => { const h = ()      => cb();   ipcRenderer.on("sync:stopped",        h); return () => ipcRenderer.removeListener("sync:stopped",        h); },
    onError:         (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on("sync:error",          h); return () => ipcRenderer.removeListener("sync:error",          h); },
    onRootMoved:     (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on("sync:root-moved",     h); return () => ipcRenderer.removeListener("sync:root-moved",     h); },
  },

  // ── п.9 Уведомления ──────────────────────────────────────────────────────
  notification: {
    send: (opts) => ipcRenderer.send("notification:send", opts),
  },

  // ── п.7 Drag из приложения ───────────────────────────────────────────────
  drag: {
    startFile:  (params) => ipcRenderer.send("drag:start-file",  params),
    startFiles: (params) => ipcRenderer.send("drag:start-files", params),
  },

  // ── п.11 Корзина ─────────────────────────────────────────────────────────
  trash: {
    move:       (params) => ipcRenderer.invoke("trash:move",        params),
    restore:    (params) => ipcRenderer.invoke("trash:restore",     params),
    list:       ()       => ipcRenderer.invoke("trash:list"),
    purge:      (id)     => ipcRenderer.invoke("trash:purge",       id),
    cleanupOld: ()       => ipcRenderer.invoke("trash:cleanup-old"),
  },

  // ── FS утилиты ───────────────────────────────────────────────────────────
  fs: {
    exists:     (fp)      => ipcRenderer.invoke("fs:exists",     fp),
    mkdir:      (fp)      => ipcRenderer.invoke("fs:mkdir",      fp),
    readFile:   (fp)      => ipcRenderer.invoke("fs:readFile",   fp),
    writeFile:  (fp, b64) => ipcRenderer.invoke("fs:writeFile",  fp, b64),
    deleteFile: (fp)      => ipcRenderer.invoke("fs:deleteFile", fp),
    listDir:    (dp)      => ipcRenderer.invoke("fs:listDir",    dp),
  },

  // ── Меню-события ─────────────────────────────────────────────────────────
  menu: {
    onUpload:    (cb) => { const h = ()       => cb();  ipcRenderer.on("menu:upload",    h); return () => ipcRenderer.removeListener("menu:upload",    h); },
    onNewFolder: (cb) => { const h = ()       => cb();  ipcRenderer.on("menu:new-folder",h); return () => ipcRenderer.removeListener("menu:new-folder",h); },
    onAbout:     (cb) => { const h = ()       => cb();  ipcRenderer.on("menu:about",     h); return () => ipcRenderer.removeListener("menu:about",     h); },
    onSearch:    (cb) => { const h = ()       => cb();  ipcRenderer.on("menu:search",    h); return () => ipcRenderer.removeListener("menu:search",    h); },
    onViewMode:  (cb) => { const h = (_e, m)  => cb(m); ipcRenderer.on("menu:view-mode", h); return () => ipcRenderer.removeListener("menu:view-mode", h); },
    onNavigate:  (cb) => { const h = (_e, p)  => cb(p); ipcRenderer.on("menu:navigate",  h); return () => ipcRenderer.removeListener("menu:navigate",  h); },
  },

  // ── Навигация из трея/уведомления ────────────────────────────────────────
  drive: {
    onNavigateTo: (cb) => {
      const h = (_e, id) => cb(id);
      ipcRenderer.on("drive:navigate-to", h);
      return () => ipcRenderer.removeListener("drive:navigate-to", h);
    },
  },

  // ── п.9и — Интеграция с Finder/Explorer ──────────────────────────────────
  integration: {
    register:    ()  => ipcRenderer.invoke("integration:register-windows"),
    unregister:  ()  => ipcRenderer.invoke("integration:unregister-windows"),
    isRegistered:()  => ipcRenderer.invoke("integration:is-registered"),

    // Слушатели событий от ОС
    onOpenFile:     (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on("os:open-file",     h); return () => ipcRenderer.removeListener("os:open-file",     h); },
    onUploadFile:   (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on("os:upload-file",   h); return () => ipcRenderer.removeListener("os:upload-file",   h); },
    onUploadFolder: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on("os:upload-folder", h); return () => ipcRenderer.removeListener("os:upload-folder", h); },
    onOpenUrl:      (cb) => { const h = (_e, u) => cb(u); ipcRenderer.on("os:open-url",      h); return () => ipcRenderer.removeListener("os:open-url",      h); },
  },

  // ── Платформа ────────────────────────────────────────────────────────────
  platform: process.platform,
  isDev:    process.env.NODE_ENV === "development",
});
