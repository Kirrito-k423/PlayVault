import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { localEnvironment } from "./environment.mjs";
const exec = promisify(execFile);
let sevenZip = process.env.PLAYVAULT_7ZIP;
if (!sevenZip) {
  const candidates = [
    path.join(
      process.env.ProgramFiles || "C:\\Program Files",
      "7-Zip",
      "7z.exe",
    ),
    "D:\\Program Files\\7-Zip\\7z.exe",
    "E:\\commonSoftware\\7-Zip\\7z.exe",
  ];
  for (const candidate of candidates) {
    if (
      await fs
        .stat(candidate)
        .then((s) => s.isFile())
        .catch(() => false)
    ) {
      sevenZip = candidate;
      break;
    }
  }
}
if (!sevenZip)
  throw new Error(
    "E2E requires 7-Zip. Set PLAYVAULT_7ZIP to the absolute path of 7z.exe.",
  );
const workspace = path.resolve(".");
const root = path.join(workspace, ".test-data", `e2e-${randomUUID()}`);
const fixture = path.join(root, "games", "Fixture Adventure");
await fs.mkdir(fixture, { recursive: true });
await fs.mkdir(path.join(workspace, "artifacts"), { recursive: true });
const cs = path.join(root, "Fixture.cs"),
  exe = path.join(fixture, "Fixture.exe");
await fs.writeFile(
  cs,
  'using System; using System.IO; using System.Threading; class Game { static void Main() { File.WriteAllText(Path.Combine(Environment.CurrentDirectory,"started.txt"),"started"); Thread.Sleep(2500); } }',
);
await exec(
  path.join(
    process.env.WINDIR || "C:\\Windows",
    "Microsoft.NET",
    "Framework64",
    "v4.0.30319",
    "csc.exe",
  ),
  ["/nologo", "/target:winexe", `/out:${exe}`, cs],
  { windowsHide: true },
);
const zip = path.join(fixture, "Fixture.zip");
await exec(sevenZip, ["a", "-tzip", zip, "Fixture.exe"], {
  cwd: fixture,
  windowsHide: true,
});
const originalZip = await fs.readFile(zip);
let application;
const env = {
  ...localEnvironment(),
  PLAYVAULT_DATA_DIR: path.join(root, "data"),
};
const errors = [];
async function launch() {
  application = await electron.launch({ args: ["."], env, timeout: 45000 });
  const page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator(".launcher-stage").waitFor();
  return page;
}
try {
  let page = await launch();
  // Exercise the scan UI with actual Windows files, without mocking the bridge.
  await page.getByRole("button", { name: "扫描导入", exact: true }).click();
  await page
    .getByRole("textbox", { name: "扫描目录路径" })
    .pressSequentially(path.join(root, "games"), { delay: 2 });
  await expect(
    page.getByRole("textbox", { name: "扫描目录路径" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "添加路径", exact: true }).click();
  await page.getByRole("button", { name: "开始扫描", exact: true }).click();
  await page.getByRole("heading", { name: "发现 1 个可能的游戏" }).waitFor();
  await page.getByRole("button", { name: "加入游戏库", exact: true }).click();
  await page
    .getByRole("heading", { name: "Fixture Adventure", exact: true })
    .waitFor();
  const saved = JSON.parse(
    await fs.readFile(path.join(root, "data", "library.json"), "utf8"),
  );
  expect(saved.games).toHaveLength(1);
  expect(saved.games[0].files).toHaveLength(2);
  // Launch only our compiled fixture; it writes a marker using the selected cwd.
  await page.getByRole("button", { name: "开始游戏", exact: true }).click();
  await expect
    .poll(
      async () =>
        fs.readFile(path.join(fixture, "started.txt"), "utf8").catch(() => ""),
      { timeout: 15000 },
    )
    .toBe("started");
  await expect
    .poll(
      () =>
        page.evaluate(
          async () => (await window.playvault.state()).runningGameIds.length,
        ),
      { timeout: 10000 },
    )
    .toBe(0);
  await expect(
    page.getByRole("button", { name: "开始游戏", exact: true }),
  ).toBeEnabled();
  // Edit matching and persist a custom title/description.
  await page.getByRole("button", { name: "本地文件 2", exact: true }).click();
  await page
    .getByRole("button", { name: "编辑游戏 / 选择启动项", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "游戏名称", exact: true })
    .fill("测试冒险");
  await page
    .getByRole("textbox", { name: "游戏介绍", exact: true })
    .fill("用于验证扫描、启动和持久化的本地测试游戏。");
  await page.getByRole("button", { name: "保存更改", exact: true }).click();
  await page
    .getByRole("dialog", { name: "测试冒险", exact: true })
    .getByRole("heading", { name: "测试冒险", exact: true })
    .waitFor();
  // Read-only metadata refresh: real public Steam endpoint through system networking.
  const catalog = await page.evaluate(() => window.playvault.state());
  expect(catalog.catalog[0].reviews.all.total).toBeGreaterThan(0);
  // Extract the archive through the actual modal and verify source bytes.
  await page.getByRole("button", { name: "解压安装", exact: true }).click();
  await page
    .getByRole("textbox", { name: "目标父目录", exact: true })
    .fill(path.join(root, "installed"));
  await page.getByRole("button", { name: "开始解压", exact: true }).click();
  await expect
    .poll(
      async () =>
        fs
          .stat(path.join(root, "installed", "测试冒险", "Fixture.exe"))
          .then((s) => s.isFile())
          .catch(() => false),
      { timeout: 30000 },
    )
    .toBe(true);
  await expect(
    page.getByRole("dialog", { name: "让冒险准备就绪" }),
  ).toHaveCount(0);
  expect(await fs.readFile(zip)).toEqual(originalZip);
  // Importing the same candidate twice is idempotent.
  const dedup = await page.evaluate(
    async (roots) => {
      const r = await window.playvault.scan(roots);
      await window.playvault.importCandidates(r.candidates.map((c) => c.id));
      return window.playvault.importCandidates(r.candidates.map((c) => c.id));
    },
    [path.join(root, "games")],
  );
  expect(dedup.games).toHaveLength(1);
  expect(dedup.games[0].files).toHaveLength(3);
  // Merge a separate copy from another directory into the same game.
  const copy = path.join(root, "other-drive", "FixtureCopy.exe");
  await fs.mkdir(path.dirname(copy), { recursive: true });
  await fs.copyFile(exe, copy);
  const merged = await page.evaluate(
    async ({ copy, targetId }) => {
      const added = await window.playvault.addGame({
        name: "另一份副本",
        path: copy,
      });
      const source = added.games.find((g) => g.name === "另一份副本");
      return window.playvault.mergeGames(source.id, targetId);
    },
    { copy, targetId: dedup.games[0].id },
  );
  expect(merged.games).toHaveLength(1);
  expect(merged.games[0].files).toHaveLength(4);
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  // Add a source-backed media score through the real editor.
  await page.getByRole("button", { name: "更多游戏选项", exact: true }).click();
  await page
    .getByRole("button", { name: "管理媒体分数与奖项", exact: true })
    .click();
  await page.getByRole("button", { name: "添加媒体", exact: true }).click();
  await page
    .getByRole("textbox", { name: "媒体名称", exact: true })
    .fill("TestCritic");
  await page.getByRole("spinbutton", { name: "得分", exact: true }).fill("88");
  await page
    .getByRole("textbox", { name: "来源链接", exact: true })
    .fill("https://example.com/test-review");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  // Favorite and restore on relaunch.
  await page.getByRole("button", { name: "收藏游戏", exact: true }).click();
  await page.screenshot({
    path: path.join(workspace, "artifacts", "07-local-library.png"),
    animations: "disabled",
  });
  await application.close();
  page = await launch();
  await page.getByRole("heading", { name: "测试冒险", exact: true }).waitFor();
  const reloaded = await page.evaluate(() => window.playvault.state());
  expect(reloaded.library.games[0].favorite).toBe(true);
  expect(reloaded.library.games[0].files).toHaveLength(4);
  expect(reloaded.library.games[0].critics[0].score).toBe(88);
  expect(reloaded.library.roots).toEqual([path.join(root, "games")]);
  expect(reloaded.library.games[0].playtimeSeconds).toBeGreaterThanOrEqual(2);
  // Check the custom protocol actually streams offline video, not just a poster.
  await page.getByRole("button", { name: "游戏库", exact: true }).click();
  await page.getByRole("button", { name: /^资料探索/ }).click();
  await page.locator(".grid-game").filter({ hasText: "艾尔登法环" }).click();
  await page.getByRole("button", { name: "动态背景", exact: true }).click();
  await expect
    .poll(() => page.locator(".hero-video").evaluate((v) => v.readyState), {
      timeout: 15000,
    })
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "观看预告", exact: true }).click();
  await page.getByRole("dialog", { name: "游戏影像" }).waitFor();
  await expect
    .poll(
      () => page.locator(".player-stage video").evaluate((v) => v.readyState),
      { timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(
      () => page.locator(".player-stage video").evaluate((v) => v.currentTime),
      { timeout: 20000 },
    )
    .toBeGreaterThan(3);
  await page.screenshot({
    path: path.join(workspace, "artifacts", "08-video-player.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  const live = await page.evaluate(() =>
    window.playvault.refreshCatalog(1245620),
  );
  if (live.warnings.length)
    throw new Error(`Live Steam refresh failed: ${live.warnings.join("; ")}`);
  expect(Date.now() - Date.parse(live.game.reviews.fetchedAt)).toBeLessThan(
    120000,
  );
  console.log(
    "Desktop E2E passed: scan → import → launch → edit → extract → deduplicate → favorite → restart → offline motion → HLS video → live Steam refresh.",
  );
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await application?.close().catch(() => {});
  // Only delete the uniquely allocated fixture under this workspace.
  const relative = path.relative(path.join(workspace, ".test-data"), root);
  if (
    relative.startsWith("e2e-") &&
    !relative.includes("..") &&
    !path.isAbsolute(relative)
  )
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 500,
    });
}
