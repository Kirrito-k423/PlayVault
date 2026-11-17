export type LocalKind = "executable" | "archive" | "installer" | "disc";
export interface LocalFile {
  id: string;
  path: string;
  kind: LocalKind;
  size: number;
  available: boolean;
  parts?: number;
}
export interface ReviewSummary {
  positive: number;
  negative: number;
  total: number;
  percent: number | null;
}
export interface SteamReviews {
  all: ReviewSummary;
  chinese: ReviewSummary;
  other: ReviewSummary;
  fetchedAt: string;
  sourceUrl: string;
  stale?: boolean;
}
export interface CriticScore {
  name: string;
  score: number;
  max: number;
  url: string;
  fetchedAt: string;
  platform?: string;
}
export interface Award {
  organization: string;
  year: number;
  category: string;
  result: "winner" | "nominee";
  url: string;
}
export interface Movie {
  name: string;
  url: string;
  thumbnail: string;
  preview?: string;
}
export interface Game {
  logo?: string;
  backdrop?: string;
  id: string;
  name: string;
  originalName: string;
  steamAppId?: number;
  description: string;
  genres: string[];
  categories?: import("./categories").GameCategory[];
  developers: string[];
  releaseDate: string;
  hero: string;
  poster: string;
  screenshots: string[];
  movies: Movie[];
  gifs: string[];
  critics: CriticScore[];
  awards: Award[];
  reviews?: SteamReviews;
  metadataAt?: string;
  metadataUrl?: string;
  files: LocalFile[];
  launchFileId?: string;
  favorite: boolean;
  playtimeSeconds: number;
  lastPlayed?: string;
  addedAt: string;
}
export interface Settings {
  installDirectory: string;
  sevenZipPath: string;
  autoRefresh: boolean;
}
export interface Library {
  version: 1;
  games: Game[];
  roots: string[];
  settings: Settings;
}
export interface ScanCandidate {
  id: string;
  name: string;
  directory: string;
  files: LocalFile[];
  steamAppId?: number;
}
export interface ScanResult {
  candidates: ScanCandidate[];
  visited: number;
  skipped: number;
  warnings: string[];
  cancelled: boolean;
  limited: boolean;
}
export interface ScanProgress {
  visited: number;
  found: number;
  directory: string;
}
export interface ExtractProgress {
  gameId: string;
  percent: number;
  message: string;
}
export interface AppState {
  library: Library;
  catalog: Game[];
  dataDirectory: string;
  version: string;
  runningGameIds: string[];
}
export interface SourceUpdate {
  game: Game;
  warnings: string[];
}
export interface GameEdit {
  name: string;
  steamAppId?: number;
  description: string;
  launchFileId?: string;
  critics?: CriticScore[];
  awards?: Award[];
}
export interface PlayVaultAPI {
  state(): Promise<AppState>;
  chooseDirectory(): Promise<string | null>;
  chooseFile(
    kind: "executable" | "package" | "art" | "gif" | "video" | "sevenZip",
  ): Promise<string | null>;
  scan(roots: string[]): Promise<ScanResult>;
  cancelScan(): Promise<void>;
  importCandidates(ids: string[]): Promise<Library>;
  addGame(input: {
    name: string;
    path?: string;
    steamAppId?: number;
  }): Promise<Library>;
  addCatalogGame(appId: number): Promise<Library>;
  searchSteam(
    query: string,
  ): Promise<{ appId: number; name: string; image: string }[]>;
  refreshGame(id: string): Promise<SourceUpdate>;
  refreshCatalog(appId: number): Promise<SourceUpdate>;
  updateGame(id: string, edit: GameEdit): Promise<Library>;
  toggleFavorite(id: string): Promise<Library>;
  attachFile(id: string, kind: "executable" | "package"): Promise<Library>;
  attachMedia(id: string, kind: "art" | "gif" | "video"): Promise<Library>;
  detachFile(gameId: string, fileId: string): Promise<Library>;
  removeGame(id: string): Promise<Library>;
  mergeGames(sourceId: string, targetId: string): Promise<Library>;
  launchGame(id: string): Promise<void>;
  revealFile(gameId: string, fileId: string): Promise<void>;
  openInstaller(gameId: string, fileId: string): Promise<void>;
  extractGame(
    gameId: string,
    fileId: string,
    destination: string,
  ): Promise<{ directory: string; library: Library }>;
  saveSettings(settings: Settings): Promise<Library>;
  saveRoots(roots: string[]): Promise<Library>;
  exportLibrary(): Promise<string | null>;
  importLibrary(): Promise<Library | null>;
  openExternal(url: string): Promise<void>;
  windowAction(action: "minimize" | "maximize" | "close"): void;
  onScanProgress(callback: (p: ScanProgress) => void): () => void;
  onExtractProgress(callback: (p: ExtractProgress) => void): () => void;
  onLibraryChanged(callback: (library: Library) => void): () => void;
  onRunningChanged(callback: (ids: string[]) => void): () => void;
}
declare global {
  interface Window {
    playvault: PlayVaultAPI;
  }
}
