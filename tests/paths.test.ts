import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveLaunchPaths } from "../electron/paths";

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const base = path.resolve(".test-data");
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, "launch-paths-"));
  await fs.writeFile(path.join(root, "启动游迹.cmd"), "@echo off");
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "playvault" }),
  );
  t.after(async () => {
    assert.equal(path.dirname(root), base);
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

test("script and pinned unpacked EXE share the original data even when the wrong adjacent library exists", async (t) => {
  const root = await fixture(t),
    executable = path.join(root, "release", "win-unpacked", "PlayVault.exe");
  await fs.mkdir(path.join(path.dirname(executable), "data"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(path.dirname(executable), "data", "library.json"),
    '{"games":[]}',
  );
  const direct = resolveLaunchPaths({
    packaged: true,
    executable,
    appDirectory: path.join(path.dirname(executable), "resources", "app.asar"),
    environment: {},
  });
  const script = resolveLaunchPaths({
    packaged: true,
    executable,
    appDirectory: root,
    environment: { PLAYVAULT_DATA_DIR: path.join(root, "data") },
  });
  assert.equal(direct.dataDirectory, path.join(root, "data"));
  assert.equal(direct.dataDirectory, script.dataDirectory);
  assert.equal(direct.baseDirectory, root);
  // The resolver locates paths without creating or replacing a library.
  assert.equal(
    await fs.readFile(
      path.join(path.dirname(executable), "data", "library.json"),
      "utf8",
    ),
    '{"games":[]}',
  );
});

test("portable launches use the original installation and pin the portable EXE rather than the temporary runner", async (t) => {
  const root = await fixture(t),
    portable = path.join(root, "release", "PlayVault-Windows.exe");
  const resolved = resolveLaunchPaths({
    packaged: true,
    executable: path.join(root, "temp", "PlayVault.exe"),
    appDirectory: path.join(root, "temp", "resources", "app.asar"),
    environment: {
      PORTABLE_EXECUTABLE_DIR: path.dirname(portable),
      PORTABLE_EXECUTABLE_FILE: portable,
    },
  });
  assert.equal(resolved.dataDirectory, path.join(root, "data"));
  assert.equal(resolved.relaunchExecutable, portable);
});

test("explicit data overrides and standalone portable libraries retain their own directories", async (t) => {
  const root = await fixture(t),
    install = path.join(root, "standalone"),
    executable = path.join(install, "PlayVault.exe");
  const input = {
    packaged: true,
    executable,
    appDirectory: path.join(install, "resources", "app.asar"),
    environment: {},
  };
  assert.equal(
    resolveLaunchPaths(input).dataDirectory,
    path.join(install, "data"),
  );
  const override = path.join(root, "isolated-data");
  assert.equal(
    resolveLaunchPaths({
      ...input,
      environment: { PLAYVAULT_DATA_DIR: override },
    }).dataDirectory,
    override,
  );
});

test("development and portable EXEs located in the launcher root use its existing data directory", async (t) => {
  const root = await fixture(t);
  assert.equal(
    resolveLaunchPaths({
      packaged: false,
      executable: path.join(root, "node_modules", "electron", "electron.exe"),
      appDirectory: root,
      environment: {},
    }).dataDirectory,
    path.join(root, "data"),
  );
  assert.equal(
    resolveLaunchPaths({
      packaged: true,
      executable: path.join(root, "PlayVault.exe"),
      appDirectory: root,
      environment: { PORTABLE_EXECUTABLE_DIR: root },
    }).dataDirectory,
    path.join(root, "data"),
  );
});
