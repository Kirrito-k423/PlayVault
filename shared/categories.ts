import type { Game } from "./types";

export const GAME_CATEGORIES = [
  ["all", "全部类型"],
  ["adult", "18+"],
  ["visual-novel", "视觉小说"],
  ["fmv", "互动影游"],
  ["strategy", "策略"],
  ["action", "动作"],
  ["other", "其他类型"],
  ["unrecognized", "未识别"],
] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number][0];

export function gameCategories(game: Game): GameCategory[] {
  const found = new Set<GameCategory>(game.categories || []);
  const genres = game.genres.join(" ");
  const paths = game.files.map((f) => f.path).join("\n");
  if (
    /(?:^|[\\/])(?:Game18|18\+|R18)(?:[\\/]|$)/i.test(paths) ||
    /18\+|R-?18|成人|色情|Erotic/i.test(genres) ||
    /dlsite\.com\/maniax\//i.test(game.metadataUrl || "")
  )
    found.add("adult");
  if (
    /视觉小说|視覺小說|ビジュアルノベル|Visual Novel/i.test(genres) ||
    /^https:\/\/vndb\.org\/v\d+/i.test(game.metadataUrl || "")
  )
    found.add("visual-novel");
  if (
    /影游|影遊|真人互动|真人互動|\bFMV\b|Interactive (?:Film|Movie)/i.test(
      genres,
    ) ||
    /[\\/]MovieGal[\\/]/i.test(paths)
  )
    found.add("fmv");
  if (/策略|战略|戰略|Strategy|MOBA|RTS|4X/i.test(genres))
    found.add("strategy");
  if (/动作|動作|Action|格斗|格鬥|射击|射擊/i.test(genres)) found.add("action");
  if (
    !["visual-novel", "fmv", "strategy", "action"].some((c) =>
      found.has(c as GameCategory),
    )
  )
    found.add("other");
  if (!game.metadataAt) found.add("unrecognized");
  return [...found];
}
export const matchesCategory = (game: Game, category: GameCategory) =>
  category === "all" || gameCategories(game).includes(category);
