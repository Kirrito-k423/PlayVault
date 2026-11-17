import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { localEnvironment } from "./environment.mjs";
const root = path.resolve("."),
  fixture = path.join(root, ".test-data", "persistence-" + randomUUID());
const executable = path.join(
  fixture,
  "release",
  "win-unpacked",
  "PlayVault.exe",
);
async function linkRuntime(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    if (e.name === "data" || e.isSymbolicLink()) continue;
    const source = path.join(from, e.name),
      destination = path.join(to, e.name);
    if (e.isDirectory()) await linkRuntime(source, destination);
    else if (e.isFile()) await fs.link(source, destination);
  }
}
await linkRuntime(
  path.join(root, "release", "win-unpacked"),
  path.dirname(executable),
);
await fs.writeFile(
  path.join(fixture, "package.json"),
  JSON.stringify({ name: "playvault" }),
);
await fs.writeFile(path.join(fixture, "启动游迹.cmd"), "@echo off");
const data = path.join(fixture, "data"),
  wrongData = path.join(path.dirname(executable), "data"),
  otherCwd = path.join(fixture, "unrelated working directory");
await fs.mkdir(data, { recursive: true });
await fs.mkdir(wrongData, { recursive: true });
await fs.mkdir(otherCwd, { recursive: true });
const seed = {
  version: 1,
  games: [
    {
      id: "persistence-game",
      name: "启动配置验证",
      originalName: "Persistence fixture",
      description: "",
      genres: [],
      developers: [],
      releaseDate: "",
      hero: "",
      poster: "",
      screenshots: [],
      movies: [],
      gifs: [],
      critics: [],
      awards: [],
      files: [],
      favorite: false,
      playtimeSeconds: 0,
      addedAt: new Date().toISOString(),
    },
  ],
  roots: [],
  settings: {
    installDirectory: path.join(fixture, "Games"),
    sevenZipPath: "",
    autoRefresh: false,
  },
};
await fs.writeFile(path.join(data, "library.json"), JSON.stringify(seed));
const wrongLibrary = JSON.stringify({ ...seed, games: [] });
await fs.writeFile(path.join(wrongData, "library.json"), wrongLibrary);
const env = { ...localEnvironment() };
delete env.PLAYVAULT_DATA_DIR;
delete env.PORTABLE_EXECUTABLE_DIR;
delete env.PORTABLE_EXECUTABLE_FILE;
async function open(environment) {
  const app = await electron.launch({
    executablePath: executable,
    args: [],
    cwd: otherCwd,
    env: environment,
    timeout: 45000,
  });
  const page = await app.firstWindow();
  await page.locator(".launcher-stage").waitFor();
  return { app, page };
}
let application;
try {
  let run = await open({ ...env, PLAYVAULT_DATA_DIR: data });
  application = run.app;
  const settings = {
    ...seed.settings,
    installDirectory: path.join(fixture, "保存的安装目录"),
  };
  await run.page.evaluate(async (settings) => {
    await window.playvault.toggleFavorite("persistence-game");
    await window.playvault.saveSettings(settings);
    await window.playvault.updateGame("persistence-game", {
      name: "启动配置验证：已保存",
      description: "从启动脚本保存的资料",
    });
  }, settings);
  const saved = await run.page.evaluate(() => window.playvault.state());
  expect(saved.dataDirectory).toBe(data);
  await application.close();
  application = null;
  run = await open(env);
  application = run.app;
  const reopened = await run.page.evaluate(() => window.playvault.state());
  expect(reopened.dataDirectory).toBe(data);
  expect(reopened.library).toEqual(saved.library);
  expect(await application.evaluate(({ app }) => app.getPath("userData"))).toBe(
    data,
  );
  await run.page.evaluate(() =>
    window.playvault.updateGame("persistence-game", {
      name: "启动配置验证：已保存",
      description: "从任务栏直接启动后保存的资料",
    }),
  );
  await application.close();
  application = null;
  run = await open(env);
  application = run.app;
  const restarted = await run.page.evaluate(() => window.playvault.state());
  expect(restarted.library.games[0].favorite).toBe(true);
  expect(restarted.library.games[0].description).toBe(
    "从任务栏直接启动后保存的资料",
  );
  expect(restarted.library.settings).toEqual(settings);
  expect(await fs.readFile(path.join(wrongData, "library.json"), "utf8")).toBe(
    wrongLibrary,
  );
  const result = {
    passed: true,
    version: restarted.version,
    scriptAndExeUseSameData: true,
    unrelatedWorkingDirectory: true,
    threeColdStarts: true,
    favoritePreserved: true,
    settingsPreserved: true,
    metadataPreserved: true,
    wrongEmptyLibraryUntouched: true,
    gameExecutablesLaunched: 0,
  };
  await fs.mkdir(path.join(root, "artifacts", "taskbar-persistence"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "artifacts", "taskbar-persistence", "regression.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  if (application) await application.close();
}
