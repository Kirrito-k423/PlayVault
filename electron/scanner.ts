import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { classifyFile, cleanTitle, normalizeFilePath } from "./core";
import type {
  LocalFile,
  ScanCandidate,
  ScanProgress,
  ScanResult,
} from "../shared/types";

const excluded =
  /^(\$.*|windows|windowsapps|programdata|appdata|node_modules|\.git|\.codegraph|system volume information|recovery|__macosx|_commonredist|redist|directx|vcredist|easyanticheat|battleye|engine|support|crashreportclient|data|cache)$/i;
const container =
  /^(games?|steam(library|apps)?|common|安装包|游戏|单机游戏|program files( \(x86\))?|downloads?|软件|pc games)$/i;
export interface ScanOptions {
  signal?: AbortSignal;
  onProgress?: (p: ScanProgress) => void;
  maxEntries?: number;
  maxDepth?: number;
}
function groupDirectory(root: string, file: string): string {
  const dirs = path
    .relative(root, path.dirname(file))
    .split(path.sep)
    .filter(Boolean);
  if (
    dirs.length &&
    /^(binaries|bin|bin64|bin32|win64|win32|x64|x86)$/i.test(dirs[0])
  )
    return root;
  let count = 0;
  while (count < dirs.length && container.test(dirs[count])) count++;
  if (count < dirs.length) return path.join(root, ...dirs.slice(0, count + 1));
  return path.dirname(file);
}
export async function localFile(
  filePath: string,
  allowUnknown = false,
): Promise<LocalFile> {
  const info = await fs.lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("请选择实际文件，快捷方式和链接暂不支持");
  const kind = classifyFile(path.basename(filePath));
  if (!kind && !allowUnknown)
    throw new Error("支持 EXE、ZIP、7Z、RAR 和 ISO 文件（分卷请选择第一卷）");
  return {
    id: randomUUID(),
    path: path.resolve(filePath),
    kind: kind || "executable",
    size: info.size,
    available: true,
  };
}
export async function scanDirectories(
  roots: string[],
  options: ScanOptions = {},
): Promise<ScanResult> {
  const result: ScanResult = {
    candidates: [],
    visited: 0,
    skipped: 0,
    warnings: [],
    cancelled: false,
    limited: false,
  };
  const groups = new Map<string, ScanCandidate>();
  const manifests = new Map<string, { appId: number; name: string }>();
  const seen = new Set<string>();
  const maxEntries = options.maxEntries ?? 60000,
    maxDepth = options.maxDepth ?? 9;
  let lastProgress = 0;
  const queue = roots.map((root) => ({
    root: path.resolve(root),
    dir: path.resolve(root),
    depth: 0,
  }));
  while (queue.length) {
    if (options.signal?.aborted) {
      result.cancelled = true;
      break;
    }
    const item = queue.shift()!;
    const key = normalizeFilePath(item.dir);
    if (seen.has(key)) continue;
    seen.add(key);
    let entries;
    try {
      const stat = await fs.lstat(item.dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        result.skipped++;
        continue;
      }
      entries = await fs.readdir(item.dir, { withFileTypes: true });
    } catch {
      result.skipped++;
      if (item.depth === 0) result.warnings.push(`无法读取：${item.dir}`);
      continue;
    }
    for (const entry of entries) {
      if (options.signal?.aborted) {
        result.cancelled = true;
        break;
      }
      if (++result.visited > maxEntries) {
        result.limited = true;
        break;
      }
      const full = path.join(item.dir, entry.name);
      if (entry.isSymbolicLink()) {
        result.skipped++;
        continue;
      }
      if (entry.isDirectory()) {
        if (excluded.test(entry.name)) {
          result.skipped++;
          continue;
        }
        if (item.depth < maxDepth)
          queue.push({ ...item, dir: full, depth: item.depth + 1 });
        else {
          result.skipped++;
          result.limited = true;
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (/^appmanifest_\d+\.acf$/i.test(entry.name)) {
        try {
          const stat = await fs.stat(full);
          if (stat.size < 1024 * 1024) {
            const content = await fs.readFile(full, "utf8");
            const appId = Number(content.match(/"appid"\s+"(\d+)"/)?.[1]);
            const install = content.match(/"installdir"\s+"([^"]+)"/)?.[1];
            const name = content.match(/"name"\s+"([^"]+)"/)?.[1];
            if (appId && install && name)
              manifests.set(
                normalizeFilePath(path.join(item.dir, "common", install)),
                { appId, name },
              );
          }
        } catch {
          /* unreadable manifests do not stop the scan */
        }
      }
      const kind = classifyFile(entry.name);
      if (!kind) continue;
      const directory = groupDirectory(item.root, full);
      const standalone = directory === item.root;
      const groupKey = normalizeFilePath(standalone ? full : directory);
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          id: randomUUID(),
          name: cleanTitle(standalone ? entry.name : path.basename(directory)),
          directory,
          files: [],
        };
        groups.set(groupKey, group);
      }
      try {
        const file = await localFile(full);
        if (/\.part0*1\.rar$/i.test(entry.name))
          file.parts = entries.filter(
            (e) =>
              e.name
                .toLowerCase()
                .startsWith(
                  entry.name.replace(/\.part0*1\.rar$/i, "").toLowerCase() +
                    ".part",
                ) && /\.rar$/i.test(e.name),
          ).length;
        if (/\.(7z|zip)\.001$/i.test(entry.name))
          file.parts = entries.filter(
            (e) =>
              e.name.startsWith(entry.name.slice(0, -3)) &&
              /\.\d{3}$/.test(e.name),
          ).length;
        group.files.push(file);
      } catch {
        result.skipped++;
      }
    }
    if (Date.now() - lastProgress > 120) {
      options.onProgress?.({
        visited: result.visited,
        found: groups.size,
        directory: item.dir,
      });
      lastProgress = Date.now();
    }
    if (result.cancelled || result.visited >= maxEntries) break;
  }
  for (const group of groups.values()) {
    if (!group.files.length) continue;
    const manifest = manifests.get(normalizeFilePath(group.directory));
    if (manifest) {
      group.steamAppId = manifest.appId;
      group.name = manifest.name;
    }
    group.files.sort(
      (a, b) =>
        Number(b.kind === "executable") - Number(a.kind === "executable") ||
        b.size - a.size,
    );
    result.candidates.push(group);
  }
  result.candidates.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  if (result.limited)
    result.warnings.push(
      "已达到扫描范围上限。请缩小到游戏所在文件夹后再次扫描。",
    );
  options.onProgress?.({
    visited: result.visited,
    found: result.candidates.length,
    directory: "",
  });
  return result;
}
