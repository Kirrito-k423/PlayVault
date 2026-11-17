import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { safeDirectoryName, validateArchiveListing, isWithin } from "./core";
export async function detectSevenZip(configured = ""): Promise<string> {
  const paths = [
    configured,
    "E:\\commonSoftware\\7-Zip\\7z.exe",
    "D:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
  ];
  for (const exe of paths.filter(Boolean))
    try {
      if ((await fs.stat(exe)).isFile()) return exe;
    } catch {
      /* try next */
    }
  throw new Error("未找到 7-Zip。请在设置中选择 7z.exe，再进行解压。");
}
function run(
  exe: string,
  args: string[],
  onOutput?: (chunk: string) => void,
  timeout = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "",
      done = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("解压任务超时，已停止。源文件不受影响。"));
    }, timeout);
    function finish(error?: Error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(out);
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
      onOutput?.(chunk);
      if (out.length > 64 * 1024 * 1024) {
        child.kill();
        finish(new Error("压缩包清单过大"));
      }
    });
    child.stderr.on("data", (chunk: string) => {
      err = (err + chunk).slice(-4000);
    });
    child.on("error", (e) => finish(e));
    child.on("close", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(
              `7-Zip 处理失败（${code}）：${err.trim().slice(0, 300) || "文件可能损坏、分卷不全或需要密码。"}`,
            ),
      ),
    );
  });
}
async function verifyTree(dir: string): Promise<void> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name),
      stat = await fs.lstat(full);
    if (stat.isSymbolicLink() || !isWithin(dir, full))
      throw new Error("检测到不安全的解压文件");
    if (stat.isDirectory()) await verifyTree(full);
  }
}
export async function extractArchive(input: {
  archive: string;
  parent: string;
  name: string;
  sevenZip: string;
  onProgress?: (percent: number, message: string) => void;
}): Promise<string> {
  const { archive, parent, name, sevenZip, onProgress } = input;
  if (!path.isAbsolute(parent)) throw new Error("请选择完整的目标目录路径");
  if ((await fs.lstat(archive)).isSymbolicLink())
    throw new Error("不支持链接形式的安装包");
  if (!/\.(zip|7z|rar)(\.001)?$|\.part0*1\.rar$/i.test(archive))
    throw new Error("此文件需要使用系统或安装程序打开");
  onProgress?.(0, "正在校验压缩包清单…");
  const listing = await run(sevenZip, [
    "l",
    "-slt",
    "-ba",
    "-sccUTF-8",
    "--",
    archive,
  ]);
  const info = validateArchiveListing(listing);
  await fs.mkdir(parent, { recursive: true });
  const disk = await fs.statfs(parent);
  if (Number(disk.bavail) * Number(disk.bsize) < info.bytes + 256 * 1024 ** 2)
    throw new Error("目标磁盘可用空间不足，请选择其他磁盘");
  const directory = path.join(parent, safeDirectoryName(name));
  if (!isWithin(parent, directory) || directory === path.resolve(parent))
    throw new Error("目标目录无效");
  try {
    await fs.mkdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`目标已存在：${directory}。请选择其他父目录，避免覆盖。`);
    throw error;
  }
  try {
    await run(
      sevenZip,
      [
        "x",
        "-y",
        "-aos",
        "-bsp1",
        "-bso1",
        "-sccUTF-8",
        `-o${directory}`,
        "--",
        archive,
      ],
      (chunk) => {
        const matches = [...chunk.matchAll(/(\d+)\s*%/g)];
        if (matches.length)
          onProgress?.(
            Math.min(99, Number(matches.at(-1)![1])),
            "正在解压，原安装包已保留",
          );
      },
      2 * 60 * 60 * 1000,
    );
    await verifyTree(directory);
    onProgress?.(100, "解压完成，正在查找游戏程序");
    return directory;
  } catch (error) {
    throw new Error(
      `${(error as Error).message}\n未完成文件保留在 ${directory}，原安装包未修改。`,
    );
  }
}
