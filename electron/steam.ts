import type { Game, SourceUpdate } from "../shared/types";
import { combineReviews, summary } from "./core";
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export const textOnly = (text: string) =>
  String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function appIdValue(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 0xffffffff)
    throw new Error("请输入有效的 Steam App ID");
  return id;
}
export function reviewUrl(appId: number, language: string): string {
  const input = {
    appid: appIdValue(appId),
    filter: 0,
    languages: [language],
    day_range: 0,
    cursor: "*",
    review_type: 0,
    purchase_type: 1,
    num_per_page: 1,
    filter_offtopic_activity: true,
    display_language: "schinese",
  };
  return `https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`;
}
async function json(fetcher: Fetcher, url: string): Promise<any> {
  const r = await fetcher(url, {
    signal: AbortSignal.timeout(18000),
    headers: { Accept: "application/json" },
  });
  if (!r.ok)
    throw new Error(
      r.status === 429
        ? "请求过于频繁，请稍后再刷新"
        : `数据源返回 HTTP ${r.status}`,
    );
  return r.json();
}
async function getReview(fetcher: Fetcher, appId: number, language: string) {
  const data = await json(fetcher, reviewUrl(appId, language));
  const q = data.response?.query_summary ?? data.query_summary;
  if (!q || q.total_positive === undefined || q.total_negative === undefined)
    throw new Error("Steam 暂未返回评论统计");
  return summary(Number(q.total_positive), Number(q.total_negative));
}
export async function refreshSteam(
  game: Game,
  fetcher: Fetcher,
): Promise<SourceUpdate> {
  const appId = appIdValue(game.steamAppId);
  const next = structuredClone(game),
    warnings: string[] = [];
  const [detailsResult, reviewsResult] = await Promise.allSettled([
    json(
      fetcher,
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=schinese&cc=cn`,
    ),
    Promise.all([
      getReview(fetcher, appId, "all"),
      getReview(fetcher, appId, "schinese"),
    ]),
  ]);
  if (detailsResult.status === "fulfilled") {
    const d = detailsResult.value[String(appId)];
    if (d?.success && d.data) {
      const v = d.data;
      next.name = textOnly(v.name) || next.name;
      next.description = textOnly(v.short_description) || next.description;
      next.developers = Array.isArray(v.developers)
        ? v.developers.map(textOnly)
        : next.developers;
      next.genres = Array.isArray(v.genres)
        ? v.genres.map((g: any) => textOnly(g.description))
        : next.genres;
      if (
        v.content_descriptors?.ids?.some((id: number) => id === 3 || id === 4)
      )
        next.categories = [
          ...new Set([...(next.categories || []), "adult" as const]),
        ];
      next.releaseDate = v.release_date?.date || next.releaseDate;
      next.screenshots =
        v.screenshots?.slice(0, 12).map((s: any) => s.path_full) ||
        next.screenshots;
      const movies = v.movies
        ?.map((m: any) => ({
          name: textOnly(m.name),
          url:
            m.mp4?.max ||
            m.mp4?.["480"] ||
            m.webm?.max ||
            m.webm?.["480"] ||
            m.hls_h264,
          thumbnail: m.thumbnail,
          preview: m.hls_h264?.replace(
            /hls_264_master\.m3u8(?:\?.*)?$/,
            "microtrailer.mp4",
          ),
        }))
        .filter((m: any) => typeof m.url === "string");
      if (movies?.length) next.movies = movies;
      const gifs = [
        ...String(v.detailed_description || "").matchAll(
          /https:\/\/[^"<>\s]+\.gif(?:\?[^"<>\s]*)?/gi,
        ),
      ].map((m) => m[0]);
      next.gifs = [...new Set([...next.gifs, ...gifs])].slice(0, 12);
      if (!next.hero)
        next.hero = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`;
      if (!next.poster)
        next.poster = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`;
      if (v.metacritic?.score)
        next.critics = [
          ...next.critics.filter((c) => c.name !== "Metacritic"),
          {
            name: "Metacritic",
            score: Number(v.metacritic.score),
            max: 100,
            url:
              v.metacritic.url ||
              `https://www.metacritic.com/search/${encodeURIComponent(next.name)}/`,
            fetchedAt: new Date().toISOString(),
            platform: "Steam 商店收录",
          },
        ];
      next.metadataAt = new Date().toISOString();
      next.metadataUrl = `https://store.steampowered.com/app/${appId}/`;
    } else
      warnings.push("Steam 商店暂无该游戏资料，可能是地区限制或 App ID 有误。");
  } else
    warnings.push(
      `宣传资料未更新：${detailsResult.reason?.message || "网络连接失败"}`,
    );
  if (reviewsResult.status === "fulfilled") {
    try {
      next.reviews = combineReviews(
        reviewsResult.value[0],
        reviewsResult.value[1],
        appId,
      );
    } catch {
      warnings.push("评论统计正在变化，请稍后重试；已保留上次数据。");
      if (next.reviews) next.reviews.stale = true;
    }
  } else {
    warnings.push(
      `Steam 评分未更新：${reviewsResult.reason?.message || "网络连接失败"}`,
    );
    if (next.reviews) next.reviews.stale = true;
  }
  return { game: next, warnings };
}
export async function searchSteam(
  query: string,
  fetcher: Fetcher,
): Promise<{ appId: number; name: string; image: string }[]> {
  const q = query.trim().slice(0, 120);
  if (!q) return [];
  const data = await json(
    fetcher,
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=schinese&cc=cn`,
  );
  return (data.items || []).slice(0, 16).map((i: any) => ({
    appId: appIdValue(i.id),
    name: textOnly(i.name),
    image: String(i.tiny_image || ""),
  }));
}
