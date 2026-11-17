import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Play, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import type { Game } from "../shared/types";
import { Art, External, Modal, IconButton } from "./ui";
export default function MediaPlayer({
  game,
  index: initial = 0,
  onClose,
}: {
  game: Game;
  index?: number;
  onClose: () => void;
}) {
  const items = [
    ...game.movies.map((m) => ({
      kind: "video" as const,
      url: m.url,
      name: m.name,
      thumbnail: m.thumbnail,
    })),
    ...game.gifs.map((url, i) => ({
      kind: "image" as const,
      url,
      name: `宣传动图 ${i + 1}`,
      thumbnail: url,
    })),
    ...game.screenshots.map((url, i) => ({
      kind: "image" as const,
      url,
      name: `游戏截图 ${i + 1}`,
      thumbnail: url,
    })),
  ];
  const [index, setIndex] = useState(
    Math.min(initial, Math.max(0, items.length - 1)),
  );
  const [error, setError] = useState("");
  const ref = useRef<HTMLVideoElement>(null);
  const current = items[index];
  useEffect(() => {
    setError("");
    const video = ref.current;
    if (!video || current?.kind !== "video") return;
    let hls: Hls | undefined;
    if (/\.m3u8(\?|$)/i.test(current.url) && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, maxBufferLength: 30 });
      hls.loadSource(current.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal)
          setError("视频暂时无法加载，请检查网络，或打开官方页面观看。");
      });
    } else video.src = current.url;
    return () => {
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [current?.url, current?.kind]);
  return (
    <Modal title="游戏影像" eyebrow={game.name} onClose={onClose} wide>
      <div className="media-player">
        {current ? (
          <>
            <div className="player-stage">
              {current.kind === "video" ? (
                <video
                  key={current.url}
                  ref={ref}
                  controls
                  autoPlay
                  playsInline
                  poster={current.thumbnail}
                  onError={() =>
                    setError(
                      "视频暂时无法播放。可以尝试本地 MP4，或打开官方页面。",
                    )
                  }
                />
              ) : (
                <Art src={current.url} alt={current.name} />
              )}
              <IconButton
                className="prev"
                label="上一张"
                onClick={() =>
                  setIndex((index - 1 + items.length) % items.length)
                }
              >
                <ChevronLeft />
              </IconButton>
              <IconButton
                className="next"
                label="下一张"
                onClick={() => setIndex((index + 1) % items.length)}
              >
                <ChevronRight />
              </IconButton>
            </div>
            {error && (
              <p className="inline-notice">
                <AlertCircle size={16} />
                {error}
              </p>
            )}
            <div className="player-caption">
              <span>{current.name}</span>
              <span>
                {index + 1} / {items.length}
              </span>
            </div>
            <div className="media-filmstrip">
              {items.map((item, i) => (
                <button
                  key={item.url + i}
                  aria-label={item.name}
                  className={i === index ? "selected" : ""}
                  onClick={() => setIndex(i)}
                >
                  <Art src={item.thumbnail} alt={item.name} />
                  {item.kind === "video" && <Play size={16} />}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-small">
            <Play size={34} />
            <h3>还没有宣传影像</h3>
            <p>刷新 Steam 资料，或为游戏添加本地视频与 GIF。</p>
          </div>
        )}
        {game.steamAppId && (
          <External
            url={`https://store.steampowered.com/app/${game.steamAppId}/`}
          >
            在 Steam 查看官方影像
          </External>
        )}
      </div>
    </Modal>
  );
}
