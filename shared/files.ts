import type { LocalFile, LocalKind } from "./types";

// Shared by the scanner and renderer so stale imports cannot become launch targets.
export function classifyFile(value: string): LocalKind | null {
  const name = value.split(/[\\/]/).pop() || value;
  if (
    /^(unins|uninstall|crash|unitycrash|vcredist|vc_redist|dxsetup|directx|redist|ue.?prereq|dotnet|eac|easyanticheat|battleye|notification|cef|diagnostic|report|helper|rapidcrc|quick.?sfv|md5checker|hashcheck|verifyfiles|filechecker|gpuburner|essenceeditor|bssndrpt|bugsplat)/i.test(
      name,
    ) ||
    /文件[检校]测|文件校验|校验工具|检测工具|完整性[检校]验/.test(name)
  )
    return null;
  if (/\.exe$/i.test(name))
    return /(setup([._ -]|\d|\.exe)|install(er)?([._ -]|\.exe)|downloader(?:[._ -]|\.exe)|\.part\d+\.exe$|(?:^|[ ._-])(?:update|patch)(?:[ ._\d-]|\.exe)|更新|升级补丁|转会)/i.test(
      name,
    )
      ? "installer"
      : "executable";
  if (/\.iso$/i.test(name)) return "disc";
  if (/\.part\d+\.rar$/i.test(name))
    return /\.part0*1\.rar$/i.test(name) ? "archive" : null;
  if (/\.(7z|zip)\.\d{3}$/i.test(name))
    return /\.001$/i.test(name) ? "archive" : null;
  return /\.(zip|7z|rar)$/i.test(name) ? "archive" : null;
}

export const isGameExecutable = (file: LocalFile) =>
  file.kind === "executable" && classifyFile(file.path) === "executable";
export const isGamePackage = (file: LocalFile) => {
  const kind = classifyFile(file.path);
  return kind !== null && kind !== "executable";
};
