import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Game } from "../shared/types";
import type { Fetcher } from "./steam";
export async function cacheArtwork(
  game: Game,
  directory: string,
  fetcher: Fetcher,
): Promise<Game> {
  const result = structuredClone(game),
    media = path.join(directory, "media");
  await fs.mkdir(media, { recursive: true });
  const tasks: (() => Promise<void>)[] = [];
  const cached = async (url: string): Promise<string> => {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        !/(^|\.)steamstatic\.com$|(^|\.)steamcdn-a\.akamaihd\.net$|^t\.vndb\.org$|^lain\.bgm\.tv$/.test(
          parsed.hostname,
        )
      )
        return url;
      const hash = createHash("sha256").update(url).digest("hex");
      const types: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
      };
      for (const ext of Object.values(types))
        try {
          if ((await fs.stat(path.join(media, hash + ext))).isFile())
            return `playvault://media/${hash}${ext}`;
        } catch {}
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(10000),
      });
      const ext =
        types[
          (response.headers.get("content-type") || "").split(";")[0].trim()
        ];
      if (
        !response.ok ||
        !ext ||
        !response.body ||
        Number(response.headers.get("content-length") || 0) > 12 * 1024 ** 2
      ) {
        await response.body?.cancel();
        return url;
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > 12 * 1024 ** 2) throw new Error("Image too large");
        chunks.push(chunk);
      }
      await fs.writeFile(path.join(media, hash + ext), Buffer.concat(chunks));
      return `playvault://media/${hash}${ext}`;
    } catch {
      return url;
    }
  };
  for (const field of ["hero", "poster", "logo", "backdrop"] as const)
    if (result[field])
      tasks.push(async () => {
        result[field] = await cached(result[field]!);
      });
  result.screenshots.slice(0, 4).forEach((url, i) =>
    tasks.push(async () => {
      result.screenshots[i] = await cached(url);
    }),
  );
  result.movies.slice(0, 4).forEach((m, i) =>
    tasks.push(async () => {
      result.movies[i].thumbnail = await cached(m.thumbnail);
    }),
  );
  result.gifs.slice(0, 2).forEach((url, i) =>
    tasks.push(async () => {
      result.gifs[i] = await cached(url);
    }),
  );
  let index = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (index < tasks.length) await tasks[index++]();
    }),
  );
  return result;
}
