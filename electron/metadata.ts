import type { Game, SourceUpdate, CriticScore } from "../shared/types";
import { metadataIdentity } from "../shared/metadata";
import { refreshSteam, type Fetcher } from "./steam";

async function json(fetcher: Fetcher, url: string, body?: object) {
  const response = await fetcher(url, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "PlayVault/0.2.1 (personal local game catalog)",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`资料站返回 HTTP ${response.status}`);
  return response.json();
}
function playerScore(
  game: Game,
  name: string,
  score: number | null | undefined,
  max: number,
  count: number,
  url: string,
  formula: string,
) {
  if (
    score == null ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > max ||
    !Number.isSafeInteger(count) ||
    count <= 0
  )
    return;
  const record: CriticScore = {
    name,
    score,
    max,
    url,
    fetchedAt: new Date().toISOString(),
    platform: `${count.toLocaleString("zh-CN")} 人评分 · ${formula}`,
  };
  game.critics = [...game.critics.filter((c) => c.name !== name), record];
}
export async function refreshMetadata(
  game: Game,
  fetcher: Fetcher,
): Promise<SourceUpdate> {
  const identity = metadataIdentity(game);
  if (!identity) throw new Error("尚未关联可同步的游戏资料来源");
  if (identity.provider === "Steam") return refreshSteam(game, fetcher);
  const next = structuredClone(game);
  const url = next.metadataUrl!;
  if (identity.provider === "VNDB") {
    const data = await json(fetcher, "https://api.vndb.org/kana/vn", {
      filters: ["id", "=", identity.id],
      results: 1,
      fields:
        "title,alttitle,titles{title,lang},released,rating,votecount,image{url,sexual,violence},screenshots{url,sexual,violence,dims},developers{name,original}",
    });
    const v = data.results?.[0];
    if (!v || v.id !== identity.id)
      throw new Error("VNDB 未返回已匹配的游戏条目");
    next.originalName = v.alttitle || v.title;
    next.releaseDate = v.released || next.releaseDate;
    next.developers = (v.developers || []).map(
      (d: any) => d.original || d.name,
    );
    next.genres = [...new Set([...next.genres, "视觉小说"])];
    const developer = next.developers.join("、") || "独立开发者";
    next.description = `由 ${developer} 制作的视觉小说。${v.released ? `首次发行于 ${v.released}。` : ""}原名：${next.originalName}。`;
    if (v.image?.sexual === 0 && v.image?.violence === 0)
      next.poster = v.image.url;
    const safe = (v.screenshots || []).filter(
      (s: any) =>
        s.sexual === 0 && s.violence === 0 && s.dims?.[0] > s.dims?.[1],
    );
    next.screenshots = safe.slice(0, 4).map((s: any) => s.url);
    next.hero ||= next.screenshots[0] || next.poster;
    next.poster ||= next.screenshots[0] || next.hero;
    next.backdrop ||= next.hero;
    playerScore(
      next,
      "VNDB 玩家评分",
      v.rating == null ? null : Math.round(v.rating * 10) / 100,
      10,
      v.votecount,
      url,
      "贝叶斯评分",
    );
  } else if (identity.provider === "Bangumi") {
    const v = await json(
      fetcher,
      `https://api.bgm.tv/v0/subjects/${identity.id}`,
    );
    if (String(v.id) !== identity.id || v.type !== 4)
      throw new Error("Bangumi 条目不是所匹配的游戏");
    next.name = v.name_cn || next.name;
    next.originalName = v.name || next.originalName;
    next.releaseDate = v.date || next.releaseDate;
    const find = (names: string[]) =>
      (v.infobox || [])
        .filter((i: any) => names.includes(i.key))
        .flatMap((i: any) =>
          typeof i.value === "string"
            ? [i.value]
            : Array.isArray(i.value)
              ? i.value.map((x: any) => x.v).filter(Boolean)
              : [],
        );
    const makers = find([
      "开发",
      "开发商",
      "遊戲開發商",
      "游戏开发商",
      "制作",
      "製作",
    ]);
    if (makers.length) next.developers = [...new Set(makers)] as string[];
    const genre = find(["游戏类型", "遊戲類型"]);
    next.genres = genre.length ? genre : next.genres.length ? next.genres : [];
    next.description = `${next.developers.length ? `由 ${next.developers.join("、")} 制作。` : ""}${v.date ? `首次发行于 ${v.date}。` : ""}原名：${next.originalName}。`;
    // Image suitability is not classified by this API; the reviewed batch supplies cover art separately.
    playerScore(
      next,
      "Bangumi 玩家评分",
      v.rating?.total,
      10,
      Number(
        v.rating?.total_count ??
          Object.values(v.rating?.count || {}).reduce(
            (n: number, x: any) => n + Number(x),
            0,
          ),
      ),
      url,
      "资料站玩家评分",
    );
  } else {
    const [data, statistics] = await Promise.all([
      json(
        fetcher,
        `https://www.dlsite.com/maniax/api/=/product.json?workno=${identity.id}`,
      ),
      json(
        fetcher,
        `https://www.dlsite.com/maniax/product/info/ajax?product_id=${identity.id}`,
      )
        .then((data) => data[identity.id])
        .catch(() => null),
    ]);
    const v = (Array.isArray(data) ? data : [data]).find(
      (v: any) => v.workno?.toUpperCase() === identity.id,
    );
    if (!v?.work_name) throw new Error("DLsite 未返回对应的作品编号");
    next.developers = v.maker_name ? [v.maker_name] : next.developers;
    next.releaseDate = v.regist_date?.slice(0, 10) || next.releaseDate;
    next.genres = v.work_type_string ? [v.work_type_string] : next.genres;
    next.description = `${v.maker_name ? `由 ${v.maker_name} 制作的 Windows 游戏。` : "Windows 游戏。"}${next.releaseDate ? `发行日期：${next.releaseDate}。` : ""}作品编号：${identity.id}。`;
    // Store catalog facts, without importing unclassified promotional media.
    const counts = v.rate_count_detail || {};
    const count =
      statistics?.rate_count ??
      (Array.isArray(counts)
        ? counts.reduce((n: number, c: any) => n + Number(c.count || 0), 0)
        : Object.values(counts).reduce(
            (n: number, c: any) =>
              n + Number(typeof c === "object" ? c.count || 0 : c),
            0,
          ));
    const roundedStars = Number(v.rate_average_star);
    const score =
      statistics?.rate_average_2dp ??
      (roundedStars > 5 ? roundedStars / 10 : roundedStars || null);
    playerScore(next, "DLsite 购买者评分", score, 5, count, url, "购买者评价");
  }
  next.metadataAt = new Date().toISOString();
  return { game: next, warnings: [] };
}
