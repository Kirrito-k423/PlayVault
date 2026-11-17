import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, ImageOff, LoaderCircle, ExternalLink } from "lucide-react";
import type { Game } from "../shared/types";
import { isGameExecutable, isGamePackage } from "../shared/files";
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 44 44"
      width={small ? 32 : 42}
      height={small ? 32 : 42}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M22 3 38 12v20L22 41 6 32V12L22 3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="m16 13 17 9-17 9V13Z" fill="currentColor" />
      <path
        d="M22 1v7M22 36v7M3 11l6 3M35 30l6 3"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
export function Art({
  src,
  alt,
  className = "",
  onClick,
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      draggable={false}
      className={className}
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      onClick={onClick}
      loading={eager ? "eager" : "lazy"}
    />
  ) : (
    <div className={`art-fallback ${className}`} onClick={onClick}>
      <ImageOff size={24} />
      <span>{alt}</span>
    </div>
  );
}
export function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""} ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const layers = document.querySelectorAll(".modal-backdrop");
      if (ref.current?.parentElement !== layers[layers.length - 1]) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const focusable = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.isConnected && previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <IconButton label="关闭窗口" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Spinner() {
  return <LoaderCircle className="spin" size={17} />;
}
export function External({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  return (
    <button
      className="text-link"
      onClick={() => window.playvault.openExternal(url).catch(() => {})}
    >
      {children}
      <ExternalLink size={12} />
    </button>
  );
}
export const bytes = (value: number) =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1)} GB`
    : value >= 1024 ** 2
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : `${Math.max(1, Math.round(value / 1024))} KB`;
export const stamp = (value?: string) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "尚未获取";
export const status = (game: Game) =>
  game.files.some((f) => isGameExecutable(f) && f.available)
    ? "installed"
    : game.files.some((f) => isGamePackage(f) && f.available)
      ? "archive"
      : game.files.length
        ? "missing"
        : "metadata";
export const statusText = (game: Game) =>
  ({
    installed: "可启动",
    archive: "待安装",
    missing: "路径失效",
    metadata: "仅资料",
  })[status(game)];
export const fileName = (value: string) => value.split(/[\\/]/).pop() || value;
export type Notify = (
  message: string,
  tone?: "success" | "error" | "info",
) => void;
export function errorMessage(e: unknown) {
  return (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
}
