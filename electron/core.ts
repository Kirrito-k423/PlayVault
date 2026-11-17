import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Game, ReviewSummary, SteamReviews } from "../shared/types";

export { classifyFile } from "../shared/files";
export function cleanTitle(value: string): string {
  return (
    value
      .replace(/\.(7z|zip)\.001$|\.part0*1\.rar$|\.(exe|zip|7z|rar|iso)$/gi, "")
      .replace(/[._]/g, " ")
      .replace(/\[.*?\]|\(.*?(repack|fitgirl|dodi|免安装|中文版).*?\)/gi, " ")
      .replace(
        /\b(v\d+(\.\d+)*|build\s*\d+|fitgirl|dodi|repack|elamigos|rune|tenoke|codex)\b.*$/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim() || value
  );
}
export function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return (
    rel === "" ||
    (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))
  );
}
export function normalizeFilePath(value: string): string {
  return path.resolve(value).toLocaleLowerCase("en-US");
}
export function emptyGame(name: string, steamAppId?: number): Game {
  return {
    id: randomUUID(),
    name,
    originalName: name,
    steamAppId,
    description: "",
    genres: [],
    developers: [],
    releaseDate: "",
    hero: "",
    poster: "",
    screenshots: [],
    movies: [],
    gifs: [],
    critics: [],
    awards: [],
    files: [],
    favorite: false,
    playtimeSeconds: 0,
    addedAt: new Date().toISOString(),
  };
}
export function summary(positive: number, negative: number): ReviewSummary {
  if (
    !Number.isSafeInteger(positive) ||
    !Number.isSafeInteger(negative) ||
    positive < 0 ||
    negative < 0
  )
    throw new Error("Steam 返回了无效的评论数量");
  const total = positive + negative;
  return {
    positive,
    negative,
    total,
    percent: total ? Math.round((positive / total) * 1000) / 10 : null,
  };
}
export function combineReviews(
  all: ReviewSummary,
  chinese: ReviewSummary,
  appId: number,
  fetchedAt = new Date().toISOString(),
): SteamReviews {
  return {
    all,
    chinese,
    other: summary(
      all.positive - chinese.positive,
      all.negative - chinese.negative,
    ),
    fetchedAt,
    sourceUrl: `https://store.steampowered.com/app/${appId}/#app_reviews_hash`,
  };
}
export function safeDirectoryName(value: string): string {
  let name = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/, "")
    .slice(0, 100)
    .trim();
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name))
    name = `Game_${name || "Unknown"}`;
  return name;
}
export function validateArchiveListing(listing: string): {
  entries: number;
  bytes: number;
} {
  let entries = 0,
    bytes = 0;
  const paths = new Set<string>();
  for (const block of listing.replace(/\r/g, "").split(/\n\s*\n/)) {
    const props: Record<string, string> = Object.fromEntries(
      block
        .split("\n")
        .map((line) => {
          const i = line.indexOf(" = ");
          return i < 0 ? [] : [line.slice(0, i), line.slice(i + 3)];
        })
        .filter((x) => x.length === 2),
    );
    if (!props.Path) continue;
    const entry = props.Path.replace(/\\/g, "/");
    const components = entry.split("/");
    if (
      /^[\/\\]|^[a-z]:/i.test(entry) ||
      components.some(
        (p) =>
          p === ".." ||
          /[:\x00-\x1f<>"|?*]/.test(p) ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p),
      )
    )
      throw new Error(`压缩包含有不安全的路径：${entry}`);
    if (
      props["Symbolic Link"] ||
      props["Hard Link"] ||
      /(^|\s)l[rwx-]{9}/i.test(props.Attributes || "") ||
      props.Reparse ||
      props["Reparse Point"]
    )
      throw new Error("压缩包包含链接，已停止解压");
    if (props.Encrypted === "+")
      throw new Error("当前版本暂不支持加密压缩包，请先用 7-Zip 手动解密");
    const key = entry.toLowerCase().replace(/\/$/, "");
    if (paths.has(key)) throw new Error("压缩包包含重复文件路径，已停止解压");
    paths.add(key);
    const size = Number(props.Size || 0);
    if (!Number.isSafeInteger(size) || size < 0)
      throw new Error("压缩包文件大小无效");
    bytes += size;
    entries++;
    if (entries > 500000 || bytes > 2 * 1024 ** 4)
      throw new Error("压缩包超过安全处理上限，请使用 7-Zip 手动处理");
  }
  if (!entries) throw new Error("压缩包为空，或无法读取文件清单");
  return { entries, bytes };
}
