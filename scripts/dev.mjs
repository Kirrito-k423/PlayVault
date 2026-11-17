import { spawn } from "node:child_process";
import { createServer } from "vite";
import { build } from "esbuild";
import { localEnvironment } from "./environment.mjs";
Object.assign(process.env, localEnvironment());
const { default: electron } = await import("electron");
await build({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  external: ["electron"],
  target: "node22",
});
const server = await createServer();
await server.listen();
const env = {
  ...localEnvironment(),
  PLAYVAULT_DEV_URL: "http://127.0.0.1:5178",
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env,
  windowsHide: true,
});
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
process.on("SIGINT", () => child.kill());
