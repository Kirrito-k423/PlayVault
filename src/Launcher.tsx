import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FolderOpen,
  Heart,
  Home,
  LayoutGrid,
  LibraryBig,
  Menu,
  Minus,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  ScanLine,
  Search,
  Settings,
  Square,
  Trophy,
  X,
  ImagePlus,
  Pencil,
  Film,
  HardDrive,
  RefreshCw,
  Check,
} from "lucide-react";
import type { AppState, Game } from "../shared/types";
import {
  GAME_CATEGORIES,
  matchesCategory,
  type GameCategory,
} from "../shared/categories";
import {
  Art,
  Brand,
  bytes,
  fileName,
  IconButton,
  Modal,
  Spinner,
  status,
  statusText,
} from "./ui";

export type LauncherTab = "overview" | "media" | "scores" | "files";
type Scope = "library" | "catalog";
type Filter = "all" | "installed" | "archive" | "favorite" | "metadata";
type Mode = "collection" | "game";
export interface LauncherProps {
  state: AppState;
  active?: Game;
  local?: Game;
  games: Game[];
  scope: Scope;
  filter: Filter;
  category: GameCategory;
  mode: Mode;
  libraryOpen: boolean;
  query: string;
  sort: string;
  searchRef: RefObject<HTMLInputElement | null>;
  motion: boolean;
  menu: boolean;
  refreshing: boolean;
  launching: boolean;
  isRunning: boolean;
  cta: string;
  onMode(mode: Mode): void;
  onLibrary(open: boolean): void;
  onScope(scope: Scope): void;
  onFilter(filter: Filter): void;
  onCategory(category: GameCategory): void;
  onQuery(value: string): void;
  onSort(value: string): void;
  onSelect(game: Game, open?: boolean): void;
  onDetails(tab: LauncherTab): void;
  onMedia(game: Game, index?: number): void;
  onMotion(): void;
  onMotionError(): void;
  onMenu(open: boolean): void;
  onPrimary(): void;
  onFavorite(game: Game): void;
  onRefresh(game: Game): void;
  onEdit(game: Game, type: "edit" | "sources"): void;
  onAttach(game: Game, kind: "executable" | "package"): void;
  onAddMedia(game: Game, kind: "art" | "gif" | "video"): void;
  onSettings(): void;
  onScan(): void;
  onAdd(): void;
}

const headlines: Record<number, [string, string]> = {
  3489700: ["为人类的未来", "挥刃而战"],
  1245620: ["循着赐福", "再赴交界地"],
  1086940: ["你的选择", "书写传奇"],
  1091500: ["重返夜之城", "续写你的传奇"],
  1145360: ["命运，从不止一次", "再闯冥界"],
  367520: ["深入圣巢", "寻回失落的光"],
  292030: ["循着命运", "踏上狩魔之路"],
};

export default function Launcher(p: LauncherProps) {
  const { active: game, local, mode } = p;
  const [infoTab, setInfoTab] = useState<"about" | "scores" | "files">("about");
  const deckRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setInfoTab("about");
    deckRef.current?.querySelector(".selected")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [game?.id]);
  const scene = game?.backdrop || game?.hero || game?.screenshots[0] || "";
  const headline = headlines[game?.steamAppId || 0] || [
    "让每一场冒险",
    "都有归处",
  ];
  const poster = game?.poster || game?.hero || "";
  const trailer = game?.movies[0];
  const thumbnail =
    trailer?.thumbnail || game?.screenshots[0] || game?.hero || "";
  const winners = game?.awards.filter((a) => a.result === "winner") || [];
  const readyFile = local?.files.find((f) => f.id === local.launchFileId);
  const libraryCount = p.state.library.games.length;
  const quickGames = p.state.library.games.filter(
    (g) => g.id === local?.id || g.favorite,
  );
  const selectedFavorite = local?.favorite || false;
  return (
    <div
      className={`launcher mode-${mode} ${game?.steamAppId === 3489700 ? "theme-stellar" : ""}`}
    >
      <div className="launcher-scene" key={game?.id || "empty"}>
        {scene ? (
          <img
            className="launcher-backdrop"
            src={scene}
            alt=""
            draggable={false}
          />
        ) : (
          <div className="launcher-placeholder">
            <div />
            <div />
            <div />
          </div>
        )}
        {p.motion && trailer?.preview && (
          <video
            className="launcher-motion hero-video"
            src={trailer.preview}
            autoPlay
            muted
            loop
            playsInline
            onError={p.onMotionError}
          />
        )}
        <div className="launcher-vignette" />
        <div className="launcher-bottom-shade" />
      </div>

      <div className="launcher-drag-zone" />
      <div className="launcher-window-controls">
        <IconButton label="设置" onClick={p.onSettings}>
          <Settings size={23} />
        </IconButton>
        <IconButton
          label="最小化"
          onClick={() => window.playvault.windowAction("minimize")}
        >
          <Minus size={25} />
        </IconButton>
        <IconButton
          label="最大化或还原"
          onClick={() => window.playvault.windowAction("maximize")}
        >
          <Square size={17} />
        </IconButton>
        <IconButton
          label="关闭应用"
          className="window-close"
          onClick={() => window.playvault.windowAction("close")}
        >
          <X size={26} />
        </IconButton>
      </div>

      <aside className="launcher-rail" aria-label="启动器导航">
        <button
          className="launcher-brand"
          aria-label="游迹首页"
          title="游迹 PlayVault"
          onClick={() => p.onMode("collection")}
        >
          <Brand />
        </button>
        {mode === "game" && (
          <button
            className="rail-back"
            aria-label="返回游戏总览"
            title="返回游戏总览"
            onClick={() => p.onMode("collection")}
          >
            <ArrowLeft size={24} />
          </button>
        )}
        <div
          className="rail-game-shortcuts"
          tabIndex={0}
          role="navigation"
          aria-label="收藏游戏，可上下滚动"
        >
          {quickGames.map((g) => (
            <button
              key={g.id}
              aria-label={`打开 ${g.name} 主页`}
              title={g.name}
              className={g.id === local?.id ? "selected" : ""}
              aria-current={g.id === local?.id ? "page" : undefined}
              ref={(element) => {
                if (g.id === local?.id)
                  element?.scrollIntoView({ block: "nearest" });
              }}
              onClick={() => {
                p.onScope("library");
                p.onSelect(g, true);
              }}
            >
              <Art src={g.poster || g.hero} alt={g.name} eager />
            </button>
          ))}
        </div>
        <div className="launcher-rail-bottom">
          <button
            className="rail-profile"
            aria-label="我的收藏"
            title="我的收藏"
            onClick={() => {
              p.onScope("library");
              p.onFilter("favorite");
              p.onLibrary(true);
            }}
          >
            <Heart size={21} />
          </button>
          <span className="rail-separator" />
          <button
            className="rail-library"
            aria-label="游戏库"
            title="游戏库 · 搜索与管理"
            onClick={() => p.onLibrary(true)}
          >
            <LayoutGrid size={29} />
            {libraryCount > 0 && (
              <span className="rail-library-count">{libraryCount}</span>
            )}
          </button>
        </div>
      </aside>

      <main className="launcher-stage">
        {game ? (
          <>
            <div className="launcher-game-brand">
              <h1 className="sr-only">{game.name}</h1>
              <GameLogo game={game} />
            </div>
            <aside className="launcher-tools" aria-label="游戏快捷操作">
              <Tool
                label="游戏主页"
                onClick={() =>
                  p.onMode(mode === "game" ? "collection" : "game")
                }
              >
                <Home />
              </Tool>
              <Tool label="观看预告" onClick={() => p.onMedia(game)}>
                <Clapperboard />
              </Tool>
              <Tool label="评分与奖项" onClick={() => p.onDetails("scores")}>
                <Trophy />
              </Tool>
              <Tool
                label={`本地文件 ${local?.files.length || 0}`}
                onClick={() => p.onDetails("files")}
              >
                <FolderOpen />
              </Tool>
              <Tool
                label={selectedFavorite ? "取消收藏" : "收藏游戏"}
                active={selectedFavorite}
                onClick={() => p.onFavorite(game)}
              >
                <Heart fill={selectedFavorite ? "currentColor" : "none"} />
              </Tool>
              <Tool label="扫描导入" onClick={p.onScan}>
                <ScanLine />
              </Tool>
              <Tool label="添加游戏" onClick={p.onAdd}>
                <Plus />
              </Tool>
            </aside>

            {mode === "collection" ? (
              <div className="collection-layout">
                <section className="collection-intro">
                  {winners.length > 0 && (
                    <button
                      className="collection-award"
                      onClick={() => p.onDetails("scores")}
                    >
                      <Trophy size={15} />
                      {winners[0].year} {winners[0].organization} ·{" "}
                      {winners[0].category}
                    </button>
                  )}
                  <p>
                    {game.description ||
                      "把你的游戏与珍藏的安装包，放进同一个世界。关联 Steam 资料，让每一场冒险都有自己的封面与故事。"}
                  </p>
                  <button
                    className="collection-detail-link"
                    onClick={() => p.onMode("game")}
                  >
                    进入游戏主页
                    <ArrowRight size={18} />
                  </button>
                </section>
                <section className="game-deck" aria-label="选择游戏">
                  <div className="deck-heading">
                    <span>
                      {p.scope === "library" ? "我的游戏" : "游戏资料预览"}
                      <i />
                      {p.games.length} 款
                    </span>
                    <div>
                      <button
                        onClick={() => {
                          p.onScope(
                            p.scope === "library" ? "catalog" : "library",
                          );
                        }}
                      >
                        {p.scope === "library" ? "资料探索" : "我的游戏"}
                        <ChevronRight size={14} />
                      </button>
                      <button
                        aria-label="打开完整游戏库"
                        onClick={() => p.onLibrary(true)}
                      >
                        <LayoutGrid size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="deck-scroll" ref={deckRef}>
                    {p.games.map((g) => (
                      <button
                        key={g.id}
                        className={`deck-game ${g.id === game.id ? "selected" : ""}`}
                        aria-label={`选择 ${g.name}`}
                        title={g.id === game.id ? "进入游戏主页" : g.name}
                        onClick={() => p.onSelect(g, g.id === game.id)}
                      >
                        <div className="deck-cover">
                          <Art src={g.poster || g.hero} alt={g.name} eager />
                          {status(g) === "archive" && (
                            <span className="deck-state">待安装</span>
                          )}
                          {status(g) === "installed" && (
                            <span className="deck-ready">
                              <Check size={12} />
                            </span>
                          )}
                          <div className="deck-hover">
                            <Play size={25} fill="currentColor" />
                            <span>查看详情</span>
                          </div>
                        </div>
                        <strong>{g.name}</strong>
                      </button>
                    ))}
                  </div>
                  {p.games.length > 6 && (
                    <button
                      className="deck-next"
                      aria-label="向后浏览游戏"
                      onClick={() =>
                        deckRef.current?.scrollBy({
                          left: 500,
                          behavior: "smooth",
                        })
                      }
                    >
                      <ChevronRight size={24} />
                    </button>
                  )}
                </section>
              </div>
            ) : (
              <>
                <section className="game-promotion">
                  <p className="promotion-kicker">
                    {game.originalName || game.name}
                  </p>
                  <h2>
                    <span>{headline[0]}</span>
                    <strong>{headline[1]}</strong>
                  </h2>
                  <div className="promotion-caption">
                    <span />
                    {game.genres.slice(0, 3).join(" · ") || "你的本地游戏收藏"}
                    <span />
                  </div>
                  <div className="promotion-buttons">
                    <button
                      className="promotion-more"
                      onClick={() => p.onDetails("overview")}
                    >
                      游戏详情
                      <ChevronRight size={19} />
                    </button>
                    {trailer?.preview && (
                      <button
                        className="background-play"
                        aria-label={p.motion ? "动态背景已开启" : "动态背景"}
                        title={p.motion ? "暂停动态背景" : "播放动态背景"}
                        onClick={p.onMotion}
                      >
                        {p.motion ? (
                          <Pause size={21} fill="currentColor" />
                        ) : (
                          <Play size={19} fill="currentColor" />
                        )}
                      </button>
                    )}
                  </div>
                </section>

                <section className="game-info-card">
                  <button
                    className="promotion-trailer"
                    aria-label="播放游戏宣传片"
                    onClick={() => p.onMedia(game)}
                  >
                    <Art src={thumbnail} alt={`${game.name} 宣传影像`} eager />
                    <div className="promotion-trailer-shade" />
                    <div className="promotion-trailer-caption">
                      <span>{game.name}</span>
                      <strong>{trailer ? "官方宣传片" : "走进游戏世界"}</strong>
                    </div>
                    <span className="promotion-play-icon">
                      <Play fill="currentColor" size={21} />
                    </span>
                  </button>
                  <div className="game-info-body">
                    <div className="game-info-tabs">
                      <button
                        className={infoTab === "about" ? "selected" : ""}
                        onClick={() => setInfoTab("about")}
                      >
                        介绍
                      </button>
                      <button
                        className={infoTab === "scores" ? "selected" : ""}
                        onClick={() => setInfoTab("scores")}
                      >
                        评分
                      </button>
                      <button
                        className={infoTab === "files" ? "selected" : ""}
                        onClick={() => setInfoTab("files")}
                      >
                        本地
                      </button>
                      <button
                        className="info-expand"
                        aria-label="展开游戏详情"
                        onClick={() =>
                          p.onDetails(
                            infoTab === "about"
                              ? "overview"
                              : infoTab === "scores"
                                ? "scores"
                                : "files",
                          )
                        }
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                    {infoTab === "about" ? (
                      <p className="info-description">
                        {game.description ||
                          "还没有游戏介绍。匹配 Steam 资料，即可展示宣传图、视频、文字介绍与评分。"}
                      </p>
                    ) : infoTab === "scores" ? (
                      !game.steamAppId ? (
                        <div className="info-scores">
                          {game.critics.slice(0, 3).map((score) => (
                            <button
                              key={score.name}
                              onClick={() => p.onDetails("scores")}
                            >
                              <span>{score.name}</span>
                              <strong>
                                {score.score}
                                <small> / {score.max}</small>
                              </strong>
                            </button>
                          ))}
                          {!game.critics.length && (
                            <button onClick={() => p.onDetails("scores")}>
                              <span>来源评分</span>
                              <strong>—</strong>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="info-scores">
                          <button onClick={() => p.onDetails("scores")}>
                            <span>Steam 简体中文</span>
                            <strong>
                              {game.reviews?.chinese.percent != null
                                ? `${game.reviews.chinese.percent.toFixed(1)}%`
                                : "—"}
                            </strong>
                          </button>
                          <button onClick={() => p.onDetails("scores")}>
                            <span>Steam 其他语言</span>
                            <strong>
                              {game.reviews?.other.percent != null
                                ? `${game.reviews.other.percent.toFixed(1)}%`
                                : "—"}
                            </strong>
                          </button>
                          <button onClick={() => p.onDetails("scores")}>
                            <span>Metacritic</span>
                            <strong>
                              {game.critics.find((c) => c.name === "Metacritic")
                                ?.score ?? "—"}
                            </strong>
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="info-local">
                        <p>
                          <span
                            className={`status-dot ${status(local || game)}`}
                          />
                          {statusText(local || game)}
                          <span>{local?.files.length || 0} 个关联文件</span>
                        </p>
                        <button onClick={() => p.onDetails("files")}>
                          {readyFile
                            ? fileName(readyFile.path)
                            : "定位游戏程序或关联安装包"}
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                <section className="launcher-launch-area">
                  <div className="launch-actions">
                    <button
                      className="launch-pill"
                      disabled={p.launching || p.isRunning}
                      onClick={p.onPrimary}
                    >
                      <span className="launch-pill-icon">
                        {p.launching ? (
                          <Spinner />
                        ) : p.cta === "解压并安装" ? (
                          <Archive size={23} />
                        ) : (
                          <Play size={23} fill="currentColor" />
                        )}
                      </span>
                      <strong>{p.cta}</strong>
                    </button>
                    <div className="launcher-menu-container">
                      <button
                        className="launcher-menu-button"
                        aria-label="更多游戏选项"
                        onClick={() => p.onMenu(!p.menu)}
                      >
                        <Menu size={29} />
                      </button>
                      {p.menu && (
                        <>
                          <div
                            className="menu-scrim"
                            onClick={() => p.onMenu(false)}
                          />
                          <div className="dropdown launch-dropdown">
                            <button onClick={() => p.onEdit(game, "edit")}>
                              <Pencil size={16} />
                              编辑 / 匹配游戏
                            </button>
                            <button
                              onClick={() => {
                                p.onMenu(false);
                                p.onAddMedia(game, "art");
                              }}
                            >
                              <ImagePlus size={16} />
                              更换宣传背景
                            </button>
                            <button
                              onClick={() => {
                                p.onMenu(false);
                                p.onAddMedia(game, "video");
                              }}
                            >
                              <Film size={16} />
                              添加本地视频
                            </button>
                            <button
                              onClick={() => {
                                p.onMenu(false);
                                p.onAddMedia(game, "gif");
                              }}
                            >
                              <ImagePlus size={16} />
                              添加 GIF 动图
                            </button>
                            <button onClick={() => p.onEdit(game, "sources")}>
                              <Trophy size={16} />
                              管理媒体分数与奖项
                            </button>
                            <button
                              onClick={() => {
                                p.onMenu(false);
                                p.onAttach(game, "package");
                              }}
                            >
                              <Archive size={16} />
                              关联安装包
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="launch-subtitle">
                    {readyFile?.available ? (
                      <button
                        title={readyFile.path}
                        onClick={() => p.onDetails("files")}
                      >
                        <span className="status-dot installed" />
                        本地游戏已就绪<span>{bytes(readyFile.size)}</span>
                        <ChevronRight size={14} />
                      </button>
                    ) : (
                      <button onClick={() => p.onAttach(game, "package")}>
                        已有安装包？<em>关联文件</em>
                        <ChevronRight size={15} />
                      </button>
                    )}
                  </div>
                </section>
              </>
            )}
            {mode === "collection" && trailer?.preview && (
              <button
                className="collection-motion-toggle"
                aria-label={p.motion ? "动态背景已开启" : "动态背景"}
                onClick={p.onMotion}
              >
                {p.motion ? <Pause size={16} /> : <MonitorPlay size={17} />}
                动态背景
              </button>
            )}
          </>
        ) : (
          <section className="launcher-empty">
            <Brand />
            <h1>
              {p.scope === "library"
                ? "下一场冒险，从这里开始。"
                : "没有匹配的游戏"}
            </h1>
            <p>把散落在磁盘中的游戏和安装包，收藏到同一个地方。</p>
            <div>
              <button className="button primary" onClick={p.onScan}>
                <ScanLine size={19} />
                扫描游戏文件夹
              </button>
              <button className="button" onClick={p.onAdd}>
                <Plus size={19} />
                手动添加
              </button>
            </div>
            <button className="text-link" onClick={() => p.onScope("catalog")}>
              浏览游戏资料
              <ArrowRight size={15} />
            </button>
          </section>
        )}
      </main>
      {p.libraryOpen && <LibraryOverlay p={p} />}
    </div>
  );
}

function GameLogo({ game }: { game: Game }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [game.logo, game.id]);
  return game.logo && !failed ? (
    <img
      className="game-logo"
      src={game.logo}
      alt={`${game.name} 官方标志`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  ) : (
    <div className="game-wordmark">
      <strong>{game.name}</strong>
      <span>{game.originalName || "PLAYVAULT COLLECTION"}</span>
    </div>
  );
}
function Tool({
  children,
  label,
  onClick,
  active = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`launcher-tool ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
      <span className="launcher-tooltip">{label}</span>
    </button>
  );
}
function LibraryOverlay({ p }: { p: LauncherProps }) {
  return (
    <Modal
      className="library-modal"
      title="我的游戏库"
      eyebrow="PLAYVAULT"
      onClose={() => p.onLibrary(false)}
      wide
    >
      <div className="library-toolbar">
        <nav>
          <button
            className={p.scope === "library" ? "selected" : ""}
            onClick={() => {
              p.onScope("library");
              p.onLibrary(true);
            }}
          >
            我的游戏<span>{p.state.library.games.length}</span>
          </button>
          <button
            className={p.scope === "catalog" ? "selected" : ""}
            onClick={() => {
              p.onScope("catalog");
              p.onLibrary(true);
            }}
          >
            资料探索<span>{p.state.catalog.length}</span>
          </button>
        </nav>
        <div className="search-box">
          <Search size={18} />
          <input
            ref={p.searchRef}
            value={p.query}
            aria-label="搜索游戏"
            placeholder="搜索名称、类型或本地路径"
            onChange={(e) => p.onQuery(e.target.value)}
          />
          {p.query ? (
            <button aria-label="清空搜索" onClick={() => p.onQuery("")}>
              <X size={15} />
            </button>
          ) : (
            <kbd>Ctrl K</kbd>
          )}
        </div>
        <button className="button compact" onClick={p.onScan}>
          <ScanLine size={16} />
          扫描导入
        </button>
        <button className="button primary compact" onClick={p.onAdd}>
          <Plus size={16} />
          添加游戏
        </button>
      </div>
      <div className="library-filterbar">
        <div className="filters">
          {(p.scope === "catalog"
            ? [["all", "精选资料"]]
            : [
                ["all", "全部游戏"],
                ["installed", "可启动"],
                ["archive", "待安装"],
                ["favorite", "我的收藏"],
              ]
          ).map(([id, label]) => (
            <button
              key={id}
              className={p.filter === id ? "selected" : ""}
              onClick={() => p.onFilter(id as Filter)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="游戏排序"
          value={p.sort}
          onChange={(e) => p.onSort(e.target.value)}
        >
          <option value="name">按名称排序</option>
          <option value="recent">最近游玩 / 添加</option>
          <option value="score">Steam 好评优先</option>
        </select>
      </div>
      <nav className="library-categories" aria-label="游戏类型筛选">
        {GAME_CATEGORIES.map(([id, label]) => {
          const source =
            p.scope === "catalog" ? p.state.catalog : p.state.library.games;
          const count = source.filter((g) => matchesCategory(g, id)).length;
          return (
            <button
              key={id}
              aria-pressed={p.category === id}
              className={p.category === id ? "selected" : ""}
              onClick={() => p.onCategory(id)}
            >
              {label}
              <span>{count}</span>
            </button>
          );
        })}
      </nav>
      <div className="library-grid-scroll">
        <div className="game-grid">
          {p.games.map((g) => (
            <button
              key={g.id}
              className="grid-game"
              onClick={() => p.onSelect(g, true)}
            >
              <div className="grid-poster">
                <Art src={g.poster || g.hero} alt={g.name} />
                <span className={`game-state ${status(g)}`}>
                  <i />
                  {p.scope === "catalog" ? "资料预览" : statusText(g)}
                </span>
                <div className="grid-hover">
                  <Play size={26} fill="currentColor" />
                  <span>进入游戏主页</span>
                </div>
              </div>
              <div className="grid-game-info">
                <h3>{g.name}</h3>
                <p>
                  {g.genres.slice(0, 2).join(" · ") || "本地游戏"}
                  <span>
                    {g.reviews?.all.percent != null
                      ? `${g.reviews.all.percent}%`
                      : ""}
                  </span>
                </p>
              </div>
            </button>
          ))}
          <button className="add-card" onClick={p.onAdd}>
            <Plus size={33} strokeWidth={1} />
            <span>添加下一场冒险</span>
          </button>
        </div>
        {!p.games.length && (
          <p className="library-no-results">
            {p.query || p.category !== "all" || p.filter !== "all"
              ? "没有符合当前类型、状态和搜索条件的游戏。"
              : "这里还没有游戏。点击扫描导入，找到你的收藏。"}
          </p>
        )}
      </div>
      <div className="library-footer">
        <span>
          <HardDrive size={13} />
          本地游戏索引
        </span>
        <span>
          {p.games.length} 款游戏 · v{p.state.version}
        </span>
      </div>
    </Modal>
  );
}
