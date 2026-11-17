import { spawn } from "node:child_process";
import { localEnvironment } from "./environment.mjs";
Object.assign(process.env, localEnvironment());
const { default: electron } = await import("electron");
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: localEnvironment(),
  windowsHide: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
