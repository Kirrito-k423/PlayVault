import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { localEnvironment } from "./environment.mjs";
const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
const { NtExecutable, NtExecutableResource } = require("resedit");
const root = path.resolve(".");
const executable = path.join(root, "release", "win-unpacked", "PlayVault.exe");
const asarFile = path.join(path.dirname(executable), "resources", "app.asar");
const entries = NtExecutableResource.from(
  NtExecutable.from(await fs.readFile(executable)),
).entries;
const record = entries.find(
  (e) => e.type === "INTEGRITY" && e.id === "ELECTRONASAR",
);
if (!record)
  throw new Error("Packaged executable is missing its ASAR integrity resource");
const integrity = JSON.parse(Buffer.from(record.bin).toString("utf8"));
const hash = createHash("sha256")
  .update(asar.getRawHeader(asarFile).headerString)
  .digest("hex");
expect(integrity.some((e) => e.value === hash)).toBe(true);
expect(
  asar.listPackage(asarFile).filter((p) => p.includes("node_modules")),
).toHaveLength(0);
const dataDirectory = path.join(root, ".test-data", `packaged-${randomUUID()}`);
await fs.mkdir(path.join(root, "artifacts", "v02"), { recursive: true });
const application = await electron.launch({
  executablePath: executable,
  args: [],
  env: { ...localEnvironment(), PLAYVAULT_DATA_DIR: dataDirectory },
  timeout: 45000,
});
const page = await application.firstWindow(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page
    .getByRole("heading", { name: "艾尔登法环", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".deck-cover img")].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
  const state = await page.evaluate(() => window.playvault.state());
  expect(state.library.games).toHaveLength(0);
  expect(state.catalog).toHaveLength(7);
  expect(state.version).toBe(
    JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"))
      .version,
  );
  expect(state.dataDirectory).toBe(dataDirectory);
  await page.getByRole("button", { name: "动态背景", exact: true }).click();
  await expect
    .poll(() => page.locator(".hero-video").evaluate((v) => v.readyState), {
      timeout: 15000,
    })
    .toBeGreaterThanOrEqual(2);
  await page
    .getByRole("button", { name: "动态背景已开启", exact: true })
    .click();
  await page.screenshot({
    path: path.join(root, "artifacts", "v02", "09-packaged-collection.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "进入游戏主页", exact: true }).click();
  await page.getByRole("button", { name: "更多游戏选项", exact: true }).click();
  await page
    .getByRole("button", { name: "编辑 / 匹配游戏", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "游戏名称", exact: true })
    .fill("打包验证：艾尔登法环");
  await page.getByRole("button", { name: "保存更改", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.playvault.state())).library.games[0]
          .name,
    )
    .toBe("打包验证：艾尔登法环");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Packaged EXE passed: matching ASAR integrity, zero bundled development modules, offline art/video, native IPC, editing and persistence.",
  );
} finally {
  await application.close();
  const relative = path.relative(path.join(root, ".test-data"), dataDirectory);
  if (
    relative.startsWith("packaged-") &&
    !relative.includes("..") &&
    !path.isAbsolute(relative)
  )
    await fs.rm(dataDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 500,
    });
}
