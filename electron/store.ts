import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Library, Game } from "../shared/types";
import { GAME_CATEGORIES } from "../shared/categories";

export function validateLibrary(value: unknown): Library {
  const obj = value as Library;
  if (
    !obj ||
    obj.version !== 1 ||
    !Array.isArray(obj.games) ||
    !Array.isArray(obj.roots) ||
    !obj.settings ||
    obj.games.length > 20000
  )
    throw new Error("不是有效的游迹备份文件");
  const ids = new Set<string>();
  for (const game of obj.games) {
    if (
      !game ||
      typeof game.id !== "string" ||
      !game.id ||
      ids.has(game.id) ||
      typeof game.name !== "string" ||
      !game.name.trim() ||
      !Array.isArray(game.files)
    )
      throw new Error("备份中的游戏记录无效");
    ids.add(game.id);
    if (
      game.categories !== undefined &&
      (!Array.isArray(game.categories) ||
        !game.categories.every((c) => GAME_CATEGORIES.some(([id]) => id === c)))
    )
      throw new Error("备份中的游戏类型无效");
    if (
      game.steamAppId !== undefined &&
      (!Number.isSafeInteger(game.steamAppId) || game.steamAppId <= 0)
    )
      throw new Error("Steam App ID 无效");
    if (!Number.isFinite(game.playtimeSeconds) || game.playtimeSeconds < 0)
      throw new Error("游戏时长无效");
    for (const file of game.files)
      if (
        !file ||
        typeof file.id !== "string" ||
        typeof file.path !== "string" ||
        !path.isAbsolute(file.path) ||
        !["executable", "archive", "installer", "disc"].includes(file.kind) ||
        !Number.isFinite(file.size) ||
        file.size < 0
      )
        throw new Error("备份中包含无效的本地文件");
    if (
      ![
        "originalName",
        "description",
        "hero",
        "poster",
        "releaseDate",
        "addedAt",
      ].every(
        (k) =>
          typeof (game as unknown as Record<string, unknown>)[k] === "string",
      )
    )
      throw new Error("备份字段不完整");
    for (const key of ["genres", "developers", "screenshots", "gifs"])
      if (
        !Array.isArray(game[key as keyof Game]) ||
        !(game[key as keyof Game] as unknown[]).every(
          (v) => typeof v === "string",
        )
      )
        throw new Error("备份中的列表无效");
    if (
      !Array.isArray(game.movies) ||
      !game.movies.every(
        (m) =>
          m &&
          typeof m.url === "string" &&
          typeof m.name === "string" &&
          typeof m.thumbnail === "string",
      )
    )
      throw new Error("备份的视频无效");
    if (
      !Array.isArray(game.critics) ||
      !game.critics.every(
        (c) =>
          c &&
          typeof c.name === "string" &&
          typeof c.url === "string" &&
          Number.isFinite(c.score) &&
          Number.isFinite(c.max) &&
          c.max > 0 &&
          c.score >= 0 &&
          c.score <= c.max,
      )
    )
      throw new Error("备份的评分无效");
    if (
      !Array.isArray(game.awards) ||
      !game.awards.every(
        (a) =>
          a &&
          typeof a.organization === "string" &&
          typeof a.category === "string" &&
          typeof a.url === "string" &&
          Number.isInteger(a.year) &&
          ["winner", "nominee"].includes(a.result),
      )
    )
      throw new Error("备份的奖项无效");
    // Reviews must contain valid counts; avoid rendering malformed external JSON.
    if (game.reviews)
      for (const k of ["all", "chinese", "other"] as const) {
        const s = game.reviews[k];
        if (
          !s ||
          !["positive", "negative", "total"].every(
            (n) =>
              Number.isSafeInteger(s[n as keyof typeof s]) &&
              Number(s[n as keyof typeof s]) >= 0,
          ) ||
          s.total !== s.positive + s.negative ||
          (s.percent !== null &&
            (!Number.isFinite(s.percent) || s.percent < 0 || s.percent > 100))
        )
          throw new Error("备份的 Steam 评分无效");
      }
  }
  if (
    !obj.roots.every((r) => typeof r === "string" && path.isAbsolute(r)) ||
    typeof obj.settings.installDirectory !== "string" ||
    !path.isAbsolute(obj.settings.installDirectory) ||
    typeof obj.settings.sevenZipPath !== "string" ||
    typeof obj.settings.autoRefresh !== "boolean"
  )
    throw new Error("备份设置无效");
  return structuredClone(obj);
}
export class LibraryStore {
  private library!: Library;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public directory: string) {}
  async load(): Promise<Library> {
    await fs.mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, "library.json");
    try {
      this.library = validateLibrary(
        JSON.parse(await fs.readFile(file, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          `游戏库读取失败，原文件已保留：${file}。${(error as Error).message}`,
        );
      this.library = {
        version: 1,
        games: [],
        roots: [],
        settings: {
          installDirectory: path.join(path.dirname(this.directory), "Games"),
          sevenZipPath: "",
          autoRefresh: true,
        },
      };
      await this.update(() => {});
    }
    return this.get();
  }
  get(): Library {
    return structuredClone(this.library);
  }
  update(fn: (library: Library) => void): Promise<Library> {
    const operation = this.queue.then(async () => {
      const next = this.get();
      fn(next);
      validateLibrary(next);
      const temp = path.join(this.directory, `.library-${randomUUID()}.tmp`);
      await fs.writeFile(temp, JSON.stringify(next, null, 2), {
        encoding: "utf8",
        flag: "wx",
      });
      await fs.rename(temp, path.join(this.directory, "library.json"));
      this.library = next;
      return this.get();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
