// Windows can reject truncating a PE executable immediately after it has been
// read and parsed for resource editing. Keep the generated PE, including ASAR
// integrity, intact and commit the write through a same-directory rename.
// This preload is used only by our packaging subprocess, for this one output.
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const originalWrite = fs.writeFile.bind(fs);
const target = path
  .resolve("release", "win-unpacked", "PlayVault.exe")
  .toLowerCase();
fs.writeFile = async function (file, data, options) {
  if (typeof file !== "string" || path.resolve(file).toLowerCase() !== target) {
    return originalWrite(file, data, options);
  }
  const temporary = path.join(
    path.dirname(file),
    `.PlayVault-resource-${randomUUID()}.tmp`,
  );
  await originalWrite(temporary, data, options);
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await fs.rename(temporary, file);
      return;
    } catch (error) {
      if (
        !["EPERM", "EACCES", "EBUSY", "UNKNOWN"].includes(error.code) ||
        attempt === 11
      )
        throw error;
      if (attempt === 0)
        process.stdout.write(
          "Waiting for Windows to release the generated executable...\n",
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};
