import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyGame } from "../electron/core";
import { refreshMetadata } from "../electron/metadata";
import { metadataIdentity, normalizedTitle } from "../shared/metadata";

test("matching retains sequel numbers and removes trademarks before Unicode normalization", () => {
  assert.equal(
    normalizedTitle("EA SPORTS FC™ 24"),
    normalizedTitle("EA SPORTS FC 24"),
  );
  assert.equal(
    normalizedTitle("EA SPORTS™ FIFA 23"),
    normalizedTitle("EA SPORTS FIFA 23"),
  );
  assert.notEqual(
    normalizedTitle("美少女万華鏡 2"),
    normalizedTitle("美少女万華鏡 2.5"),
  );
});

test("metadata refresh accepts only recognized source hosts and canonical identifiers", () => {
  assert.deepEqual(
    metadataIdentity({ metadataUrl: "https://vndb.org/v4806" }),
    { provider: "VNDB", id: "v4806" },
  );
  for (const metadataUrl of [
    "https://vndb.org.example.com/v4806",
    "http://127.0.0.1/v4806",
    "https://vndb.org/v4806/other",
    "https://bgm.tv/subject/../../1",
  ])
    assert.equal(metadataIdentity({ metadataUrl }), null);
});

test("VNDB preserves local identity and imports only nonsexual promotional imagery", async () => {
  const game = emptyGame("Noble Works");
  game.metadataUrl = "https://vndb.org/v4806";
  game.files = [
    {
      id: "local-exe",
      path: "E:\\Games\\Noble Works\\game.exe",
      kind: "executable",
      available: true,
      size: 1000,
    },
  ];
  game.launchFileId = "local-exe";
  const result = await refreshMetadata(game, async (url, init) => {
    assert.equal(url, "https://api.vndb.org/kana/vn");
    assert.deepEqual(JSON.parse(String(init?.body)).filters, [
      "id",
      "=",
      "v4806",
    ]);
    return Response.json({
      results: [
        {
          id: "v4806",
          title: "Noble Works",
          alttitle: "のーぶる☆わーくす",
          released: "2010-12-24",
          developers: [{ name: "Yuzusoft" }],
          rating: 72.5,
          votecount: 3594,
          image: {
            url: "https://t.vndb.org/unsafe.jpg",
            sexual: 1,
            violence: 0,
          },
          screenshots: [
            {
              url: "https://t.vndb.org/safe.jpg",
              sexual: 0,
              violence: 0,
              dims: [1280, 720],
            },
            {
              url: "https://t.vndb.org/other.jpg",
              sexual: 2,
              violence: 0,
              dims: [1280, 720],
            },
          ],
        },
      ],
    });
  });
  assert.equal(result.game.poster, "https://t.vndb.org/safe.jpg");
  assert.equal(result.game.hero, "https://t.vndb.org/safe.jpg");
  assert.deepEqual(result.game.screenshots, ["https://t.vndb.org/safe.jpg"]);
  assert.equal(result.game.critics[0].name, "VNDB 玩家评分");
  assert.equal(result.game.critics[0].score, 7.25);
  assert.equal(result.game.critics[0].max, 10);
  assert.deepEqual(result.game.files, game.files);
  assert.equal(result.game.launchFileId, game.launchFileId);
  assert.equal(game.metadataAt, undefined);
});

test("Bangumi rejects anime or a different game returned by the source", async () => {
  const game = emptyGame("Test");
  game.metadataUrl = "https://bgm.tv/subject/1";
  await assert.rejects(
    refreshMetadata(game, async () => Response.json({ id: 1, type: 2 })),
    /不是所匹配的游戏/,
  );
  await assert.rejects(
    refreshMetadata(game, async () => Response.json({ id: 2, type: 4 })),
    /不是所匹配的游戏/,
  );
});

test("DLsite uses the exact product code, a five-point buyer score and no unclassified media", async () => {
  const game = emptyGame("本地作品");
  game.metadataUrl =
    "https://www.dlsite.com/maniax/work/=/product_id/RJ061178.html";
  const result = await refreshMetadata(game, async (url) =>
    url.includes("/product/info/ajax")
      ? Response.json({ RJ061178: { rate_average_2dp: 4.41, rate_count: 200 } })
      : Response.json([
          {
            workno: "RJ061178",
            work_name: "作品",
            maker_name: "制作方",
            regist_date: "2010-04-16 00:00:00",
            rate_average_star: 45,
            rate_count_detail: [{ count: 20 }],
            image_main: "https://example.com/unclassified.jpg",
          },
        ]),
  );
  assert.equal(result.game.name, game.name);
  assert.equal(result.game.poster, "");
  assert.equal(result.game.critics[0].score, 4.41);
  assert.equal(result.game.critics[0].max, 5);
  assert.equal(result.game.releaseDate, "2010-04-16");
});
