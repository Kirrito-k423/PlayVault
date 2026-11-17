import { contextBridge, ipcRenderer } from "electron";
import type { PlayVaultAPI } from "../shared/types";
const invoke =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(`pv:${channel}`, ...args);
const on = (channel: string) => (callback: (payload: any) => void) => {
  const listener = (_event: unknown, payload: unknown) => callback(payload);
  ipcRenderer.on(`pv:${channel}`, listener);
  return () => ipcRenderer.removeListener(`pv:${channel}`, listener);
};
const api: PlayVaultAPI = {
  state: invoke("state"),
  chooseDirectory: invoke("choose-directory"),
  chooseFile: invoke("choose-file"),
  scan: invoke("scan"),
  cancelScan: invoke("cancel-scan"),
  importCandidates: invoke("import-candidates"),
  addGame: invoke("add-game"),
  addCatalogGame: invoke("add-catalog-game"),
  searchSteam: invoke("search-steam"),
  refreshGame: invoke("refresh-game"),
  refreshCatalog: invoke("refresh-catalog"),
  updateGame: invoke("update-game"),
  toggleFavorite: invoke("toggle-favorite"),
  attachFile: invoke("attach-file"),
  attachMedia: invoke("attach-media"),
  detachFile: invoke("detach-file"),
  removeGame: invoke("remove-game"),
  mergeGames: invoke("merge-games"),
  launchGame: invoke("launch-game"),
  revealFile: invoke("reveal-file"),
  openInstaller: invoke("open-installer"),
  extractGame: invoke("extract-game"),
  saveSettings: invoke("save-settings"),
  saveRoots: invoke("save-roots"),
  exportLibrary: invoke("export-library"),
  importLibrary: invoke("import-library"),
  openExternal: invoke("open-external"),
  windowAction: (action) => ipcRenderer.send("pv:window", action),
  onScanProgress: on("scan-progress"),
  onExtractProgress: on("extract-progress"),
  onLibraryChanged: on("library-changed"),
  onRunningChanged: on("running-changed"),
};
contextBridge.exposeInMainWorld("playvault", api);
