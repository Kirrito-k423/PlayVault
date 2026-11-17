import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { localEnvironment } from "./environment.mjs";
const root = path.resolve("."),
  data = path.join(root, ".test-data", "readme-" + randomUUID()),
  output = path.join(root, "docs", "screenshots");
await fs.mkdir(data, { recursive: true });
await fs.mkdir(output, { recursive: true });
const catalog = JSON.parse(
  await fs.readFile(path.join(root, "resources", "catalog.json"), "utf8"),
);
const library = {
  version: 1,
  games: catalog.map((g) => ({
    ...g,
    id: "demo-" + g.steamAppId,
    files: [],
    launchFileId: undefined,
    favorite: true,
  })),
  roots: [],
  settings: {
    installDirectory: path.join(data, "Games"),
    sevenZipPath: "",
    autoRefresh: false,
  },
};
await fs.writeFile(path.join(data, "library.json"), JSON.stringify(library));
const app = await electron.launch({
  args: ["."],
  env: { ...localEnvironment(), PLAYVAULT_DATA_DIR: data },
  timeout: 45000,
});
try {
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator(".launcher-stage").waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1600, 900),
  );
  async function shot(name) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll(
          ".launcher-backdrop,.game-logo,.promotion-trailer img",
        ),
      ].every((i) => i.complete && i.naturalWidth > 0),
    );
    await page.screenshot({
      path: path.join(output, name + ".jpg"),
      type: "jpeg",
      quality: 88,
      scale: "css",
      animations: "disabled",
    });
  }
  await page
    .getByRole("button", { name: "打开 剑星 主页", exact: true })
    .click();
  await shot("launcher");
  await page.getByRole("button", { name: "返回游戏总览", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "进入游戏主页", exact: true }),
  ).toBeVisible();
  await shot("collection");
  await page.getByRole("button", { name: "游戏库", exact: true }).click();
  await expect(page.locator(".grid-game")).toHaveCount(catalog.length);
  await shot("library");
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await page
    .getByRole("button", { name: "打开 艾尔登法环 主页", exact: true })
    .click();
  await page.getByRole("button", { name: "评分与奖项", exact: true }).click();
  await expect(page.locator(".rating-grid")).toBeVisible();
  await shot("scores");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "README screenshots captured with an isolated public demo library.",
  );
} finally {
  await app.close();
}
