import { spawn } from "node:child_process";
import { localEnvironment } from "./environment.mjs";
const child = spawn(
  process.execPath,
  [
    "--require",
    "./scripts/atomic-exe.cjs",
    "node_modules/electron-builder/cli.js",
    "--win",
    "portable",
    "--x64",
  ],
  { stdio: "inherit", env: localEnvironment(), windowsHide: true },
);
child.on("exit", (code) => process.exit(code ?? 0));
