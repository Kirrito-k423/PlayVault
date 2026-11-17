import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { localEnvironment } from "./environment.mjs";
const root = path.resolve("."),
  directory = path.join(root, ".test-data", `visual-${randomUUID()}`);
const app = await electron.launch({
  args: ["."],
  env: { ...localEnvironment(), PLAYVAULT_DATA_DIR: directory },
  timeout: 45000,
});
const page = await app.firstWindow(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await fs.mkdir(path.join(root, "artifacts", "v02"), { recursive: true });
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll(
        ".launcher-backdrop,.game-logo,.deck-cover img,.promotion-trailer img",
      ),
    ].every((i) => i.complete && i.naturalWidth > 0),
  );
  await page.screenshot({
    path: path.join(root, "artifacts", "v02", name + ".png"),
    animations: "disabled",
  });
};
try {
  console.log(
    await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workAreaSize),
  );
  await page.locator(".launcher-stage").waitFor();
  await page.getByRole("button", { name: "进入游戏主页", exact: true }).click({ trial: true });
  await shot("00-collection-default");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 720),
  );
  await shot("01-collection");
  await page.getByRole("button", { name: "选择 剑星", exact: true }).click();
  await shot("02-stellar-collection");
  await page.getByRole("button", { name: "进入游戏主页", exact: true }).click();
  await shot("03-stellar-game");
  await page.getByRole("button", { name: "评分与奖项", exact: true }).click();
  await page.getByText("获奖与提名", { exact: true }).waitFor();
  await shot("04-scores");
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await page.getByRole("button", { name: "游戏库", exact: true }).click();
  await page.locator(".grid-game").first().waitFor();
  await page.screenshot({
    path: path.join(root, "artifacts", "v02", "05-library.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1600, 900),
  );
  await shot("06-stellar-wide");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1000, 650),
  );
  await shot("07-stellar-compact");
  await page.getByRole("button", { name: "游戏主页", exact: true }).click();
  await page.getByRole("button", { name: "进入游戏主页", exact: true }).click({ trial: true });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Launcher visual flows passed.");
} finally {
  await app.close();
  const relative = path.relative(path.join(root, ".test-data"), directory);
  if (relative.startsWith("visual-") && !relative.includes(".."))
    await fs.rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300,
    });
}
