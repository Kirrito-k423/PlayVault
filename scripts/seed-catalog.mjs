import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = path.resolve("resources");
const verifiedAwards = JSON.parse(
  await fs.readFile(path.join(root, "awards.json"), "utf8"),
);
const curatedArt = JSON.parse(
  await fs.readFile(path.join(root, "art-sources.json"), "utf8"),
);
await fs.mkdir(path.join(root, "art"), { recursive: true });
const catalog = [
  [
    3489700,
    "剑星",
    "Stellar Blade",
    "在后末日世界中拯救濒临灭绝的人类，以凌厉的剑技揭开地球衰败之谜。",
    ["动作", "冒险", "角色扮演"],
    "SHIFT UP Corporation",
    "2025-06-11",
    "",
    [],
  ],
  [
    1245620,
    "艾尔登法环",
    "ELDEN RING",
    "在辽阔的交界地，踏上一段属于褪色者的旅途。探索相连的原野与迷宫，在一次次挑战中发现黄金律法背后的秘密。",
    ["开放世界", "类魂", "动作角色扮演"],
    "FromSoftware",
    "2022-02-25",
    "Rise, Tarnished.",
    [
      {
        organization: "TGA",
        year: 2022,
        category: "年度最佳游戏",
        result: "winner",
        url: "https://www.bandainamcoent.com/news/the-game-awards-2022-recap",
      },
      {
        organization: "TGA",
        year: 2022,
        category: "最佳角色扮演游戏",
        result: "winner",
        url: "https://www.bandainamcoent.com/news/the-game-awards-2022-recap",
      },
      {
        organization: "TGA",
        year: 2022,
        category: "最佳艺术指导",
        result: "winner",
        url: "https://www.bandainamcoent.com/news/the-game-awards-2022-recap",
      },
    ],
  ],
  [
    1086940,
    "博德之门 3",
    "Baldur’s Gate 3",
    "召集你的队伍，回到被遗忘的国度。每一次掷骰、每一段关系和每一个选择，都让这场冒险走向不同的结局。",
    ["角色扮演", "回合制", "剧情丰富"],
    "Larian Studios",
    "2023-08-03",
    "",
    [],
  ],
  [
    1091500,
    "赛博朋克 2077",
    "Cyberpunk 2077",
    "走进夜之城，成为雇佣兵 V。在霓虹与钢铁交织的都市里，用义体、武器与选择，寻找属于自己的传奇。",
    ["开放世界", "赛博朋克", "角色扮演"],
    "CD PROJEKT RED",
    "2020-12-10",
    "",
    [],
  ],
  [
    1145360,
    "哈迪斯",
    "Hades",
    "挥舞奥林匹斯众神赐予的武器，挑战变化莫测的冥界。一次次逃离、一次次重来，让每一次冒险都有新的故事。",
    ["动作", "Roguelike", "独立游戏"],
    "Supergiant Games",
    "2020-09-17",
    "",
    [],
  ],
  [
    367520,
    "空洞骑士",
    "Hollow Knight",
    "深入衰落的圣巢王国，探索幽暗的洞穴与古老的城市。在手绘的虫族世界里，揭开一段被遗忘的历史。",
    ["银河恶魔城", "探索", "独立游戏"],
    "Team Cherry",
    "2017-02-24",
    "",
    [],
  ],
  [
    292030,
    "巫师 3：狂猎",
    "The Witcher 3: Wild Hunt",
    "扮演猎魔人杰洛特，踏上寻找希里的旅途。在战火纷飞的北方诸国追猎怪物，在艰难的抉择中书写自己的命运。",
    ["开放世界", "角色扮演", "剧情丰富"],
    "CD PROJEKT RED",
    "2015-05-19",
    "",
    [],
  ],
];
function clean(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
async function curl(url, output) {
  const args = [
    "--fail",
    "--silent",
    "--show-error",
    "--location",
    "--max-time",
    "22",
  ];
  if (process.env.PLAYVAULT_SEED_PROXY)
    if (new URL(url).hostname !== "gmedia.playstation.com")
      args.push("--proxy", process.env.PLAYVAULT_SEED_PROXY);
  if (new URL(url).hostname === "gmedia.playstation.com")
    args.push("--noproxy", "*");
  if (output) args.push("--output", output);
  args.push(url);
  const r = await exec("curl.exe", args, {
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  return output ? null : JSON.parse(r.stdout);
}
const games = await Promise.all(
  catalog.map(
    async ([id, name, english, desc, genres, dev, date, , awards]) => {
      const game = {
        id: `catalog-${id}`,
        name,
        originalName: english,
        steamAppId: id,
        description: desc,
        genres,
        developers: [dev],
        releaseDate: date,
        hero: `playvault://catalog/art/${id}-hero.jpg`,
        poster: `playvault://catalog/art/${id}-poster.jpg`,
        screenshots: [],
        movies: [],
        gifs: [],
        critics: [],
        awards,
        files: [],
        favorite: false,
        playtimeSeconds: 0,
        addedAt: new Date().toISOString(),
        metadataUrl: `https://store.steampowered.com/app/${id}/`,
      };
      if (verifiedAwards[String(id)]) game.awards = verifiedAwards[String(id)];
      if (id === 3489700)
        try {
          await curl(
            curatedArt["3489700-overview.jpg"].asset,
            path.join(root, "art", "3489700-overview.jpg"),
          );
          game.backdrop = "playvault://catalog/art/3489700-overview.jpg";
        } catch {}
      try {
        await curl(
          `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/logo.png`,
          path.join(root, "art", `${id}-logo.png`),
        );
        game.logo = `playvault://catalog/art/${id}-logo.png`;
      } catch {}
      await Promise.allSettled(
        ["hero", "poster"].map(async (kind) => {
          const filename =
            kind === "hero" ? "library_hero.jpg" : "library_600x900_2x.jpg";
          await curl(
            `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/${filename}`,
            path.join(root, "art", `${id}-${kind}.jpg`),
          );
        }),
      );
      const results = await Promise.allSettled([
        curl(
          `https://store.steampowered.com/api/appdetails?appids=${id}&l=schinese&cc=cn`,
        ),
        ...["all", "schinese"].map((language) =>
          curl(
            `https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=${encodeURIComponent(JSON.stringify({ appid: id, filter: 0, languages: [language], day_range: 0, cursor: "*", review_type: 0, purchase_type: 1, num_per_page: 1, filter_offtopic_activity: true, display_language: "schinese" }))}`,
          ),
        ),
      ]);
      const d =
        results[0].status === "fulfilled"
          ? results[0].value[String(id)]?.data
          : null;
      if (d) {
        if (d.background_raw)
          try {
            await curl(
              d.background_raw,
              path.join(root, "art", `${id}-backdrop.jpg`),
            );
          } catch {}
        game.metadataAt = new Date().toISOString();
        if (d.short_description) game.description = clean(d.short_description);
        game.screenshots = (d.screenshots || [])
          .slice(0, 6)
          .map((s) => s.path_full);
        game.movies = (d.movies || [])
          .map((m) => ({
            name: clean(m.name),
            url: m.mp4?.max || m.mp4?.["480"] || m.webm?.max || m.hls_h264,
            thumbnail: m.thumbnail,
            preview: m.hls_h264?.replace(
              /hls_264_master\.m3u8(?:\?.*)?$/,
              "microtrailer.mp4",
            ),
          }))
          .filter((m) => m.url);
        game.gifs = [
          ...String(d.detailed_description || "").matchAll(
            /https:\/\/[^"<>\s]+\.gif(?:\?[^"<>\s]*)?/gi,
          ),
        ]
          .map((m) => m[0])
          .slice(0, 6);
        if (d.metacritic?.score)
          game.critics.push({
            name: "Metacritic",
            score: d.metacritic.score,
            max: 100,
            url: d.metacritic.url,
            fetchedAt: game.metadataAt,
            platform: "Steam 商店收录",
          });
      }
      if (
        results[1].status === "fulfilled" &&
        results[2].status === "fulfilled"
      ) {
        const read = (data) =>
          data.response?.query_summary ?? data.query_summary;
        const a = read(results[1].value),
          c = read(results[2].value);
        const s = (p, n) => ({
          positive: p,
          negative: n,
          total: p + n,
          percent: p + n ? Math.round((p / (p + n)) * 1000) / 10 : null,
        });
        if (
          a?.total_positive !== undefined &&
          c?.total_positive !== undefined &&
          a.total_positive >= c.total_positive &&
          a.total_negative >= c.total_negative
        )
          game.reviews = {
            all: s(a.total_positive, a.total_negative),
            chinese: s(c.total_positive, c.total_negative),
            other: s(
              a.total_positive - c.total_positive,
              a.total_negative - c.total_negative,
            ),
            fetchedAt: new Date().toISOString(),
            sourceUrl: `https://store.steampowered.com/app/${id}/#app_reviews_hash`,
          };
      }
      // Keep one real screenshot locally so every example works offline.
      if (game.screenshots[0]) {
        try {
          await curl(
            game.screenshots[0],
            path.join(root, "art", `${id}-screen.jpg`),
          );
          game.screenshots[0] = `playvault://catalog/art/${id}-screen.jpg`;
        } catch {}
      }
      if (game.movies[0]?.preview) {
        try {
          await curl(
            game.movies[0].preview,
            path.join(root, "art", `${id}-preview.mp4`),
          );
          game.movies[0].preview = `playvault://catalog/art/${id}-preview.mp4`;
        } catch {}
      }
      if (game.movies[0]?.thumbnail)
        try {
          await curl(
            game.movies[0].thumbnail,
            path.join(root, "art", `${id}-trailer.jpg`),
          );
          game.movies[0].thumbnail = `playvault://catalog/art/${id}-trailer.jpg`;
        } catch {}
      console.log(
        `${name}: art ready, details=${!!d}, reviews=${!!game.reviews}, movies=${game.movies.length}`,
      );
      return game;
    },
  ),
);
await fs.writeFile(
  path.join(root, "catalog.json"),
  JSON.stringify(games, null, 2),
  "utf8",
);
