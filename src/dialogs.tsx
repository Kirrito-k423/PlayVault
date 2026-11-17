import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Plus,
  FolderOpen,
  ScanLine,
  X,
  Archive,
  MonitorPlay,
  Check,
  Search,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  HardDrive,
  Download,
  Upload,
  AlertCircle,
  Trophy,
  Trash2,
  Link2,
  FileJson,
  Film,
} from "lucide-react";
import type {
  AppState,
  Award,
  CriticScore,
  Game,
  Library,
  LocalFile,
  ScanProgress,
  ScanResult,
  Settings,
} from "../shared/types";
import { Art, bytes, fileName, IconButton, Modal, Spinner } from "./ui";
import { errorMessage, type Notify } from "./ui";
import { isGameExecutable } from "../shared/files";

type BaseProps = { onClose: () => void; notify: Notify };
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const controls = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (node) => {
      if (!isValidElement(node)) return node;
      const element = node as ReactElement<Record<string, unknown>>;
      if (
        typeof node.type === "string" &&
        ["input", "textarea", "select"].includes(node.type)
      )
        return cloneElement(element, {
          "aria-labelledby": `${id}-label`,
          "aria-describedby": hint ? `${id}-hint` : undefined,
        });
      return element.props.children
        ? cloneElement(element, {
            children: controls(element.props.children as ReactNode),
          })
        : element;
    });
  return (
    <div className="field">
      <span id={`${id}-label`}>{label}</span>
      {controls(children)}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
function InlineError({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="inline-error">
      <AlertCircle size={17} />
      <span>{error}</span>
    </div>
  ) : null;
}
function appIdFrom(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const match = value.match(/\/app\/(\d+)/);
  const id = Number(match ? match[1] : value.trim());
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("请输入有效的 Steam App ID，或 Steam 商店链接");
  return id;
}
export function ScanDialog({
  library,
  onImported,
  onLibrary,
  onClose,
  notify,
}: {
  library: Library;
  onImported: (l: Library) => void;
  onLibrary: (l: Library) => void;
} & BaseProps) {
  const [roots, setRoots] = useState(library.roots),
    [manual, setManual] = useState(""),
    [busy, setBusy] = useState(false),
    [importing, setImporting] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null),
    [selected, setSelected] = useState(new Set<string>()),
    [progress, setProgress] = useState<ScanProgress>({
      visited: 0,
      found: 0,
      directory: "",
    });
  const [expanded, setExpanded] = useState("");
  useEffect(() => window.playvault.onScanProgress(setProgress), []);
  const saveRoots = async (next: string[]) => {
    try {
      const lib = await window.playvault.saveRoots(next);
      setRoots(next);
      onLibrary(lib);
      setResult(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const add = async (value?: string) => {
    try {
      const dir = value || (await window.playvault.chooseDirectory());
      if (dir && !roots.some((r) => r.toLowerCase() === dir.toLowerCase())) {
        await saveRoots([...roots, dir]);
        setManual("");
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const scan = async () => {
    setBusy(true);
    setResult(null);
    setError("");
    setProgress({ visited: 0, found: 0, directory: "" });
    try {
      const next = await window.playvault.scan(roots);
      setResult(next);
      setSelected(new Set(next.candidates.map((c) => c.id)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setImporting(true);
    setError("");
    try {
      const lib = await window.playvault.importCandidates([...selected]);
      onImported(lib);
      notify(`已导入 ${selected.size} 个游戏目录，重复文件已自动合并`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setImporting(false);
    }
  };
  const close = () => {
    if (busy) window.playvault.cancelScan();
    onClose();
  };
  return (
    <Modal
      title="把散落的游戏，找回来。"
      eyebrow="SCAN YOUR COLLECTION"
      onClose={close}
      wide
    >
      <div className="scan-steps">
        <span className="active">
          <b>01</b>选择文件夹
        </span>
        <ChevronRight size={13} />
        <span className={result ? "active" : ""}>
          <b>02</b>确认扫描结果
        </span>
        <ChevronRight size={13} />
        <span>
          <b>03</b>加入游戏库
        </span>
      </div>
      <div className="modal-body">
        <p className="modal-intro">
          添加游戏或安装包所在的文件夹，可以来自不同磁盘。扫描只读取索引，支持
          EXE、ZIP、7Z、RAR、ISO 和分卷。
        </p>
        <div className="root-list">
          {roots.map((root) => (
            <div className="root-row" key={root}>
              <HardDrive size={19} />
              <code>{root}</code>
              <IconButton
                label={`移除扫描目录 ${root}`}
                disabled={busy}
                onClick={() => saveRoots(roots.filter((r) => r !== root))}
              >
                <X size={15} />
              </IconButton>
            </div>
          ))}
        </div>
        <div className="directory-input">
          <input
            aria-label="扫描目录路径"
            placeholder="输入文件夹路径，例如 D:\Games"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual) add(manual);
            }}
          />
          <button
            className="button compact"
            disabled={!manual || busy}
            onClick={() => add(manual)}
          >
            <Plus size={16} />
            添加路径
          </button>
          <button
            className="button compact"
            disabled={busy}
            onClick={() => add()}
          >
            <FolderOpen size={16} />
            选择文件夹
          </button>
        </div>
        <div className="scan-controls">
          <span>
            <ShieldCheck size={15} />
            跳过系统目录、符号链接和常见辅助程序
          </span>
          {busy ? (
            <button
              className="button compact"
              onClick={() => window.playvault.cancelScan()}
            >
              停止扫描
            </button>
          ) : (
            <button
              className="button primary compact"
              disabled={!roots.length}
              onClick={scan}
            >
              <ScanLine size={16} />
              {result ? "重新扫描" : "开始扫描"}
            </button>
          )}
        </div>
        {busy && (
          <div className="scan-progress">
            <div>
              <Spinner />
              <strong>正在寻找你的游戏</strong>
              <span>
                已检查 {progress.visited.toLocaleString()} 项 · 找到{" "}
                {progress.found} 个目录
              </span>
            </div>
            <div className="progress-track indeterminate">
              <span />
            </div>
            <p>{progress.directory || "准备读取目录…"}</p>
          </div>
        )}
        {result && (
          <>
            <div className="result-heading">
              <div>
                <h3>发现 {result.candidates.length} 个可能的游戏</h3>
                <p>
                  {result.cancelled
                    ? "扫描已停止，可导入已发现的结果。"
                    : "请确认需要加入游戏库的目录，扫描可能包含其他程序。"}
                </p>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={
                    result.candidates.length > 0 &&
                    selected.size === result.candidates.length
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(result.candidates.map((c) => c.id))
                        : new Set(),
                    )
                  }
                />
                全选
              </label>
            </div>
            {result.warnings.map((w, i) => (
              <p key={i} className="inline-notice">
                <AlertCircle size={15} />
                {w}
              </p>
            ))}
            <div className="scan-results">
              {result.candidates.map((c) => (
                <div className="candidate" key={c.id}>
                  <div className="candidate-main">
                    <input
                      aria-label={`导入 ${c.name}`}
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        e.target.checked ? next.add(c.id) : next.delete(c.id);
                        setSelected(next);
                      }}
                    />
                    <span className="candidate-icon">
                      {c.files.some((f) => f.kind === "executable") ? (
                        <MonitorPlay size={21} />
                      ) : (
                        <Archive size={21} />
                      )}
                    </span>
                    <button
                      className="candidate-name"
                      onClick={() => setExpanded(expanded === c.id ? "" : c.id)}
                    >
                      <strong>{c.name}</strong>
                      <small title={c.directory}>{c.directory}</small>
                    </button>
                    <span className="candidate-meta">
                      {c.files.length} 个文件
                      {c.steamAppId && <small>Steam #{c.steamAppId}</small>}
                    </span>
                    <IconButton
                      label={`查看 ${c.name} 的文件`}
                      onClick={() => setExpanded(expanded === c.id ? "" : c.id)}
                    >
                      <ChevronRight
                        size={16}
                        className={expanded === c.id ? "rotate" : ""}
                      />
                    </IconButton>
                  </div>
                  {expanded === c.id && (
                    <div className="candidate-files">
                      {c.files.map((f) => (
                        <div key={f.id}>
                          <span>
                            {f.kind === "executable"
                              ? "程序"
                              : f.kind === "installer"
                                ? "安装程序"
                                : "安装包"}
                          </span>
                          <code title={f.path}>{f.path}</code>
                          <small>
                            {bytes(f.size)}
                            {f.parts && f.parts > 1 ? ` · ${f.parts} 卷` : ""}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!result.candidates.length && (
                <div className="empty-small">
                  <Search size={30} />
                  <h3>这里还没有发现游戏</h3>
                  <p>请选择更具体的游戏文件夹，或直接手动添加程序和安装包。</p>
                </div>
              )}
            </div>
            <p className="scan-summary">
              扫描 {result.visited.toLocaleString()} 项 · 跳过{" "}
              {result.skipped.toLocaleString()} 项 · 未执行或修改文件
            </p>
          </>
        )}
        <InlineError error={error} />
      </div>
      <footer className="modal-footer">
        <span>
          {result
            ? `已选择 ${selected.size} 个目录`
            : "建议选择游戏目录，避免扫描整个磁盘"}
        </span>
        <div>
          <button className="button" onClick={close}>
            关闭
          </button>
          <button
            className="button primary"
            disabled={!result || !selected.size || busy || importing}
            onClick={finish}
          >
            {importing ? <Spinner /> : <Plus size={17} />}加入游戏库
            <ArrowRight size={16} />
          </button>
        </div>
      </footer>
    </Modal>
  );
}
export function AddDialog({
  catalog,
  onImported,
  onClose,
  notify,
}: { catalog: Game[]; onImported: (l: Library) => void } & BaseProps) {
  const [name, setName] = useState(""),
    [file, setFile] = useState(""),
    [appId, setAppId] = useState(""),
    [kind, setKind] = useState<"executable" | "package">("executable");
  const [search, setSearch] = useState(""),
    [results, setResults] = useState<
      { appId: number; name: string; image: string }[]
    >([]),
    [searching, setSearching] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const choose = async () => {
    try {
      const selected = await window.playvault.chooseFile(kind);
      if (selected) {
        setFile(selected);
        if (!name)
          setName(fileName(selected).replace(/\.(exe|7z|zip|rar|iso)$/i, ""));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const searchSteam = async () => {
    setSearching(true);
    setError("");
    try {
      setResults(await window.playvault.searchSteam(search));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSearching(false);
    }
  };
  const match = (g: { appId: number; name: string }) => {
    setName(g.name);
    setAppId(String(g.appId));
    setResults([]);
    setSearch("");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const lib = await window.playvault.addGame({
        name,
        path: file || undefined,
        steamAppId: appIdFrom(appId),
      });
      onImported(lib);
      notify("游戏已加入收藏，可以继续关联程序和安装包");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="收藏下一场冒险"
      eyebrow="ADD TO YOUR COLLECTION"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <Field label="游戏名称">
            <input
              required
              maxLength={200}
              placeholder="例如：艾尔登法环"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="file-kind-tabs">
            <button
              type="button"
              className={kind === "executable" ? "selected" : ""}
              onClick={() => setKind("executable")}
            >
              <MonitorPlay size={16} />
              已安装游戏
            </button>
            <button
              type="button"
              className={kind === "package" ? "selected" : ""}
              onClick={() => setKind("package")}
            >
              <Archive size={16} />
              安装包 / 光盘镜像
            </button>
          </div>
          <Field
            label={
              kind === "executable"
                ? "游戏启动程序（可选）"
                : "安装包路径（可选）"
            }
            hint="也可以先添加游戏资料，之后再关联本地文件。"
          >
            <div className="input-action">
              <input
                placeholder={
                  kind === "executable"
                    ? "D:\Games\Game\Game.exe"
                    : "E:\Archives\Game.7z"
                }
                value={file}
                onChange={(e) => setFile(e.target.value)}
              />
              <button type="button" className="button" onClick={choose}>
                <FolderOpen size={16} />
                浏览
              </button>
            </div>
          </Field>
          <Field
            label="关联 Steam 资料（可选）"
            hint="输入 App ID 或商店链接，用于同步宣传图、视频、介绍和评分。"
          >
            <input
              placeholder="1245620 或 https://store.steampowered.com/app/1245620/"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
            />
          </Field>
          <div className="match-search">
            <span className="field-title">不知道 App ID？按名称查找</span>
            <div className="input-action">
              <input
                aria-label="Steam 搜索词"
                placeholder="输入中英文游戏名称"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchSteam();
                  }
                }}
              />
              <button
                type="button"
                className="button"
                disabled={!search.trim() || searching}
                onClick={searchSteam}
              >
                {searching ? <Spinner /> : <Search size={16} />}搜索 Steam
              </button>
            </div>
            {results.length > 0 && (
              <div className="match-results">
                {results.map((r) => (
                  <button key={r.appId} type="button" onClick={() => match(r)}>
                    <Art src={r.image} alt={r.name} />
                    <span>
                      {r.name}
                      <small>App ID {r.appId}</small>
                    </span>
                    <Plus size={16} />
                  </button>
                ))}
              </div>
            )}
            <div className="quick-matches">
              <span>快速关联</span>
              {catalog
                .filter(
                  (g) =>
                    !name ||
                    [g.name, g.originalName]
                      .join(" ")
                      .toLowerCase()
                      .includes(name.toLowerCase()),
                )
                .slice(0, 4)
                .map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() =>
                      match({ appId: g.steamAppId!, name: g.name })
                    }
                  >
                    {g.name}
                  </button>
                ))}
            </div>
          </div>
          <InlineError error={error} />
        </div>
        <footer className="modal-footer">
          <span>文件会留在原来的位置</span>
          <div>
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={busy || !name.trim()}>
              {busy ? <Spinner /> : <Plus size={17} />}加入游戏库
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
export function EditDialog({
  game,
  games,
  onLibrary,
  onClose,
  notify,
}: { game: Game; games: Game[]; onLibrary: (l: Library) => void } & BaseProps) {
  const [name, setName] = useState(game.name),
    [description, setDescription] = useState(game.description),
    [appId, setAppId] = useState(
      game.steamAppId ? String(game.steamAppId) : "",
    ),
    [launchFileId, setLaunchFileId] = useState(game.launchFileId || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const merge = async () => {
    setBusy(true);
    setError("");
    try {
      onLibrary(await window.playvault.mergeGames(game.id, mergeTarget));
      onClose();
      notify("游戏记录已合并，所有本地文件仍保留在原位置");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLibrary(
        await window.playvault.updateGame(game.id, {
          name,
          description,
          steamAppId: appIdFrom(appId),
          launchFileId: launchFileId || undefined,
        }),
      );
      onClose();
      notify("游戏资料已保存；关联新的 App ID 后可同步官方资料");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="编辑游戏档案" eyebrow="MAKE IT YOURS" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <Field label="游戏名称">
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Steam App ID / 商店链接"
            hint="更换 App ID 会重置旧游戏的宣传资料、分数和奖项，本地文件保留。"
          >
            <input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="可选，输入 App ID 或商店链接"
            />
          </Field>
          <Field label="游戏介绍">
            <textarea
              rows={4}
              maxLength={10000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="写下这场冒险的故事…"
            />
          </Field>
          <Field
            label="游戏启动项"
            hint="遇到多个 EXE 时，请选择游戏本体；启动时会使用程序所在文件夹作为工作目录。"
          >
            <select
              aria-label="游戏启动项"
              value={launchFileId}
              onChange={(e) => setLaunchFileId(e.target.value)}
            >
              <option value="">暂不设置</option>
              {game.files.filter(isGameExecutable).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.path}
                </option>
              ))}
            </select>
          </Field>
          {games.some((g) => g.id !== game.id) && (
            <div className="merge-section">
              <Field
                label="重复收藏？合并到已有游戏"
                hint="将本条记录的文件合并到选中的游戏，保留目标游戏的资料；磁盘上的程序与安装包不会移动。"
              >
                <div className="input-action">
                  <select
                    aria-label="合并目标游戏"
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                  >
                    <option value="">选择同一款游戏的另一条记录</option>
                    {games
                      .filter((g) => g.id !== game.id)
                      .map((g) => (
                        <option value={g.id} key={g.id}>
                          {g.name} · {g.files.length} 个文件
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="button"
                    disabled={!mergeTarget || busy}
                    onClick={merge}
                  >
                    <Link2 size={15} />
                    合并记录
                  </button>
                </div>
              </Field>
            </div>
          )}
          <InlineError error={error} />
        </div>
        <footer className="modal-footer">
          <span>自定义你的游戏档案</span>
          <div>
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? <Spinner /> : <Check size={16} />}保存更改
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
export function SourcesDialog({
  game,
  onLibrary,
  onClose,
  notify,
}: { game: Game; onLibrary: (l: Library) => void } & BaseProps) {
  const [critics, setCritics] = useState<CriticScore[]>(
      structuredClone(game.critics),
    ),
    [awards, setAwards] = useState<Award[]>(structuredClone(game.awards)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const score = (i: number, patch: Partial<CriticScore>) =>
    setCritics((rows) =>
      rows.map((r, j) => (i === j ? { ...r, ...patch } : r)),
    );
  const award = (i: number, patch: Partial<Award>) =>
    setAwards((rows) => rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      for (const c of critics)
        if (
          !c.name.trim() ||
          c.score < 0 ||
          c.score > c.max ||
          c.max <= 0 ||
          !c.url.startsWith("https://")
        )
          throw new Error("请填写有效的媒体名称、评分、满分和 HTTPS 来源链接");
      for (const a of awards)
        if (
          !a.organization.trim() ||
          !a.category.trim() ||
          !a.url.startsWith("https://")
        )
          throw new Error("请填写奖项机构、类别和 HTTPS 来源链接");
      onLibrary(
        await window.playvault.updateGame(game.id, {
          name: game.name,
          description: game.description,
          steamAppId: game.steamAppId,
          launchFileId: game.launchFileId,
          critics: critics.map((c) => ({
            ...c,
            fetchedAt: new Date().toISOString(),
          })),
          awards,
        }),
      );
      onClose();
      notify("媒体分数与奖项已保存");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="媒体分数与奖项" eyebrow={game.name} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="modal-body sources-editor">
          <p className="modal-intro">
            为每个分数和奖项留下可追溯的来源。Metacritic 会随 Steam
            资料同步，其他记录由你维护。
          </p>
          <div className="section-heading">
            <h3>媒体分数</h3>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                setCritics([
                  ...critics,
                  {
                    name: "",
                    score: 0,
                    max: 100,
                    url: "",
                    fetchedAt: new Date().toISOString(),
                    platform: "PC",
                  },
                ])
              }
            >
              <Plus size={15} />
              添加媒体
            </button>
          </div>
          {critics.map((c, i) => (
            <div className="source-edit-card" key={i}>
              <div className="form-row">
                <Field label="媒体名称">
                  <input
                    required
                    placeholder="例如 OpenCritic / IGN"
                    value={c.name}
                    onChange={(e) => score(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="得分">
                  <input
                    required
                    type="number"
                    min="0"
                    max={c.max}
                    step="0.1"
                    value={c.score}
                    onChange={(e) =>
                      score(i, { score: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="满分">
                  <input
                    required
                    type="number"
                    min="1"
                    max="1000"
                    value={c.max}
                    onChange={(e) => score(i, { max: Number(e.target.value) })}
                  />
                </Field>
                <IconButton
                  label="删除媒体分数"
                  onClick={() => setCritics(critics.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
              <div className="form-row">
                <Field label="来源链接">
                  <input
                    required
                    type="url"
                    pattern="https://.*"
                    placeholder="https://…"
                    value={c.url}
                    onChange={(e) => score(i, { url: e.target.value })}
                  />
                </Field>
                <Field label="平台 / 备注">
                  <input
                    value={c.platform || ""}
                    onChange={(e) => score(i, { platform: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ))}
          {!critics.length && (
            <p className="empty-editor">还没有媒体分数，点击右上角添加。</p>
          )}
          <div className="section-heading">
            <h3>
              <Trophy size={16} />
              获奖与提名
            </h3>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                setAwards([
                  ...awards,
                  {
                    organization: "TGA",
                    year: new Date().getFullYear(),
                    category: "",
                    result: "winner",
                    url: "",
                  },
                ])
              }
            >
              <Plus size={15} />
              添加奖项
            </button>
          </div>
          {awards.map((a, i) => (
            <div className="source-edit-card" key={i}>
              <div className="form-row">
                <Field label="颁奖机构">
                  <input
                    required
                    value={a.organization}
                    onChange={(e) => award(i, { organization: e.target.value })}
                  />
                </Field>
                <Field label="年份">
                  <input
                    required
                    type="number"
                    min="1970"
                    max="2100"
                    value={a.year}
                    onChange={(e) => award(i, { year: Number(e.target.value) })}
                  />
                </Field>
                <Field label="结果">
                  <select
                    value={a.result}
                    onChange={(e) =>
                      award(i, { result: e.target.value as Award["result"] })
                    }
                  >
                    <option value="winner">获奖</option>
                    <option value="nominee">提名</option>
                  </select>
                </Field>
                <IconButton
                  label="删除奖项"
                  onClick={() => setAwards(awards.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
              <Field label="奖项类别">
                <input
                  required
                  placeholder="例如：年度最佳游戏"
                  value={a.category}
                  onChange={(e) => award(i, { category: e.target.value })}
                />
              </Field>
              <Field label="官方来源链接">
                <input
                  required
                  type="url"
                  pattern="https://.*"
                  placeholder="https://…"
                  value={a.url}
                  onChange={(e) => award(i, { url: e.target.value })}
                />
              </Field>
            </div>
          ))}
          {!awards.length && (
            <p className="empty-editor">
              奖项与评分分开保存，可记录 TGA、BAFTA、D.I.C.E. 等奖项。
            </p>
          )}
          <InlineError error={error} />
        </div>
        <footer className="modal-footer">
          <span>评分不混算，获奖不折算为分数</span>
          <div>
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? <Spinner /> : <Check size={16} />}保存记录
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
export function SettingsDialog({
  state,
  onLibrary,
  onClose,
  notify,
}: { state: AppState; onLibrary: (l: Library) => void } & BaseProps) {
  const [settings, setSettings] = useState(state.library.settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = (patch: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...patch }));
  const pick = async (kind: "directory" | "sevenZip") => {
    try {
      const value =
        kind === "directory"
          ? await window.playvault.chooseDirectory()
          : await window.playvault.chooseFile("sevenZip");
      if (value)
        change(
          kind === "directory"
            ? { installDirectory: value }
            : { sevenZipPath: value },
        );
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLibrary(await window.playvault.saveSettings(settings));
      onClose();
      notify("设置已保存");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const backup = async (importing: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (importing) {
        const lib = await window.playvault.importLibrary();
        if (lib) {
          onLibrary(lib);
          notify("索引已合并导入；自定义媒体仍需保留原 data/media 文件夹");
        }
      } else {
        const file = await window.playvault.exportLibrary();
        if (file) notify(`游戏库索引已导出：${file}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="让游戏库更合你心意" eyebrow="PREFERENCES" onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-body">
          <Field
            label="默认解压位置"
            hint="为每款游戏创建独立目录。建议放在 D / E 盘，已有同名目录时会停止。"
          >
            <div className="input-action">
              <input
                required
                value={settings.installDirectory}
                onChange={(e) => change({ installDirectory: e.target.value })}
              />
              <button
                type="button"
                className="button"
                onClick={() => pick("directory")}
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </Field>
          <Field
            label="7-Zip 程序路径"
            hint="留空时自动查找常见安装位置。仅用于处理 ZIP / 7Z / RAR。"
          >
            <div className="input-action">
              <input
                placeholder="自动查找，或选择 7z.exe"
                value={settings.sevenZipPath}
                onChange={(e) => change({ sevenZipPath: e.target.value })}
              />
              <button
                type="button"
                className="button"
                onClick={() => pick("sevenZip")}
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </Field>
          <label className="setting-toggle">
            <div>
              <strong>自动同步 Steam 资料</strong>
              <p>打开游戏页时更新过期资料，间隔至少 30 分钟。</p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoRefresh}
              onChange={(e) => change({ autoRefresh: e.target.checked })}
            />
          </label>
          <div className="settings-divider" />
          <div className="settings-section">
            <h3>
              <FileJson size={17} />
              备份与迁移
            </h3>
            <p>
              导出游戏库索引，包含路径、资料、分数和奖项。导入时合并记录；本地媒体请连同整个
              data 文件夹迁移。
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => backup(false)}
              >
                <Download size={16} />
                导出索引
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => backup(true)}
              >
                <Upload size={16} />
                导入索引
              </button>
            </div>
          </div>
          <div className="settings-data">
            <HardDrive size={19} />
            <div>
              <strong>数据和缓存所在位置</strong>
              <code>{state.dataDirectory}</code>
              <small>游戏库、宣传媒体和浏览器缓存均保存在这里。</small>
            </div>
          </div>
          <InlineError error={error} />
        </div>
        <footer className="modal-footer">
          <span>游迹 PlayVault · v{state.version}</span>
          <div>
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? <Spinner /> : <Check size={16} />}保存设置
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
export function ExtractDialog({
  game,
  file,
  settings,
  onLibrary,
  onClose,
  onDone,
  notify,
}: {
  game: Game;
  file: LocalFile;
  settings: Settings;
  onLibrary: (l: Library) => void;
  onDone: () => void;
} & BaseProps) {
  const [parent, setParent] = useState(settings.installDirectory),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(
    () =>
      window.playvault.onExtractProgress((p) => {
        if (p.gameId === game.id) {
          setProgress(p.percent);
          setMessage(p.message);
        }
      }),
    [game.id],
  );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await window.playvault.extractGame(
        game.id,
        file.id,
        parent,
      );
      onLibrary(result.library);
      onDone();
      onClose();
      notify(`已解压到 ${result.directory}，请确认游戏启动项`);
    } catch (e) {
      setError(errorMessage(e));
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="让冒险准备就绪" eyebrow="EXTRACT & INSTALL" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="extract-source">
            <Archive size={27} />
            <div>
              <strong>{game.name}</strong>
              <p title={file.path}>{file.path}</p>
              <small>
                {bytes(file.size)}
                {file.parts && file.parts > 1 ? ` · ${file.parts} 个分卷` : ""}
              </small>
            </div>
          </div>
          <Field
            label="目标父目录"
            hint="会在此目录下新建游戏文件夹；已有同名文件夹时停止，避免覆盖。"
          >
            <div className="input-action">
              <input
                required
                disabled={busy}
                value={parent}
                onChange={(e) => setParent(e.target.value)}
              />
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={async () => {
                  const dir = await window.playvault.chooseDirectory();
                  if (dir) setParent(dir);
                }}
              >
                <FolderOpen size={17} />
              </button>
            </div>
          </Field>
          <div className="extract-guarantee">
            <ShieldCheck size={22} />
            <div>
              <strong>珍藏的原安装包会保留</strong>
              <p>
                先校验路径和可用空间，再解压到新目录。完成后识别游戏程序，由你决定何时启动。
              </p>
            </div>
          </div>
          {busy && (
            <div className="extract-progress">
              <div>
                <Spinner />
                <span>{message || "正在准备解压任务…"}</span>
                <b>{progress}%</b>
              </div>
              <div className="progress-track">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <InlineError error={error} />
        </div>
        <footer className="modal-footer">
          <span>
            {busy
              ? "关闭窗口后仍会在后台继续"
              : "支持 ZIP / 7Z / RAR，暂不支持加密包"}
          </span>
          <div>
            <button type="button" className="button" onClick={onClose}>
              {busy ? "后台继续" : "取消"}
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? <Spinner /> : <Archive size={17} />}开始解压
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
