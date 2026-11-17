import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  classifyFile,
  cleanTitle,
  combineReviews,
  emptyGame,
  isWithin,
  safeDirectoryName,
  summary,
  validateArchiveListing,
} from "../electron/core";
import { scanDirectories } from "../electron/scanner";
import { LibraryStore, validateLibrary } from "../electron/store";
import { isGameExecutable } from "../shared/files";
import { gameCategories, matchesCategory } from "../shared/categories";
import {
  appIdValue,
  refreshSteam,
  reviewUrl,
  searchSteam,
  type Fetcher,
} from "../electron/steam";
import { detectSevenZip, extractArchive } from "../electron/archive";
const root = path.resolve(".test-data");
await fs.mkdir(root, { recursive: true });
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await fs.mkdtemp(path.join(root, "core-"));
  t.after(async () => {
    assert.ok(isWithin(root, dir) && dir !== root);
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}
async function file(root: string, name: string, value = "data") {
  const full = path.join(root, name);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, value);
  return full;
}

test("classifies archives and only first volumes; excludes helpers", () => {
  assert.equal(classifyFile("eldenring.exe"), "executable");
  assert.equal(classifyFile("setup.exe"), "installer");
  assert.equal(classifyFile("Game.part01.exe"), "installer");
  for (const name of [
    "StarCraft-II-Setup.exe",
    "BD2StarterSetup.exe",
    "FFXIV_20220303_downloader.exe",
    "bh3-setup-200115.exe",
  ])
    assert.equal(classifyFile(name), "installer", name);
  assert.equal(classifyFile("God of War Ragnarok update 1.7.exe"), "installer");
  assert.equal(classifyFile("Pes2021转会1月18号.exe"), "installer");
  for (const n of [
    "Uninstall.exe",
    "UnityCrashHandler64.exe",
    "vc_redist.x64.exe",
    "EasyAntiCheat.exe",
    "文件检测工具.exe",
    "校验工具.exe",
    "RapidCRC.exe",
    "part.r00",
    "Game.part02.rar",
    "Game.7z.002",
  ])
    assert.equal(classifyFile(n), null, n);
  for (const n of [
    "Game.zip",
    "Game.7z",
    "Game.part01.rar",
    "Game.part1.rar",
    "Game.7z.001",
  ])
    assert.equal(classifyFile(n), "archive", n);
  assert.equal(classifyFile("Game.iso"), "disc");
  assert.equal(cleanTitle("ELDEN.RING.v1.16-FitGirl.7z"), "ELDEN RING");
});
test("remote game executables remain usable while stale validators and installers cannot launch", () => {
  const file = {
    id: "f",
    path: "V:\\Game\\MovieGal\\Example\\文件检测工具.exe",
    kind: "executable" as const,
    size: 135680,
    available: true,
  };
  assert.equal(isGameExecutable(file), false);
  assert.equal(
    isGameExecutable({
      ...file,
      path: "V:\\Games\\Hollow Knight\\Hollow Knight.exe",
    }),
    true,
  );
  assert.equal(
    isGameExecutable({ ...file, path: "V:\\Games\\Example.part01.exe" }),
    false,
  );
});
test("game type filters overlap, recognize local adult collections and keep unmatched separate", () => {
  const g = emptyGame("Example");
  g.files = [
    {
      id: "f",
      path: "S:\\Game18\\Example\\game.exe",
      kind: "executable",
      size: 1,
      available: true,
    },
  ];
  g.metadataUrl = "https://vndb.org/v1";
  g.metadataAt = "2026-11-17";
  assert.ok(matchesCategory(g, "adult"));
  assert.ok(matchesCategory(g, "visual-novel"));
  assert.ok(!matchesCategory(g, "unrecognized"));
  g.files[0].path = "V:\\Game\\MovieGal\\Example\\Example.part01.exe";
  g.metadataUrl = "";
  g.genres = ["策略", "动作"];
  assert.ok(matchesCategory(g, "fmv"));
  assert.ok(matchesCategory(g, "strategy"));
  assert.ok(matchesCategory(g, "action"));
  assert.ok(!matchesCategory(g, "adult"));
  delete g.metadataAt;
  assert.ok(gameCategories(g).includes("unrecognized"));
});
test("language summaries use complete review counts and handle zero reviews", () => {
  const result = combineReviews(
    summary(950, 50),
    summary(90, 10),
    1245620,
    "2026-11-17T00:00:00Z",
  );
  assert.equal(result.all.percent, 95);
  assert.equal(result.chinese.percent, 90);
  assert.deepEqual(result.other, summary(860, 40));
  assert.equal(result.other.total, 900);
  assert.equal(summary(0, 0).percent, null);
  assert.throws(() => summary(-1, 4));
  assert.throws(() => combineReviews(summary(2, 0), summary(3, 0), 1));
});
test("uses the current Steam reviews API with identical language query filters", () => {
  const url = new URL(reviewUrl(1, "schinese"));
  assert.equal(url.hostname, "api.steampowered.com");
  assert.match(url.pathname, /IUserReviewsService\/GetAppReviews\/v1/);
  const input = JSON.parse(url.searchParams.get("input_json")!);
  assert.deepEqual(input.languages, ["schinese"]);
  assert.equal(input.purchase_type, 1);
  assert.equal(input.day_range, 0);
  assert.equal(input.review_type, 0);
  assert.throws(() => appIdValue("NaN"));
  assert.throws(() => appIdValue(-1));
});
test("scanner groups game executables, recognizes Steam manifests, and does not traverse links", async (t) => {
  const dir = await fixture(t);
  await file(dir, "steamapps/common/EldenRing/Game/eldenring.exe");
  await file(dir, "steamapps/common/EldenRing/Engine/NotAGame.exe");
  await file(dir, "steamapps/common/EldenRing/Game/Uninstall.exe");
  await file(
    dir,
    "steamapps/appmanifest_1245620.acf",
    '"AppState" { "appid" "1245620" "name" "ELDEN RING" "installdir" "EldenRing" }',
  );
  await file(dir, "Archives/Hades/Hades.part01.rar");
  await file(dir, "Archives/Hades/Hades.part02.rar");
  await file(dir, "node_modules/fake.exe");
  await file(dir, "Archives/Other/Game.zip");
  await file(dir, "Archives/RemoteMovie/文件检测工具.exe");
  await file(dir, "Archives/RemoteMovie/Film.part01.exe");
  const outside = await fixture(t);
  await file(outside, "secret.exe");
  await fs.symlink(outside, path.join(dir, "Linked"), "junction");
  const result = await scanDirectories([dir, path.join(dir, "steamapps")]);
  assert.ok(
    result.candidates.every(
      (c) =>
        !c.files.some((f) =>
          /secret|NotAGame|Uninstall|fake\.exe|文件检测工具/.test(f.path),
        ),
    ),
  );
  const steam = result.candidates.find((c) => c.steamAppId === 1245620);
  assert.ok(steam);
  assert.equal(steam.name, "ELDEN RING");
  assert.equal(steam.files.length, 1);
  const rar = result.candidates
    .flatMap((c) => c.files)
    .find((f) => f.path.endsWith("part01.rar"));
  assert.ok(rar);
  assert.equal(rar.parts, 2);
  assert.equal(
    result.candidates
      .flatMap((c) => c.files)
      .find((f) => f.path.endsWith("Film.part01.exe"))?.kind,
    "installer",
  );
  assert.ok(result.skipped >= 3);
  assert.equal(result.cancelled, false);
});
test("scanner cancellation and work limits return partial results without filesystem writes", async (t) => {
  const dir = await fixture(t);
  for (let i = 0; i < 30; i++) await file(dir, `Game${i}/game.exe`);
  const before = await fs.readdir(dir);
  const abort = new AbortController();
  abort.abort();
  assert.equal(
    (await scanDirectories([dir], { signal: abort.signal })).cancelled,
    true,
  );
  const limited = await scanDirectories([dir], { maxEntries: 5 });
  assert.equal(limited.limited, true);
  assert.ok(limited.warnings.length);
  assert.deepEqual(await fs.readdir(dir), before);
});
test("archive listing rejects traversal, ADS, absolute paths, links, duplicates and encryption", () => {
  const valid =
    "Path = folder\nSize = 0\nAttributes = D_ drwxr-xr-x\n\nPath = folder/game.exe\nSize = 100\nAttributes = A_ -rwxr-xr-x\n";
  assert.deepEqual(validateArchiveListing(valid), { entries: 2, bytes: 100 });
  for (const p of [
    "../escape.exe",
    "folder/../../escape.exe",
    "C:\\file.exe",
    "/root.exe",
    "\\\\server\\file",
    "file.txt:payload.exe",
    "folder/NUL.txt",
    "folder/name.",
  ])
    assert.throws(() => validateArchiveListing(`Path = ${p}\nSize = 1\n`), p);
  assert.throws(() =>
    validateArchiveListing("Path = link\nSymbolic Link = outside\nSize = 0\n"),
  );
  assert.throws(() =>
    validateArchiveListing("Path = link\nHard Link = outside\nSize = 0\n"),
  );
  assert.throws(() =>
    validateArchiveListing("Path = file\nSize = 0\nEncrypted = +\n"),
  );
  assert.throws(() =>
    validateArchiveListing(
      "Path = game.exe\nSize = 0\n\nPath = GAME.EXE\nSize = 0\n",
    ),
  );
  assert.throws(() =>
    validateArchiveListing("Path = large\nSize = 99999999999999999\n"),
  );
  assert.equal(safeDirectoryName("CON"), "Game_CON");
  assert.equal(safeDirectoryName("a/b:c"), "a_b_c");
  assert.equal(isWithin("E:\\Games", "E:\\Games2\\evil.exe"), false);
});
test("library writes serialize and survive reload; failed validation preserves previous library", async (t) => {
  const dir = await fixture(t),
    store = new LibraryStore(dir);
  await store.load();
  await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      store.update((lib) => {
        lib.games.push(emptyGame(`Game ${i}`));
      }),
    ),
  );
  assert.equal(store.get().games.length, 15);
  const copy = new LibraryStore(dir);
  await copy.load();
  assert.equal(copy.get().games.length, 15);
  const prior = await fs.readFile(path.join(dir, "library.json"), "utf8");
  await assert.rejects(
    store.update((lib) => {
      lib.games[0].name = "";
    }),
  );
  assert.equal(
    await fs.readFile(path.join(dir, "library.json"), "utf8"),
    prior,
  );
  const next = store.get();
  next.games[0].files = [
    {
      id: "1",
      path: "relative.exe",
      kind: "executable",
      size: 1,
      available: true,
    },
  ];
  assert.throws(() => validateLibrary(next));
});
test("corrupt library is reported and preserved rather than silently reset", async (t) => {
  const dir = await fixture(t);
  await file(dir, "library.json", "{broken");
  await assert.rejects(new LibraryStore(dir).load(), /原文件已保留/);
  assert.equal(
    await fs.readFile(path.join(dir, "library.json"), "utf8"),
    "{broken",
  );
});
test("Steam refresh handles new HLS trailers, strips HTML and calculates other-language totals", async () => {
  const fetcher: Fetcher = async (url) => {
    if (url.includes("appdetails"))
      return Response.json({
        "1": {
          success: true,
          data: {
            name: "<b>Game</b>",
            short_description: "<p>Hello &amp; world</p>",
            genres: [{ description: "RPG" }],
            developers: ["Dev"],
            movies: [
              {
                name: "Trailer",
                hls_h264:
                  "https://video.akamai.steamstatic.com/trailer/hls_264_master.m3u8",
                thumbnail: "https://example.com/thumbnail.jpg",
              },
            ],
            metacritic: {
              score: 90,
              url: "https://www.metacritic.com/game/game/",
            },
          },
        },
      });
    const input = JSON.parse(new URL(url).searchParams.get("input_json")!);
    return Response.json({
      response: {
        query_summary:
          input.languages[0] === "all"
            ? { total_positive: 95, total_negative: 5 }
            : { total_positive: 8, total_negative: 2 },
      },
    });
  };
  const result = await refreshSteam(emptyGame("Test", 1), fetcher);
  assert.equal(result.game.name, "Game");
  assert.equal(result.game.description, "Hello & world");
  assert.equal(result.game.movies.length, 1);
  assert.match(result.game.movies[0].url, /m3u8$/);
  assert.equal(result.game.reviews?.other.total, 90);
  assert.equal(result.game.critics[0].score, 90);
  assert.equal(result.warnings.length, 0);
});
test("network failures preserve cached scores and timestamp without claiming fresh data", async () => {
  const game = emptyGame("Test", 1);
  game.reviews = combineReviews(
    summary(90, 10),
    summary(8, 2),
    1,
    "2024-01-01T00:00:00Z",
  );
  const failed: Fetcher = async () => {
    throw new Error("Offline");
  };
  const result = await refreshSteam(game, failed);
  assert.equal(result.game.reviews?.fetchedAt, "2024-01-01T00:00:00Z");
  assert.equal(result.game.reviews?.stale, true);
  assert.equal(result.warnings.length, 2);
  assert.equal(game.reviews.stale, undefined);
});
test("archive extraction preserves source and refuses an existing destination", async (t) => {
  let exe: string;
  try {
    exe = await detectSevenZip();
  } catch {
    t.skip("7-Zip is not installed");
    return;
  }
  const dir = await fixture(t),
    source = path.join(dir, "source");
  await fs.mkdir(source);
  await file(source, "Game.exe", "not-an-executable-for-launch");
  const archive = path.join(dir, "Game.zip");
  await promisify(execFile)(exe, ["a", "-tzip", archive, "Game.exe"], {
    cwd: source,
    windowsHide: true,
  });
  const before = await fs.readFile(archive),
    parent = path.join(dir, "installed");
  const output = await extractArchive({
    archive,
    parent,
    name: "Game",
    sevenZip: exe,
  });
  assert.equal(
    await fs.readFile(path.join(output, "Game.exe"), "utf8"),
    "not-an-executable-for-launch",
  );
  assert.deepEqual(await fs.readFile(archive), before);
  await assert.rejects(
    extractArchive({ archive, parent, name: "Game", sevenZip: exe }),
    /目标已存在/,
  );
  assert.deepEqual(await fs.readFile(archive), before);
});
