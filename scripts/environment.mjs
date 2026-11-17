import fs from "node:fs";
import path from "node:path";
export function localEnvironment() {
  const root = path.resolve(".cache");
  const env = {
    ...process.env,
    electron_config_cache:
      process.env.electron_config_cache || path.join(root, "electron"),
    ELECTRON_CACHE: process.env.ELECTRON_CACHE || path.join(root, "electron"),
    ELECTRON_BUILDER_CACHE:
      process.env.ELECTRON_BUILDER_CACHE || path.join(root, "builder"),
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(root, "playwright"),
    TEMP: path.join(root, "temp"),
    TMP: path.join(root, "temp"),
  };
  fs.mkdirSync(env.TEMP, { recursive: true });
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
