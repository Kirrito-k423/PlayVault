import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
  session,
  screen,
} from "electron";
import fs from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { LibraryStore, validateLibrary } from "./store";
import { emptyGame, isWithin, normalizeFilePath } from "./core";
import { isGameExecutable } from "../shared/files";
import { localFile, scanDirectories } from "./scanner";
import { refreshSteam, searchSteam, appIdValue } from "./steam";
import { refreshMetadata } from "./metadata";
import { detectSevenZip, extractArchive } from "./archive";
import { cacheArtwork } from "./media-cache";
import { resolveLaunchPaths } from "./paths";
import type {
  AppState,
  Game,
  GameEdit,
  Library,
  LocalFile,
  ScanCandidate,
  Settings,
} from "../shared/types";

const { baseDirectory, dataDirectory, relaunchExecutable } = resolveLaunchPaths(
  {
    packaged: app.isPackaged,
    executable: app.getPath("exe"),
    appDirectory: app.getAppPath(),
    environment: process.env,
  },
);
mkdirSync(dataDirectory, { recursive: true });
app.setPath("userData", dataDirectory);
app.setPath("sessionData", path.join(dataDirectory, "chromium"));
app.setPath("crashDumps", path.join(dataDirectory, "crashes"));
app.setAppUserModelId("local.playvault.launcher");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "playvault",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
const catalogDirectory = app.isPackaged
  ? path.join(process.resourcesPath, "catalog")
  : path.join(app.getAppPath(), "resources");
const store = new LibraryStore(dataDirectory);
let window: BrowserWindow | null = null;
let catalog: Game[] = [];
let scanController: AbortController | null = null;
let candidates = new Map<string, ScanCandidate>();
let extracting = false;
let quitting = false;
const running = new Map<string, { start: number; pid?: number }>();
const fetcher = (url: string, init?: RequestInit) =>
  net.fetch(url, init as any) as Promise<Response>;
const refreshJobs = new Map<string, Promise<unknown>>();
function send(channel: string, data: unknown) {
  if (window && !window.isDestroyed())
    window.webContents.send(`pv:${channel}`, data);
}
function gameById(id: string): Game {
  const g = store.get().games.find((g) => g.id === id);
  if (!g) throw new Error("游戏记录不存在");
  return g;
}
function fileById(gameId: string, fileId: string): LocalFile {
  const file = gameById(gameId).files.find((f) => f.id === fileId);
  if (!file) throw new Error("本地文件记录不存在");
  return file;
}
async function persist(fn: (lib: Library) => void) {
  const library = await store.update(fn);
  send("library-changed", library);
  return library;
}
function validCaller(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("请求来源无效");
  const url = event.senderFrame?.url;
  if (
    process.env.PLAYVAULT_DEV_URL
      ? !url?.startsWith(`${process.env.PLAYVAULT_DEV_URL}/`)
      : url !==
        pathToFileURL(path.join(app.getAppPath(), "dist", "index.html")).href
  )
    throw new Error("请求来源无效");
}
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(`pv:${channel}`, (event, ...args) => {
    validCaller(event);
    return fn(...args);
  });
}
const filterFor = (kind: string): Electron.FileFilter[] =>
  kind === "executable" || kind === "sevenZip"
    ? [{ name: "Windows 程序", extensions: ["exe"] }]
    : kind === "package"
      ? [
          {
            name: "游戏安装包",
            extensions: ["zip", "7z", "rar", "001", "exe", "iso"],
          },
        ]
      : kind === "gif"
        ? [{ name: "GIF 动图", extensions: ["gif"] }]
        : kind === "video"
          ? [{ name: "视频", extensions: ["mp4", "webm"] }]
          : [{ name: "宣传图片", extensions: ["jpg", "jpeg", "png", "webp"] }];
async function chooseFile(kind: string) {
  const r = await dialog.showOpenDialog(window!, {
    title: "选择本地文件",
    properties: ["openFile"],
    filters: filterFor(kind),
  });
  return r.canceled ? null : r.filePaths[0];
}
async function chooseDirectory() {
  const r = await dialog.showOpenDialog(window!, {
    title: "选择目录",
    properties: ["openDirectory", "createDirectory"],
  });
  return r.canceled ? null : r.filePaths[0];
}
function fromCatalog(appId?: number, name = "未命名游戏"): Game {
  const template = catalog.find((g) => g.steamAppId === appId);
  return template
    ? {
        ...structuredClone(template),
        id: randomUUID(),
        files: [],
        favorite: false,
        playtimeSeconds: 0,
        addedAt: new Date().toISOString(),
      }
    : emptyGame(name, appId);
}
async function checkFiles() {
  const lib = store.get();
  let changed = false;
  await Promise.all(
    lib.games.flatMap((g) =>
      g.files.map(async (f) => {
        let available = false;
        try {
          available = (await fs.lstat(f.path)).isFile();
        } catch {}
        if (f.available !== available) {
          f.available = available;
          changed = true;
        }
      }),
    ),
  );
  if (changed)
    await persist((next) => {
      for (const g of next.games)
        for (const f of g.files) {
          const checked = lib.games
            .find((x) => x.id === g.id)
            ?.files.find((x) => x.id === f.id);
          if (checked) f.available = checked.available;
        }
    });
}
async function saveCatalog() {
  await fs.writeFile(
    path.join(dataDirectory, "catalog-cache.json"),
    JSON.stringify(catalog, null, 2),
    "utf8",
  );
}
function registerHandlers() {
  handle("state", async (): Promise<AppState> => {
    await checkFiles();
    return {
      library: store.get(),
      catalog,
      dataDirectory,
      version: app.getVersion(),
      runningGameIds: [...running.keys()],
    };
  });
  handle("choose-directory", chooseDirectory);
  handle("choose-file", chooseFile);
  handle("scan", async (roots: string[]) => {
    if (scanController) throw new Error("已有扫描任务正在进行");
    if (
      !Array.isArray(roots) ||
      roots.length > 20 ||
      !roots.length ||
      !roots.every((r) => typeof r === "string" && path.isAbsolute(r))
    )
      throw new Error("请选择 1–20 个扫描目录");
    scanController = new AbortController();
    try {
      const result = await scanDirectories(roots, {
        signal: scanController.signal,
        onProgress: (p) => send("scan-progress", p),
      });
      candidates = new Map(result.candidates.map((c) => [c.id, c]));
      return result;
    } finally {
      scanController = null;
    }
  });
  handle("cancel-scan", () => {
    scanController?.abort();
  });
  handle("save-roots", (roots: string[]) => {
    if (
      !Array.isArray(roots) ||
      roots.length > 20 ||
      !roots.every((r) => typeof r === "string" && path.isAbsolute(r))
    )
      throw new Error("扫描目录无效");
    return persist((lib) => {
      lib.roots = [...new Set(roots.map((r) => path.resolve(r)))];
    });
  });
  handle("import-candidates", (ids: string[]) => {
    if (!Array.isArray(ids) || !ids.every((id) => candidates.has(id)))
      throw new Error("扫描结果已过期，请重新扫描");
    return persist((lib) => {
      for (const id of ids) {
        const candidate = candidates.get(id)!;
        let game = lib.games.find(
          (g) =>
            (candidate.steamAppId && g.steamAppId === candidate.steamAppId) ||
            g.files.some((f) =>
              candidate.files.some(
                (cf) =>
                  normalizeFilePath(f.path) === normalizeFilePath(cf.path),
              ),
            ),
        );
        if (!game) {
          game = fromCatalog(candidate.steamAppId, candidate.name);
          lib.games.push(game);
        }
        const existing = new Set(
          game.files.map((f) => normalizeFilePath(f.path)),
        );
        for (const file of candidate.files)
          if (!existing.has(normalizeFilePath(file.path))) {
            game.files.push(file);
            existing.add(normalizeFilePath(file.path));
          }
        if (!game.launchFileId)
          game.launchFileId = game.files.find(
            (f) => f.kind === "executable",
          )?.id;
      }
    });
  });
  handle(
    "add-game",
    async (input: { name: string; path?: string; steamAppId?: number }) => {
      if (!input || typeof input.name !== "string" || !input.name.trim())
        throw new Error("请填写游戏名称");
      const appId =
        input.steamAppId === undefined
          ? undefined
          : appIdValue(input.steamAppId);
      const file = input.path ? await localFile(input.path) : undefined;
      return persist((lib) => {
        let game = lib.games.find(
          (g) =>
            (appId && g.steamAppId === appId) ||
            (file &&
              g.files.some(
                (f) =>
                  normalizeFilePath(f.path) === normalizeFilePath(file.path),
              )),
        );
        if (!game) {
          game = fromCatalog(appId, input.name.trim().slice(0, 200));
          lib.games.push(game);
        }
        if (
          file &&
          !game.files.some(
            (f) => normalizeFilePath(f.path) === normalizeFilePath(file.path),
          )
        )
          game.files.push(file);
        if (!game.launchFileId && file?.kind === "executable")
          game.launchFileId = file.id;
      });
    },
  );
  handle("add-catalog-game", (value: number) => {
    const appId = appIdValue(value);
    return persist((lib) => {
      if (!lib.games.some((g) => g.steamAppId === appId))
        lib.games.push(fromCatalog(appId));
    });
  });
  handle("search-steam", (query: string) =>
    searchSteam(String(query), fetcher),
  );
  handle("refresh-game", (id: string) => {
    if (refreshJobs.has(id)) return refreshJobs.get(id);
    const job = (async () => {
      const old = gameById(id),
        result = await refreshMetadata(old, fetcher);
      result.game = await cacheArtwork(result.game, dataDirectory, fetcher);
      await persist((lib) => {
        const current = lib.games.find((g) => g.id === id);
        if (!current || current.steamAppId !== old.steamAppId)
          throw new Error("游戏资料已更改，请重新刷新");
        Object.assign(current, result.game, {
          files: current.files,
          launchFileId: current.launchFileId,
          favorite: current.favorite,
          playtimeSeconds: current.playtimeSeconds,
          lastPlayed: current.lastPlayed,
        });
        result.game = structuredClone(current);
      });
      return result;
    })().finally(() => refreshJobs.delete(id));
    refreshJobs.set(id, job);
    return job;
  });
  handle("refresh-catalog", async (appId: number) => {
    const game = catalog.find((g) => g.steamAppId === appIdValue(appId));
    if (!game) throw new Error("资料不存在");
    const result = await refreshSteam(game, fetcher);
    result.game = await cacheArtwork(result.game, dataDirectory, fetcher);
    catalog = catalog.map((g) => (g.id === game.id ? result.game : g));
    await saveCatalog();
    return result;
  });
  handle("update-game", (id: string, edit: GameEdit) =>
    persist((lib) => {
      const g = lib.games.find((g) => g.id === id);
      if (!g) throw new Error("游戏不存在");
      if (
        !edit ||
        typeof edit.name !== "string" ||
        !edit.name.trim() ||
        typeof edit.description !== "string"
      )
        throw new Error("游戏资料无效");
      const appId =
        edit.steamAppId === undefined ? undefined : appIdValue(edit.steamAppId);
      if (appId && lib.games.some((x) => x.id !== id && x.steamAppId === appId))
        throw new Error("游戏库中已有此 Steam 游戏，请给已有游戏关联文件");
      if (g.steamAppId !== appId) {
        const template = fromCatalog(appId, edit.name);
        Object.assign(g, template, {
          id: g.id,
          files: g.files,
          launchFileId: g.launchFileId,
          favorite: g.favorite,
          playtimeSeconds: g.playtimeSeconds,
          lastPlayed: g.lastPlayed,
          addedAt: g.addedAt,
        });
        delete g.reviews;
        if (template.reviews) g.reviews = template.reviews;
        delete g.metadataAt;
        if (template.metadataAt) g.metadataAt = template.metadataAt;
        delete g.metadataUrl;
        if (template.metadataUrl) g.metadataUrl = template.metadataUrl;
      }
      g.name = edit.name.trim().slice(0, 200);
      g.description = edit.description.slice(0, 10000);
      g.steamAppId = appId;
      if (
        edit.launchFileId &&
        !g.files.some((f) => f.id === edit.launchFileId && isGameExecutable(f))
      )
        throw new Error("启动文件无效");
      g.launchFileId = edit.launchFileId;
      if (edit.critics) g.critics = edit.critics;
      if (edit.awards) g.awards = edit.awards;
    }),
  );
  handle("toggle-favorite", (id: string) =>
    persist((lib) => {
      const g = lib.games.find((g) => g.id === id);
      if (!g) throw new Error("游戏不存在");
      g.favorite = !g.favorite;
    }),
  );
  handle("attach-file", async (id: string, kind: string) => {
    gameById(id);
    const selected = await chooseFile(kind);
    if (!selected) return store.get();
    const file = await localFile(selected);
    if (kind === "executable" && file.kind !== "executable")
      throw new Error("请选择游戏本体的 EXE，安装程序请作为安装包关联");
    return persist((lib) => {
      const g = lib.games.find((g) => g.id === id)!;
      if (
        !g.files.some(
          (f) => normalizeFilePath(f.path) === normalizeFilePath(file.path),
        )
      )
        g.files.push(file);
      if (kind === "executable")
        g.launchFileId = g.files.find(
          (f) => normalizeFilePath(f.path) === normalizeFilePath(file.path),
        )?.id;
    });
  });
  handle("attach-media", async (id: string, kind: string) => {
    gameById(id);
    if (!["art", "gif", "video"].includes(kind))
      throw new Error("媒体类型无效");
    const source = await chooseFile(kind);
    if (!source) return store.get();
    const ext = path.extname(source).toLowerCase();
    if (
      ![".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm"].includes(ext)
    )
      throw new Error("不支持该媒体格式");
    const info = await fs.lstat(source);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error("请选择实际的媒体文件");
    if (info.size > 2 * 1024 ** 3) throw new Error("媒体文件不能大于 2 GB");
    const filename = `${randomUUID()}${ext}`;
    await fs.mkdir(path.join(dataDirectory, "media"), { recursive: true });
    await fs.copyFile(source, path.join(dataDirectory, "media", filename));
    return persist((lib) => {
      const g = lib.games.find((g) => g.id === id)!;
      const url = `playvault://media/${filename}`;
      if (kind === "art") {
        g.hero = url;
        g.backdrop = url;
      } else if (kind === "gif") g.gifs.push(url);
      else
        g.movies.push({ name: path.basename(source), url, thumbnail: g.hero });
    });
  });
  handle("detach-file", (id: string, fileId: string) =>
    persist((lib) => {
      const g = lib.games.find((g) => g.id === id);
      if (!g) throw new Error("游戏不存在");
      g.files = g.files.filter((f) => f.id !== fileId);
      if (g.launchFileId === fileId)
        g.launchFileId = g.files.find((f) => f.kind === "executable")?.id;
    }),
  );
  handle("remove-game", (id: string) => {
    if (running.has(id)) throw new Error("请退出游戏后再移除记录");
    return persist((lib) => {
      lib.games = lib.games.filter((g) => g.id !== id);
    });
  });
  handle("merge-games", (sourceId: string, targetId: string) => {
    if (sourceId === targetId) throw new Error("请选择另一条游戏记录");
    if (running.has(sourceId) || extracting)
      throw new Error("请等游戏退出或解压完成后再合并");
    return persist((lib) => {
      const source = lib.games.find((g) => g.id === sourceId),
        target = lib.games.find((g) => g.id === targetId);
      if (!source || !target) throw new Error("游戏记录不存在");
      for (const file of source.files)
        if (
          !target.files.some(
            (f) => normalizeFilePath(f.path) === normalizeFilePath(file.path),
          )
        )
          target.files.push(file);
      if (!target.launchFileId)
        target.launchFileId = target.files.find(
          (f) => f.kind === "executable",
        )?.id;
      target.favorite = target.favorite || source.favorite;
      target.playtimeSeconds += source.playtimeSeconds;
      if (
        source.lastPlayed &&
        (!target.lastPlayed || source.lastPlayed > target.lastPlayed)
      )
        target.lastPlayed = source.lastPlayed;
      if (!target.steamAppId && source.steamAppId) {
        target.steamAppId = source.steamAppId;
        for (const key of [
          "description",
          "hero",
          "poster",
          "releaseDate",
        ] as const)
          if (!target[key]) target[key] = source[key];
        for (const key of [
          "screenshots",
          "movies",
          "gifs",
          "genres",
          "developers",
          "critics",
          "awards",
        ] as const)
          if (!target[key].length) (target as any)[key] = source[key];
        target.reviews = source.reviews;
        target.metadataAt = source.metadataAt;
        target.metadataUrl = source.metadataUrl;
      }
      lib.games = lib.games.filter((g) => g.id !== sourceId);
    });
  });
  handle("launch-game", async (id: string) => {
    const game = gameById(id);
    if (running.has(id)) throw new Error("该游戏已在运行");
    const file = game.files.find(
      (f) => f.id === game.launchFileId && isGameExecutable(f),
    );
    if (!file)
      throw new Error(
        "请先选择游戏本体的启动 EXE；文件校验工具和安装包不能作为游戏启动",
      );
    const info = await fs.lstat(file.path).catch(() => null);
    if (
      !info?.isFile() ||
      info.isSymbolicLink() ||
      !file.path.toLowerCase().endsWith(".exe")
    )
      throw new Error("启动文件不存在或无效，请重新定位");
    const child = spawn(file.path, [], {
      cwd: path.dirname(file.path),
      shell: false,
      detached: false,
      stdio: "ignore",
      windowsHide: false,
    });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("spawn", resolve);
    });
    running.set(id, { start: Date.now(), pid: child.pid });
    send("running-changed", [...running.keys()]);
    child.once("exit", async () => {
      const session = running.get(id);
      running.delete(id);
      send("running-changed", [...running.keys()]);
      if (session)
        await persist((lib) => {
          const g = lib.games.find((g) => g.id === id);
          if (g)
            g.playtimeSeconds += Math.max(
              0,
              Math.floor((Date.now() - session.start) / 1000),
            );
        }).catch(() => {});
    });
    await persist((lib) => {
      const g = lib.games.find((g) => g.id === id);
      if (g) g.lastPlayed = new Date().toISOString();
    });
  });
  handle("reveal-file", async (id: string, fileId: string) => {
    const f = fileById(id, fileId);
    if (!existsSync(f.path))
      throw new Error("文件不存在，请检查磁盘是否已连接");
    shell.showItemInFolder(f.path);
  });
  handle("open-installer", async (id: string, fileId: string) => {
    const f = fileById(id, fileId);
    if (!["installer", "disc"].includes(f.kind))
      throw new Error("请从本地文件中选择安装程序或光盘镜像");
    if (!(await fs.lstat(f.path)).isFile()) throw new Error("安装包不存在");
    const result = await dialog.showMessageBox(window!, {
      type: "question",
      title: f.kind === "disc" ? "打开光盘镜像" : "运行安装程序",
      message:
        f.kind === "disc" ? "使用系统打开此镜像？" : "运行你选择的安装程序？",
      detail: f.path,
      buttons: ["取消", "继续"],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response === 1) {
      const error = await shell.openPath(f.path);
      if (error) throw new Error(error);
    }
  });
  handle("extract-game", async (id: string, fileId: string, parent: string) => {
    if (extracting) throw new Error("已有解压任务正在进行");
    const g = gameById(id),
      f = fileById(id, fileId);
    if (f.kind !== "archive") throw new Error("此文件不是支持的压缩包");
    extracting = true;
    try {
      const exe = await detectSevenZip(store.get().settings.sevenZipPath);
      const directory = await extractArchive({
        archive: f.path,
        parent,
        name: g.name,
        sevenZip: exe,
        onProgress: (percent, message) =>
          send("extract-progress", { gameId: id, percent, message }),
      });
      const result = await scanDirectories([directory]);
      const library = await persist((lib) => {
        const game = lib.games.find((x) => x.id === id);
        if (!game) throw new Error("游戏记录已移除");
        for (const candidate of result.candidates)
          for (const file of candidate.files)
            if (
              !game.files.some(
                (x) =>
                  normalizeFilePath(x.path) === normalizeFilePath(file.path),
              )
            )
              game.files.push(file);
        if (!game.launchFileId)
          game.launchFileId = game.files.find(
            (x) => x.kind === "executable",
          )?.id;
      });
      return { directory, library };
    } finally {
      extracting = false;
    }
  });
  handle("save-settings", (settings: Settings) =>
    persist((lib) => {
      if (
        !settings ||
        !path.isAbsolute(settings.installDirectory) ||
        typeof settings.sevenZipPath !== "string" ||
        typeof settings.autoRefresh !== "boolean"
      )
        throw new Error("设置无效");
      lib.settings = settings;
    }),
  );
  handle("export-library", async () => {
    const r = await dialog.showSaveDialog(window!, {
      title: "导出游戏库索引",
      defaultPath: path.join(
        baseDirectory,
        `PlayVault-备份-${new Date().toISOString().slice(0, 10)}.json`,
      ),
      filters: [{ name: "JSON 备份", extensions: ["json"] }],
    });
    if (r.canceled || !r.filePath) return null;
    if (
      normalizeFilePath(r.filePath) ===
      normalizeFilePath(path.join(dataDirectory, "library.json"))
    )
      throw new Error("请选择独立的备份文件");
    await fs.writeFile(
      r.filePath,
      JSON.stringify(store.get(), null, 2),
      "utf8",
    );
    return r.filePath;
  });
  handle("import-library", async () => {
    const r = await dialog.showOpenDialog(window!, {
      title: "导入游戏库索引",
      properties: ["openFile"],
      filters: [{ name: "JSON 备份", extensions: ["json"] }],
    });
    if (r.canceled) return null;
    const stat = await fs.stat(r.filePaths[0]);
    if (stat.size > 32 * 1024 ** 2) throw new Error("备份文件过大");
    const imported = validateLibrary(
      JSON.parse(await fs.readFile(r.filePaths[0], "utf8")),
    );
    return persist((lib) => {
      for (const g of imported.games) {
        const existing = lib.games.find(
          (x) =>
            x.id === g.id ||
            (g.steamAppId && x.steamAppId === g.steamAppId) ||
            x.files.some((f) =>
              g.files.some(
                (o) => normalizeFilePath(o.path) === normalizeFilePath(f.path),
              ),
            ),
        );
        if (!existing) lib.games.push(g);
        else
          for (const f of g.files)
            if (
              !existing.files.some(
                (x) => normalizeFilePath(x.path) === normalizeFilePath(f.path),
              )
            )
              existing.files.push(f);
      }
    });
  });
  handle("open-external", async (value: string) => {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("仅支持 HTTPS 链接");
    await shell.openExternal(url.href);
  });
  ipcMain.on("pv:window", (event, action) => {
    validCaller(event);
    if (action === "close") window?.close();
    else if (action === "minimize") window?.minimize();
    else if (action === "maximize")
      window?.isMaximized() ? window.unmaximize() : window?.maximize();
  });
}
async function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const initialWidth = Math.floor(
    Math.min(1600, area.width, (area.height * 16) / 9),
  );
  window = new BrowserWindow({
    width: initialWidth,
    height: Math.round((initialWidth * 9) / 16),
    minWidth: Math.min(1000, area.width),
    minHeight: Math.min(650, area.height),
    frame: false,
    backgroundColor: "#111315",
    title: "游迹 PlayVault",
    icon: path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      "assets",
      "icon.ico",
    ),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  if (app.isPackaged && process.platform === "win32")
    window.setAppDetails({
      appId: "local.playvault.launcher",
      relaunchCommand: `"${relaunchExecutable}"`,
      relaunchDisplayName: "游迹 PlayVault",
      appIconPath: relaunchExecutable,
      appIconIndex: 0,
    });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.once("ready-to-show", () => window?.show());
  window.on("close", (event) => {
    if (extracting) {
      event.preventDefault();
      dialog.showMessageBox(window!, {
        type: "info",
        title: "解压正在进行",
        message: "请等解压完成后再退出游迹。",
        detail: "可以先最小化窗口；原始安装包始终保留。",
      });
    }
  });
  window.on("closed", () => {
    window = null;
  });
  await (process.env.PLAYVAULT_DEV_URL
    ? window.loadURL(process.env.PLAYVAULT_DEV_URL)
    : window.loadFile(path.join(app.getAppPath(), "dist", "index.html")));
}
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      await store.load();
      catalog = JSON.parse(
        await fs.readFile(path.join(catalogDirectory, "catalog.json"), "utf8"),
      );
      try {
        const cache = JSON.parse(
          await fs.readFile(
            path.join(dataDirectory, "catalog-cache.json"),
            "utf8",
          ),
        );
        if (Array.isArray(cache))
          catalog = catalog.map((g) => {
            const saved = cache.find(
              (c: Game) => c.steamAppId === g.steamAppId,
            );
            return saved
              ? {
                  ...g,
                  ...saved,
                  logo: saved.logo || g.logo,
                  backdrop: saved.backdrop || g.backdrop,
                }
              : g;
          });
      } catch {}
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      protocol.handle("playvault", async (request) => {
        try {
          const url = new URL(request.url),
            base =
              url.hostname === "catalog"
                ? catalogDirectory
                : url.hostname === "media"
                  ? path.join(dataDirectory, "media")
                  : null;
          if (!base) return new Response("Not found", { status: 404 });
          const file = path.resolve(
            base,
            "." + decodeURIComponent(url.pathname),
          );
          if (
            !isWithin(base, file) ||
            !/^\.(jpe?g|png|webp|gif|mp4|webm)$/i.test(path.extname(file))
          )
            return new Response("Forbidden", { status: 403 });
          return net.fetch(pathToFileURL(file).href, {
            headers: request.headers,
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      });
      registerHandlers();
      await createWindow();
    })
    .catch(async (error) => {
      await dialog.showMessageBox({
        type: "error",
        title: "游迹启动失败",
        message: (error as Error).message,
      });
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    scanController?.abort();
    if (quitting) return;
    if (extracting) {
      event.preventDefault();
      window?.show();
      return;
    }
    if (running.size) {
      event.preventDefault();
      const sessions = [...running.entries()],
        now = Date.now();
      running.clear();
      persist((lib) => {
        for (const [id, session] of sessions) {
          const game = lib.games.find((g) => g.id === id);
          if (game)
            game.playtimeSeconds += Math.max(
              0,
              Math.floor((now - session.start) / 1000),
            );
        }
      }).finally(() => {
        quitting = true;
        app.quit();
      });
    }
  });
}
