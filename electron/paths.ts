import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

interface LaunchPaths {
  packaged: boolean;
  executable: string;
  appDirectory: string;
  environment: Partial<
    Pick<
      NodeJS.ProcessEnv,
      | "PLAYVAULT_DATA_DIR"
      | "PORTABLE_EXECUTABLE_DIR"
      | "PORTABLE_EXECUTABLE_FILE"
    >
  >;
}

function isLauncherRoot(directory: string): boolean {
  if (!existsSync(path.join(directory, "启动游迹.cmd"))) return false;
  try {
    return (
      JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"))
        .name === "playvault"
    );
  } catch {
    return false;
  }
}

export function resolveLaunchPaths(input: LaunchPaths) {
  const { environment } = input;
  const installationDirectory = path.resolve(
    environment.PORTABLE_EXECUTABLE_DIR ||
      (input.packaged ? path.dirname(input.executable) : input.appDirectory),
  );
  const candidates = [installationDirectory];
  // Both packaged forms belong to the same installation as 启动游迹.cmd.
  // Resolve from the executable, never the shell's current working directory.
  if (path.basename(installationDirectory).toLowerCase() === "release")
    candidates.push(path.dirname(installationDirectory));
  if (
    path.basename(installationDirectory).toLowerCase() === "win-unpacked" &&
    path.basename(path.dirname(installationDirectory)).toLowerCase() ===
      "release"
  )
    candidates.push(path.dirname(path.dirname(installationDirectory)));
  const baseDirectory =
    candidates.find(isLauncherRoot) || installationDirectory;
  return {
    baseDirectory,
    dataDirectory: path.resolve(
      environment.PLAYVAULT_DATA_DIR || path.join(baseDirectory, "data"),
    ),
    relaunchExecutable:
      environment.PORTABLE_EXECUTABLE_FILE || input.executable,
  };
}
