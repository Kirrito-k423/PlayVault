import type { Game } from "./types";

export function normalizedTitle(title: string): string {
  return title
    .replace(/[™®©]/g, "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function metadataIdentity(
  game: Pick<Game, "steamAppId" | "metadataUrl">,
): { provider: "Steam" | "VNDB" | "Bangumi" | "DLsite"; id: string } | null {
  if (game.steamAppId)
    return { provider: "Steam", id: String(game.steamAppId) };
  try {
    const url = new URL(game.metadataUrl || "");
    if (url.protocol !== "https:") return null;
    if (url.hostname === "vndb.org" && /^\/v\d+\/?$/.test(url.pathname))
      return { provider: "VNDB", id: url.pathname.replaceAll("/", "") };
    if (
      ["bgm.tv", "bangumi.tv"].includes(url.hostname) &&
      /^\/subject\/\d+\/?$/.test(url.pathname)
    )
      return { provider: "Bangumi", id: url.pathname.split("/")[2] };
    const product = url.pathname.match(
      /\/product_id\/((?:RJ|RE)\d{5,8})\.html$/i,
    );
    if (url.hostname === "www.dlsite.com" && product)
      return { provider: "DLsite", id: product[1].toUpperCase() };
  } catch {}
  return null;
}

export function metadataSourceLabel(
  game: Pick<Game, "steamAppId" | "metadataUrl">,
): string {
  const source = metadataIdentity(game);
  if (source) return `${source.provider} 资料`;
  try {
    const url = new URL(game.metadataUrl || "");
    if (
      url.hostname === "lol.qq.com" ||
      url.hostname === "www.leagueoflegends.com"
    )
      return "英雄联盟官网";
    if (url.hostname === "www.nintendo.com") return "任天堂官方资料";
  } catch {}
  return "资料来源";
}
