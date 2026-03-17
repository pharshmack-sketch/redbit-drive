/**
 * Типизированная обёртка над window.electronAPI v2.0
 * Новые модули: sync, notification, drag, trash, fs, clipboard, driveAPI
 */

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!(window as any).electronAPI;
}
function api() {
  if (!isElectron()) throw new Error("Not running in Electron");
  return (window as any).electronAPI;
}

// ── Config ────────────────────────────────────────────────────────────────
export const config = {
  get:    (key: string): Promise<any>              => api().config.get(key),
  set:    (key: string, value: any): Promise<void> => api().config.set(key, value),
  getAll: (): Promise<Record<string, any>>         => api().config.getAll(),
};

// ── Theme ─────────────────────────────────────────────────────────────────
export const theme = {
  getSystem: (): Promise<"dark"|"light">             => api().theme.getSystem(),
  set:       (t: string): void                       => api().theme.set(t),
  onChange:  (cb: (t: string) => void): (()=>void)   => api().theme.onChange(cb),
};

// ── Dialog ────────────────────────────────────────────────────────────────
export interface FilePickResult { path: string; name: string; size: number; type: string; data: string | null; }
export const dialog = {
  openFile:        (opts?: object): Promise<FilePickResult[]|null> => api().dialog.openFile(opts),
  selectDirectory: (title?: string): Promise<string|null>         => api().dialog.selectDirectory(title),
};

// ── Download ──────────────────────────────────────────────────────────────
export const download = {
  file: (p: {url:string;fileName:string;savePath:string}): Promise<{success:boolean;path:string}> => api().download.file(p),
  onProgress: (cb: (d:{fileName:string;progress:number;downloadedBytes:number;totalBytes:number})=>void): (()=>void) => api().download.onProgress(cb),
};

// ── Shell ─────────────────────────────────────────────────────────────────
export const shell = {
  showItemInFolder: (fp: string): Promise<void>  => api().shell.showItemInFolder(fp),
  openExternal:     (url: string): Promise<void> => api().shell.openExternal(url),
  openPath:         (fp: string): Promise<void>  => api().shell.openPath(fp),
};

// ── Keytar ────────────────────────────────────────────────────────────────
export const keytar = {
  get:    (svc: string, acc: string): Promise<string|null>          => api().keytar.get(svc, acc),
  set:    (svc: string, acc: string, pass: string): Promise<boolean> => api().keytar.set(svc, acc, pass),
  delete: (svc: string, acc: string): Promise<void>                 => api().keytar.delete(svc, acc),
};

// ── App ───────────────────────────────────────────────────────────────────
export interface AppInfo { version:string; platform:string; arch:string; name:string; userDataPath:string; isDev:boolean; syncRoot:string; }
export const appInfo = { get: (): Promise<AppInfo> => api().app.getInfo() };

// ── Clipboard ─────────────────────────────────────────────────────────────
export const clipboardAPI = {
  writeText: (text: string): Promise<boolean> => api().clipboard.writeText(text),
  readText:  (): Promise<string>              => api().clipboard.readText(),
};

// ── п.4 Синхронизация ─────────────────────────────────────────────────────
export const syncAPI = {
  selectRoot:    (): Promise<string|null>       => api().sync.selectRoot(),
  getRoot:       (): Promise<string>            => api().sync.getRoot(),
  toggle:        (on: boolean): Promise<boolean> => api().sync.toggle(on),
  pauseToggle:   (): Promise<boolean>           => api().sync.pauseToggle(),
  fileSynced:    (d: {name:string;size:number;id:string}): void => api().sync.fileSynced(d),
  uploadStarted: (): void                       => api().sync.uploadStarted(),
  onLocalChange:   (cb: (d:{event:string;filePath:string;relativePath:string})=>void) => isElectron() ? api().sync.onLocalChange(cb)   : ()=>{},
  onPausedChanged: (cb: (v:boolean)=>void)      => isElectron() ? api().sync.onPausedChanged(cb) : ()=>{},
  onStarted:       (cb: (p:string)=>void)       => isElectron() ? api().sync.onStarted(cb)       : ()=>{},
  onStopped:       (cb: ()=>void)               => isElectron() ? api().sync.onStopped(cb)        : ()=>{},
  onError:         (cb: (m:string)=>void)       => isElectron() ? api().sync.onError(cb)          : ()=>{},
  onRootMoved:     (cb: (d:{from:string;to:string})=>void) => isElectron() ? api().sync.onRootMoved(cb) : ()=>{},
};

// ── п.9 Уведомления ───────────────────────────────────────────────────────
export const notificationAPI = {
  send: (opts:{title:string;body?:string;type?:"success"|"error"|"info"|"warning";fileId?:string}): void => {
    if (isElectron()) api().notification.send(opts);
  },
};

// ── п.7 Drag-out ──────────────────────────────────────────────────────────
export const dragAPI = {
  startFile:  (filePath: string, iconPath?: string): void    => { if (isElectron()) api().drag.startFile({filePath, iconPath}); },
  startFiles: (filePaths: string[], iconPath?: string): void => { if (isElectron()) api().drag.startFiles({filePaths, iconPath}); },
};

// ── п.11 Корзина ──────────────────────────────────────────────────────────
export interface TrashItem { id:string; name:string; deletedAt:number; localPath:string; }
export const trashAPI = {
  move:       (p:{sourcePath?:string;fileName:string;fileId:string}): Promise<{success:boolean;error?:string}> => api().trash.move(p),
  restore:    (p:{localPath:string;originalPath:string}): Promise<{success:boolean;error?:string}>              => api().trash.restore(p),
  list:       (): Promise<TrashItem[]>                  => api().trash.list(),
  purge:      (id:string): Promise<{success:boolean}>   => api().trash.purge(id),
  cleanupOld: (): Promise<{removed:number}>             => api().trash.cleanupOld(),
};

// ── FS утилиты ────────────────────────────────────────────────────────────
export const fsAPI = {
  exists:     (fp:string): Promise<boolean>                       => api().fs.exists(fp),
  mkdir:      (fp:string): Promise<boolean>                       => api().fs.mkdir(fp),
  readFile:   (fp:string): Promise<string>                        => api().fs.readFile(fp),
  writeFile:  (fp:string, b64:string): Promise<boolean>           => api().fs.writeFile(fp, b64),
  deleteFile: (fp:string): Promise<boolean>                       => api().fs.deleteFile(fp),
  listDir:    (dp:string): Promise<{name:string;isDirectory:boolean;size:number}[]> => api().fs.listDir(dp),
};

// ── Меню-события ──────────────────────────────────────────────────────────
export const menu = {
  onUpload:    (cb:()=>void)           => isElectron() ? api().menu.onUpload(cb)    : ()=>{},
  onNewFolder: (cb:()=>void)           => isElectron() ? api().menu.onNewFolder(cb) : ()=>{},
  onAbout:     (cb:()=>void)           => isElectron() ? api().menu.onAbout(cb)     : ()=>{},
  onSearch:    (cb:()=>void)           => isElectron() ? api().menu.onSearch(cb)    : ()=>{},
  onViewMode:  (cb:(m:string)=>void)   => isElectron() ? api().menu.onViewMode(cb)  : ()=>{},
  onNavigate:  (cb:(p:string)=>void)   => isElectron() ? api().menu.onNavigate(cb)  : ()=>{},
};

// ── Drive (навигация из трея/уведомления) ─────────────────────────────────
export const driveAPI = {
  onNavigateTo: (cb:(id:string)=>void) => isElectron() ? api().drive.onNavigateTo(cb) : ()=>{},
};

// ── Platform ──────────────────────────────────────────────────────────────
export function getPlatform(): "darwin"|"win32"|"linux"|"web" {
  if (!isElectron()) return "web";
  return (window as any).electronAPI.platform;
}
