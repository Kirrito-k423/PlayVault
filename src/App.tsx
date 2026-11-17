import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LibraryBig,
  Compass,
  HardDrive,
  Heart,
  Settings,
  Plus,
  Search,
  Minus,
  Square,
  X,
  Play,
  FolderOpen,
  Archive,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Trophy,
  LayoutGrid,
  Rows3,
  ScanLine,
  MoreHorizontal,
  Pencil,
  ImagePlus,
  Film,
  Link2,
  Unlink,
  Trash2,
  Check,
  AlertCircle,
  MonitorPlay,
  Sparkles,
  Clock3,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type {
  AppState,
  Game,
  Library,
  LocalFile,
  ExtractProgress,
} from "../shared/types";
import {
  Art,
  Brand,
  bytes,
  External,
  IconButton,
  Spinner,
  stamp,
  status,
  statusText,
  errorMessage,
  type Notify,
  Modal,
} from "./ui";
import {
  AddDialog,
  EditDialog,
  ExtractDialog,
  ScanDialog,
  SettingsDialog,
  SourcesDialog,
} from "./dialogs";
import Launcher, { type LauncherTab } from "./Launcher";
import { metadataIdentity, metadataSourceLabel } from "../shared/metadata";
import { matchesCategory, type GameCategory } from "../shared/categories";
import { isGameExecutable, isGamePackage } from "../shared/files";
const MediaPlayer = lazy(() => import("./MediaPlayer"));

type Scope = "library" | "catalog";
type Filter = "all" | "installed" | "archive" | "favorite" | "metadata";
type Tab = "overview" | "media" | "scores" | "files";
type Dialog =
  | { type: "scan" | "add" | "settings" }
  | { type: "edit" | "sources"; game: Game }
  | { type: "extract"; game: Game; file: LocalFile }
  | { type: "media"; game: Game; index?: number };
export default function App() {
  const [state, setState] = useState<AppState | null>(null),
    [error, setError] = useState("");
  const [scope, setScope] = useState<Scope>("library"),
    [filter, setFilter] = useState<Filter>("all"),
    [category, setCategory] = useState<GameCategory>("all"),
    [selected, setSelected] = useState("");
  const [query, setQuery] = useState(""),
    [tab, setTab] = useState<Tab>("overview"),
    [grid, setGrid] = useState(false),
    [detailsOpen, setDetailsOpen] = useState(false);
  const [mode, setMode] = useState<"collection" | "game">("collection");
  const [dialog, setDialog] = useState<Dialog | null>(null),
    [toast, setToast] = useState<{ message: string; tone: string } | null>(
      null,
    );
  const [refreshing, setRefreshing] = useState(false),
    [launching, setLaunching] = useState(false),
    [motion, setMotion] = useState(false),
    [menu, setMenu] = useState(false);
  const [extractProgress, setExtractProgress] =
      useState<ExtractProgress | null>(null),
    [sort, setSort] = useState("name");
  const searchRef = useRef<HTMLInputElement>(null),
    mainRef = useRef<HTMLElement>(null);
  const refreshed = useRef(new Set<string>());
  const notify: Notify = useCallback(
    (message, tone = "success") => setToast({ message, tone }),
    [],
  );
  const updateLibrary = useCallback(
    (library: Library) => setState((s) => (s ? { ...s, library } : s)),
    [],
  );
  const load = useCallback(
    () =>
      window.playvault
        .state()
        .then((s) => {
          setState(s);
          if (!s.library.games.length) setScope("catalog");
          else setMode("game");
          setError("");
        })
        .catch((e) => setError(String(e.message))),
    [],
  );
  useEffect(() => {
    load();
    return window.playvault.onLibraryChanged(updateLibrary);
  }, [load, updateLibrary]);
  useEffect(() => window.playvault.onExtractProgress(setExtractProgress), []);
  useEffect(
    () =>
      window.playvault.onRunningChanged((ids) =>
        setState((s) => (s ? { ...s, runningGameIds: ids } : s)),
      ),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(null),
      toast.tone === "error" ? 10000 : 6000,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setGrid(true);
        setDetailsOpen(false);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const library = state?.library;
  const games =
    scope === "catalog" ? state?.catalog || [] : library?.games || [];
  const filtered = useMemo(
    () =>
      games
        .filter((g) => {
          if (!matchesCategory(g, category)) return false;
          if (filter === "installed" && status(g) !== "installed") return false;
          if (filter === "archive" && !g.files.some(isGamePackage))
            return false;
          if (filter === "favorite" && !g.favorite) return false;
          if (filter === "metadata" && status(g) !== "metadata") return false;
          const haystack = [
            g.name,
            g.originalName,
            ...g.genres,
            ...g.files.map((f) => f.path),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query.trim().toLowerCase());
        })
        .sort((a, b) =>
          sort === "recent"
            ? Date.parse(b.lastPlayed || b.addedAt) -
              Date.parse(a.lastPlayed || a.addedAt)
            : sort === "score"
              ? (b.reviews?.all.percent ?? -1) - (a.reviews?.all.percent ?? -1)
              : a.name.localeCompare(b.name, "zh-CN"),
        ),
    [games, filter, category, query, sort],
  );
  const active =
    (mode === "game" ? games.find((g) => g.id === selected) : undefined) ||
    filtered.find((g) => g.id === selected) ||
    (scope === "catalog" && !query && filter === "all"
      ? filtered.find((g) => g.steamAppId === 1245620)
      : undefined) ||
    filtered[0];
  const stored = active
    ? library?.games.find(
        (g) =>
          g.id === active.id ||
          (g.steamAppId && g.steamAppId === active.steamAppId),
      )
    : undefined;
  const closeDialog = useCallback(() => setDialog(null), []);
  const selectGame = (game: Game, open = true) => {
    setMode(open ? "game" : "collection");
    setDetailsOpen(false);
    setSelected(game.id);
    setTab("overview");
    setGrid(false);
    setMenu(false);
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const changeScope = (next: Scope, nextFilter: Filter = "all") => {
    setMode("collection");
    setDetailsOpen(false);
    setScope(next);
    setFilter(nextFilter);
    setCategory("all");
    setQuery("");
    setSelected("");
    setGrid(false);
    setTab("overview");
  };
  const importDone = (lib: Library) => {
    updateLibrary(lib);
    changeScope("library");
    setMode("game");
    setDialog(null);
  };
  const refresh = useCallback(
    async (game: Game, silent = false) => {
      if (!metadataIdentity(game)) {
        if (!silent) notify("请先关联游戏资料来源", "info");
        return;
      }
      setRefreshing(true);
      try {
        const result =
          game.id.startsWith("catalog-") && game.steamAppId
            ? await window.playvault.refreshCatalog(game.steamAppId)
            : await window.playvault.refreshGame(game.id);
        setState((s) =>
          s
            ? {
                ...s,
                catalog: s.catalog.map((g) =>
                  g.id === result.game.id ? result.game : g,
                ),
              }
            : s,
        );
        if (result.warnings.length) notify(result.warnings.join("\n"), "info");
        else if (!silent) notify("游戏资料和来源评分已更新");
      } catch (e) {
        notify(errorMessage(e), "error");
      } finally {
        setRefreshing(false);
      }
    },
    [notify],
  );
  useEffect(() => {
    if (
      !active ||
      !metadataIdentity(active) ||
      !library?.settings.autoRefresh ||
      refreshed.current.has(active.id)
    )
      return;
    const updated = active.reviews?.fetchedAt;
    if (updated && Date.now() - Date.parse(updated) < 30 * 60 * 1000) return;
    const timer = setTimeout(() => {
      refreshed.current.add(active.id);
      refresh(active, true);
    }, 1800);
    return () => clearTimeout(timer);
  }, [active?.id, library?.settings.autoRefresh, refresh]);
  const ensureStored = async (game: Game) => {
    const found = state?.library.games.find(
      (g) =>
        g.id === game.id || (g.steamAppId && g.steamAppId === game.steamAppId),
    );
    if (found) return found;
    if (!game.steamAppId) throw new Error("请先添加该游戏");
    const lib = await window.playvault.addCatalogGame(game.steamAppId);
    updateLibrary(lib);
    return lib.games.find((g) => g.steamAppId === game.steamAppId)!;
  };
  const attach = async (game: Game, kind: "executable" | "package") => {
    try {
      const g = await ensureStored(game);
      const lib = await window.playvault.attachFile(g.id, kind);
      updateLibrary(lib);
      setScope("library");
      setFilter("all");
      setQuery("");
      setSelected(g.id);
      setTab("files");
      setDetailsOpen(true);
      setMode("game");
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  };
  const addMedia = async (game: Game, kind: "art" | "gif" | "video") => {
    try {
      const g = await ensureStored(game);
      const lib = await window.playvault.attachMedia(g.id, kind);
      updateLibrary(lib);
      setScope("library");
      setSelected(g.id);
      setTab(kind === "art" ? "overview" : "media");
      if (kind !== "art") setDetailsOpen(true);
      setMode("game");
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  };
  const launch = async (game: Game) => {
    if (!game.launchFileId) {
      await attach(game, "executable");
      return;
    }
    setLaunching(true);
    try {
      await window.playvault.launchGame(game.id);
      notify("游戏已启动，祝你玩得开心");
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      setLaunching(false);
    }
  };
  const primary = async () => {
    if (!active) return;
    const game = stored || active;
    if (state?.runningGameIds.includes(game.id)) return;
    const pack = game.files.find((f) => f.kind === "archive" && f.available);
    if (
      game.launchFileId &&
      game.files.some(
        (f) => f.id === game.launchFileId && isGameExecutable(f) && f.available,
      )
    )
      await launch(game);
    else if (pack) setDialog({ type: "extract", game, file: pack });
    else if (game.files.some((f) => ["installer", "disc"].includes(f.kind))) {
      setTab("files");
      setDetailsOpen(true);
      setMode("game");
    } else await attach(game, "executable");
  };
  const favorite = async (game: Game) => {
    try {
      const g = await ensureStored(game);
      updateLibrary(await window.playvault.toggleFavorite(g.id));
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  };
  useEffect(() => {
    const refreshState = () =>
      window.playvault
        .state()
        .then((s) =>
          setState((old) =>
            old
              ? { ...old, library: s.library, runningGameIds: s.runningGameIds }
              : s,
          ),
        )
        .catch(() => {});
    window.addEventListener("focus", refreshState);
    return () => window.removeEventListener("focus", refreshState);
  }, []);
  const showEdit = async (game: Game, type: "edit" | "sources") => {
    try {
      const g = await ensureStored(game);
      setDialog({ type, game: g });
      setMenu(false);
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  };

  if (!state)
    return (
      <div className="boot">
        <Brand />
        {error ? (
          <>
            <h2>游戏库暂时无法打开</h2>
            <p>{error}</p>
            <button className="button primary" onClick={load}>
              重新尝试
            </button>
          </>
        ) : (
          <>
            <h2>
              游迹 <span>PlayVault</span>
            </h2>
            <Spinner />
          </>
        )}
      </div>
    );
  const installedCount = state.library.games.filter(
    (g) => status(g) === "installed",
  ).length;
  const archiveCount = state.library.games.filter((g) =>
    g.files.some(isGamePackage),
  ).length;
  const isRunning =
    !!active && state.runningGameIds.includes((stored || active).id);
  const local = stored || active;
  const cta = isRunning
    ? "游戏运行中"
    : local?.launchFileId &&
        local.files.some(
          (f) =>
            f.id === local.launchFileId && isGameExecutable(f) && f.available,
        )
      ? "开始游戏"
      : local?.files.some((f) => f.kind === "archive" && f.available)
        ? "解压并安装"
        : local?.files.some((f) => ["installer", "disc"].includes(f.kind))
          ? "查看安装包"
          : "定位游戏";
  const openDetails = (next: LauncherTab) => {
    setTab(next);
    setDetailsOpen(true);
    setMenu(false);
  };
  const openAction = (type: "scan" | "add" | "settings") => {
    setGrid(false);
    setDialog({ type });
  };
  return (
    <div className="app launcher-app">
      <div className="launcher-surface" inert={detailsOpen || !!dialog}>
        <Launcher
          state={state}
          active={active}
          local={local}
          games={filtered}
          scope={scope}
          filter={filter}
          category={category}
          mode={mode}
          libraryOpen={grid}
          query={query}
          sort={sort}
          searchRef={searchRef}
          motion={motion}
          menu={menu}
          refreshing={refreshing}
          launching={launching}
          isRunning={isRunning}
          cta={cta}
          onMode={(m) => {
            setMode(m);
            setDetailsOpen(false);
            setMenu(false);
          }}
          onLibrary={(open) => {
            setGrid(open);
            if (open) setDetailsOpen(false);
          }}
          onScope={changeScope}
          onFilter={setFilter}
          onCategory={setCategory}
          onQuery={setQuery}
          onSort={setSort}
          onSelect={selectGame}
          onDetails={openDetails}
          onMedia={(game, index) => setDialog({ type: "media", game, index })}
          onMotion={() => setMotion(!motion)}
          onMotionError={() => {
            setMotion(false);
            notify("动态背景暂时无法播放", "info");
          }}
          onMenu={setMenu}
          onPrimary={primary}
          onFavorite={favorite}
          onRefresh={refresh}
          onEdit={showEdit}
          onAttach={attach}
          onAddMedia={addMedia}
          onSettings={() => openAction("settings")}
          onScan={() => openAction("scan")}
          onAdd={() => openAction("add")}
        />
      </div>
      {active && detailsOpen && (
        <Modal
          className="game-details-modal"
          title={active.name}
          eyebrow="游戏档案"
          wide
          onClose={() => setDetailsOpen(false)}
        >
          <div className="details-tabs">
            <nav>
              {(
                [
                  ["overview", "概览"],
                  ["media", "游戏影像"],
                  ["scores", "评分与奖项"],
                  ["files", "本地文件"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? "selected" : ""}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {id === "files" && <span>{local?.files.length || 0}</span>}
                </button>
              ))}
            </nav>
            <button
              className="refresh-button"
              disabled={refreshing || !metadataIdentity(active)}
              onClick={() => refresh(active)}
            >
              {refreshing ? <Spinner /> : <RefreshCw size={14} />}同步资料
            </button>
          </div>
          <main className="game-details-scroll" ref={mainRef}>
            {" "}
            <div className="detail-content">
              {(tab === "overview" || tab === "scores") && (
                <>
                  <div className="section-heading">
                    <h3>
                      <span className="section-line" />
                      口碑一览
                    </h3>
                    <span className="source-time">
                      {active.reviews?.stale ? (
                        <>
                          <AlertCircle size={12} />
                          上次缓存 ·{" "}
                        </>
                      ) : null}
                      {active.reviews
                        ? `${stamp(active.reviews.fetchedAt)} 更新`
                        : active.critics.length && active.metadataAt
                          ? `${stamp(active.metadataAt)} 收录`
                          : "等待获取评分"}
                    </span>
                  </div>
                  {active.steamAppId ? (
                    <div className="rating-grid">
                      <RatingCard
                        label="Steam · 全部语言"
                        summary={active.reviews?.all}
                        icon="steam"
                      />
                      <RatingCard
                        label="Steam · 简体中文"
                        summary={active.reviews?.chinese}
                        icon="中"
                      />
                      <RatingCard
                        label="Steam · 其他语言"
                        summary={active.reviews?.other}
                        icon="A"
                      />
                      <div className="rating-card critic-card">
                        <div className="rating-card-label">
                          <span className="rating-icon metacritic">m</span>
                          Metacritic
                          <ArrowUpRight size={13} />
                        </div>
                        {active.critics.find((c) => c.name === "Metacritic") ? (
                          <>
                            <div className="rating-number critic">
                              <span>
                                {
                                  active.critics.find(
                                    (c) => c.name === "Metacritic",
                                  )!.score
                                }
                              </span>
                              <small>/ 100</small>
                              <span className="critic-descriptor">
                                媒体综合评分
                              </span>
                            </div>
                            <div className="rating-footnote">
                              <External
                                url={
                                  active.critics.find(
                                    (c) => c.name === "Metacritic",
                                  )!.url
                                }
                              >
                                查看评分来源
                              </External>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="rating-number muted">—</div>
                            <div className="rating-footnote">
                              尚无已核实的媒体评分
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rating-grid">
                      {active.critics.map((score) => (
                        <div
                          className="rating-card critic-card"
                          key={score.name}
                        >
                          <div className="rating-card-label">
                            <span className="rating-icon">{score.name[0]}</span>
                            {score.name}
                          </div>
                          <div className="rating-number critic">
                            <span>{score.score}</span>
                            <small>/ {score.max}</small>
                          </div>
                          <div className="rating-footnote">
                            <External url={score.url}>查看评分来源</External>
                          </div>
                        </div>
                      ))}
                      {!active.critics.length && (
                        <div className="rating-card">
                          <div className="rating-card-label">评分资料</div>
                          <div className="rating-number muted">—</div>
                          <div className="rating-footnote">
                            该来源暂无可用评分
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {tab === "scores" && active.steamAppId && (
                    <p className="data-note">
                      Steam 好评率 = 好评数 ÷
                      有效评论数；“其他语言”为全部语言减去简体中文。按语言区分，不代表玩家所在国家。自动刷新间隔
                      30 分钟，Steam 匿名接口可能缓存约 10 分钟。
                    </p>
                  )}
                </>
              )}
              {tab === "overview" && (
                <>
                  <div className="overview-panels">
                    <section className="about-panel">
                      <div className="section-heading">
                        <h3>关于这场冒险</h3>
                        {active.metadataUrl && (
                          <External url={active.metadataUrl}>
                            {metadataSourceLabel(active)}
                          </External>
                        )}
                      </div>
                      <p>
                        {active.description ||
                          "为这款游戏添加介绍，记录下你收藏它的理由。"}
                      </p>
                      <div className="game-facts">
                        <span>
                          开发商
                          <strong>
                            {active.developers.join(" / ") || "待补充"}
                          </strong>
                        </span>
                        <span>
                          发行日期
                          <strong>{active.releaseDate || "待补充"}</strong>
                        </span>
                      </div>
                    </section>
                    <section className="local-panel">
                      <div className="local-panel-icon">
                        <HardDrive size={21} />
                      </div>
                      <div>
                        <h3>
                          {local?.files.length
                            ? "你的本地收藏"
                            : "让这场冒险触手可及"}
                        </h3>
                        <p>
                          {local?.files.length
                            ? `${local.files.filter((f) => f.kind === "executable").length} 个程序 · ${local.files.filter((f) => f.kind !== "executable").length} 个安装包`
                            : "关联已安装游戏，或把珍藏的安装包加入游戏库。"}
                        </p>
                        <button
                          className="text-link"
                          onClick={() =>
                            local?.files.length
                              ? setTab("files")
                              : attach(active, "executable")
                          }
                        >
                          {local?.files.length
                            ? "管理本地文件"
                            : "关联本地文件"}
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </section>
                  </div>
                  <div className="section-heading explore-heading">
                    <h3>
                      下一场冒险
                      <span className="small-muted">还在等待你</span>
                    </h3>
                    <button
                      className="text-link muted"
                      onClick={() => {
                        setDetailsOpen(false);
                        setGrid(true);
                      }}
                    >
                      查看全部
                      <ArrowRight size={13} />
                    </button>
                  </div>
                  <div className="adventure-strip">
                    {filtered.slice(0, 7).map((g) => (
                      <button
                        key={g.id}
                        className={`adventure-card ${g.id === active.id ? "selected" : ""}`}
                        onClick={() => selectGame(g)}
                      >
                        <Art src={g.hero || g.poster} alt={g.name} />
                        <div className="adventure-gradient" />
                        <span>{g.name}</span>
                        {g.id === active.id && <i />}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {tab === "media" && (
                <>
                  <div className="section-heading">
                    <h3>
                      走进游戏的世界
                      <span className="small-muted">
                        {active.movies.length} 部预告 · {active.gifs.length}{" "}
                        张动图 · {active.screenshots.length} 张截图
                      </span>
                    </h3>
                    <div className="row-actions">
                      <button
                        className="text-link"
                        onClick={() => addMedia(active, "video")}
                      >
                        <Plus size={14} />
                        视频
                      </button>
                      <button
                        className="text-link"
                        onClick={() => addMedia(active, "gif")}
                      >
                        <Plus size={14} />
                        GIF
                      </button>
                    </div>
                  </div>
                  {!active.movies.length &&
                  !active.screenshots.length &&
                  !active.gifs.length ? (
                    <div className="empty-small">
                      <Film size={34} />
                      <h3>还没有游戏影像</h3>
                      <p>同步 Steam 资料，或添加你喜欢的本地视频和 GIF。</p>
                    </div>
                  ) : (
                    <div className="media-grid">
                      {[
                        ...active.movies.map((m, i) => ({
                          url: m.thumbnail,
                          name: m.name,
                          index: i,
                          video: true,
                        })),
                        ...active.gifs.map((url, i) => ({
                          url,
                          name: `宣传 GIF ${i + 1}`,
                          index: active.movies.length + i,
                          video: false,
                        })),
                        ...active.screenshots.map((url, i) => ({
                          url,
                          name: `游戏截图 ${i + 1}`,
                          index: active.movies.length + active.gifs.length + i,
                          video: false,
                        })),
                      ].map((m, i) => (
                        <button
                          key={m.url + i}
                          className="media-tile"
                          onClick={() =>
                            setDialog({
                              type: "media",
                              game: active,
                              index: m.index,
                            })
                          }
                        >
                          <Art src={m.url} alt={m.name} />
                          {m.video && (
                            <span className="media-play">
                              <Play size={19} fill="currentColor" />
                            </span>
                          )}
                          <span className="media-label">{m.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {tab === "scores" && (
                <>
                  <div className="scores-source-row">
                    {active.reviews && (
                      <External url={active.reviews.sourceUrl}>
                        Steam 原始评价
                      </External>
                    )}
                    <button
                      className="text-link"
                      onClick={() => showEdit(active, "sources")}
                    >
                      <Pencil size={13} />
                      管理媒体分数与奖项
                    </button>
                  </div>
                  <div className="section-heading">
                    <h3>
                      <Trophy size={17} />
                      获奖与提名
                    </h3>
                    <span className="source-time">每条记录均保留来源</span>
                  </div>
                  {active.awards.length ? (
                    <div className="awards-list">
                      {active.awards.map((award, i) => (
                        <div className="award-row" key={i}>
                          <div className={`award-icon ${award.result}`}>
                            <Trophy size={22} />
                          </div>
                          <div>
                            <strong>{award.category}</strong>
                            <p>
                              {award.organization} · {award.year}
                            </p>
                          </div>
                          <span className={`award-result ${award.result}`}>
                            {award.result === "winner" ? "获奖" : "提名"}
                          </span>
                          <External url={award.url}>来源</External>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-small horizontal">
                      <Trophy size={28} />
                      <div>
                        <h3>暂无已核实的奖项记录</h3>
                        <p>
                          可以从官方颁奖页面添加记录；TGA
                          展示获奖和提名，不生成数值评分。
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="section-heading">
                    <h3>媒体与玩家评价</h3>
                    <span className="source-time">分别标注评分来源与满分</span>
                  </div>
                  <div className="critic-list">
                    {active.critics.map((c, i) => (
                      <div className="critic-row" key={i}>
                        <span className="critic-badge">{c.name[0]}</span>
                        <div>
                          <strong>{c.name}</strong>
                          <p>
                            {c.platform || "媒体评分"} · {stamp(c.fetchedAt)}{" "}
                            收录
                          </p>
                        </div>
                        <b>
                          {c.score}
                          <small> / {c.max}</small>
                        </b>
                        <External url={c.url}>查看来源</External>
                      </div>
                    ))}
                  </div>
                  <p className="data-note">
                    Metacritic 分数来自 Steam 商店；VNDB、Bangumi、DLsite
                    为各资料站的玩家或购买者评分，各来源独立展示。
                  </p>
                </>
              )}
              {tab === "files" && (
                <>
                  <div className="section-heading">
                    <h3>
                      散落的文件，在这里相遇
                      <span className="small-muted">
                        {local?.files.length || 0} 个关联文件
                      </span>
                    </h3>
                    <div className="row-actions">
                      <button
                        className="text-link"
                        onClick={() => attach(active, "executable")}
                      >
                        <Plus size={14} />
                        游戏程序
                      </button>
                      <button
                        className="text-link"
                        onClick={() => attach(active, "package")}
                      >
                        <Plus size={14} />
                        安装包
                      </button>
                    </div>
                  </div>
                  {!local?.files.length ? (
                    <div className="empty-small">
                      <FolderOpen size={36} />
                      <h3>还没有关联本地文件</h3>
                      <p>
                        同一款游戏可以同时保存已安装程序、安装包和多份副本。
                      </p>
                      <div className="row-actions">
                        <button
                          className="button primary"
                          onClick={() => attach(active, "executable")}
                        >
                          <Link2 size={16} />
                          定位游戏程序
                        </button>
                        <button
                          className="button"
                          onClick={() => attach(active, "package")}
                        >
                          <Archive size={16} />
                          关联安装包
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="file-list">
                      {local.files.map((file) => (
                        <div
                          className={`file-row ${!file.available ? "unavailable" : ""}`}
                          key={file.id}
                        >
                          <div className="file-icon">
                            {file.kind === "executable" ? (
                              <MonitorPlay size={23} />
                            ) : (
                              <Archive size={23} />
                            )}
                          </div>
                          <div className="file-info">
                            <div>
                              <strong>
                                {file.kind === "executable"
                                  ? "游戏程序"
                                  : file.kind === "installer"
                                    ? "安装程序"
                                    : file.kind === "disc"
                                      ? "光盘镜像"
                                      : "压缩安装包"}
                              </strong>
                              {local.launchFileId === file.id && (
                                <span className="mini-badge">启动项</span>
                              )}
                              {!file.available && (
                                <span className="missing-badge">
                                  文件不存在 / 磁盘未连接
                                </span>
                              )}
                            </div>
                            <p title={file.path}>{file.path}</p>
                            <small>
                              {bytes(file.size)}
                              {file.parts && file.parts > 1
                                ? ` · ${file.parts} 个分卷（第一卷）`
                                : ""}
                            </small>
                          </div>
                          <div className="file-actions">
                            {file.kind === "archive" && (
                              <button
                                className="button compact"
                                disabled={
                                  !file.available ||
                                  (!!extractProgress &&
                                    extractProgress.percent < 100)
                                }
                                onClick={() =>
                                  setDialog({
                                    type: "extract",
                                    game: local,
                                    file,
                                  })
                                }
                              >
                                解压安装
                              </button>
                            )}
                            {["installer", "disc"].includes(file.kind) && (
                              <button
                                className="button compact"
                                disabled={!file.available}
                                onClick={() =>
                                  window.playvault
                                    .openInstaller(local.id, file.id)
                                    .catch((e) =>
                                      notify(errorMessage(e), "error"),
                                    )
                                }
                              >
                                {file.kind === "disc"
                                  ? "打开镜像"
                                  : "运行安装程序"}
                              </button>
                            )}
                            <IconButton
                              label="打开所在文件夹"
                              disabled={!file.available}
                              onClick={() =>
                                window.playvault
                                  .revealFile(local.id, file.id)
                                  .catch((e) =>
                                    notify(errorMessage(e), "error"),
                                  )
                              }
                            >
                              <FolderOpen size={17} />
                            </IconButton>
                            <IconButton
                              label="解除文件关联（保留原文件）"
                              onClick={async () => {
                                try {
                                  updateLibrary(
                                    await window.playvault.detachFile(
                                      local.id,
                                      file.id,
                                    ),
                                  );
                                  notify("已解除关联，磁盘上的原文件已保留");
                                } catch (e) {
                                  notify(errorMessage(e), "error");
                                }
                              }}
                            >
                              <Unlink size={16} />
                            </IconButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="data-note">
                    <HardDrive size={14} />
                    文件索引保存在本地。解除关联或移除游戏只修改索引，原始文件始终保留。解压完成后可以在编辑资料中选择启动项。
                  </p>
                  {local && !local.id.startsWith("catalog-") && (
                    <div className="library-record-actions">
                      <button
                        className="text-link"
                        onClick={() => showEdit(local, "edit")}
                      >
                        <Pencil size={14} />
                        编辑游戏 / 选择启动项
                      </button>
                      <button
                        className="text-link danger"
                        onClick={async () => {
                          try {
                            updateLibrary(
                              await window.playvault.removeGame(local.id),
                            );
                            notify("已从游戏库移除，磁盘上的文件已保留");
                          } catch (e) {
                            notify(errorMessage(e), "error");
                          }
                        }}
                      >
                        <Trash2 size={14} />
                        移除游戏记录
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </main>
        </Modal>
      )}
      {extractProgress && extractProgress.percent < 100 && (
        <div className="extraction-status">
          <Archive size={19} />
          <div>
            <strong>{extractProgress.message}</strong>
            <div className="progress-track">
              <span style={{ width: `${extractProgress.percent}%` }} />
            </div>
          </div>
          <b>{extractProgress.percent}%</b>
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.tone === "error" ? (
            <AlertCircle size={20} />
          ) : toast.tone === "info" ? (
            <Sparkles size={19} />
          ) : (
            <Check size={20} />
          )}
          <span>{toast.message}</span>
          <IconButton label="关闭提示" onClick={() => setToast(null)}>
            <X size={15} />
          </IconButton>
        </div>
      )}
      {dialog?.type === "scan" && (
        <ScanDialog
          library={state.library}
          onImported={importDone}
          onClose={closeDialog}
          onLibrary={updateLibrary}
          notify={notify}
        />
      )}
      {dialog?.type === "add" && (
        <AddDialog
          catalog={state.catalog}
          onImported={importDone}
          onClose={closeDialog}
          notify={notify}
        />
      )}
      {dialog?.type === "settings" && (
        <SettingsDialog
          state={state}
          onLibrary={updateLibrary}
          onClose={closeDialog}
          notify={notify}
        />
      )}
      {dialog?.type === "edit" && (
        <EditDialog
          game={dialog.game}
          games={state.library.games}
          onLibrary={updateLibrary}
          onClose={closeDialog}
          notify={notify}
        />
      )}
      {dialog?.type === "sources" && (
        <SourcesDialog
          game={dialog.game}
          onLibrary={updateLibrary}
          onClose={closeDialog}
          notify={notify}
        />
      )}
      {dialog?.type === "extract" && (
        <ExtractDialog
          game={dialog.game}
          file={dialog.file}
          settings={state.library.settings}
          onLibrary={updateLibrary}
          onClose={closeDialog}
          onDone={() => {
            setExtractProgress(null);
            setTab("files");
            setMode("game");
            setDetailsOpen(true);
          }}
          notify={notify}
        />
      )}
      {dialog?.type === "media" && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <Spinner />
            </div>
          }
        >
          <MediaPlayer
            game={dialog.game}
            index={dialog.index}
            onClose={closeDialog}
          />
        </Suspense>
      )}
    </div>
  );
}
function RatingCard({
  label,
  summary,
  icon,
}: {
  label: string;
  summary?: { percent: number | null; total: number };
  icon: string;
}) {
  return (
    <div className="rating-card">
      <div className="rating-card-label">
        <span className={`rating-icon ${icon === "steam" ? "steam" : ""}`}>
          {icon === "steam" ? (
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none">
              <circle
                cx="16"
                cy="8"
                r="4"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle cx="16" cy="8" r="1.5" fill="currentColor" />
              <path
                d="m13 11-6 5M2 13l5 3"
                stroke="currentColor"
                strokeWidth="3"
              />
              <circle
                cx="7"
                cy="16"
                r="3"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          ) : (
            icon
          )}
        </span>
        {label}
      </div>
      <div
        className={`rating-number ${summary?.percent == null ? "muted" : ""}`}
      >
        {summary?.percent != null ? (
          <>
            <span>{summary.percent.toFixed(1)}</span>
            <small>%</small>
            <span className="rating-verdict">好评率</span>
          </>
        ) : (
          "—"
        )}
      </div>
      <div className="rating-footnote">
        {summary
          ? `${new Intl.NumberFormat("zh-CN").format(summary.total)} 条评论 · 全时段好评率`
          : "暂未获取 · 可手动同步资料"}
      </div>
    </div>
  );
}
