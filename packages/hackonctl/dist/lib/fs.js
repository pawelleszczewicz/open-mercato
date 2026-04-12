import fs from "node:fs/promises";
import path from "node:path";
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
async function writeJsonFileAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  await ensureDir(directory);
  const tempPath = path.join(directory, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tempPath, filePath);
}
async function withFileLock(lockPath, work) {
  await ensureDir(path.dirname(lockPath));
  const payload = JSON.stringify({ pid: process.pid, acquiredAt: (/* @__PURE__ */ new Date()).toISOString() });
  async function acquire() {
    try {
      await fs.writeFile(lockPath, payload, { flag: "wx" });
      return;
    } catch (error) {
      const code = error.code;
      if (code !== "EEXIST") {
        throw error;
      }
      const stalePayload = await readJsonFile(lockPath);
      const stalePid = stalePayload?.pid;
      if (!stalePid) {
        await fs.rm(lockPath, { force: true });
        await fs.writeFile(lockPath, payload, { flag: "wx" });
        return;
      }
      try {
        process.kill(stalePid, 0);
      } catch (killError) {
        const killCode = killError.code;
        if (killCode === "ESRCH") {
          await fs.rm(lockPath, { force: true });
          await fs.writeFile(lockPath, payload, { flag: "wx" });
          return;
        }
      }
      throw new Error(`State lock is already held: ${lockPath}`);
    }
  }
  await acquire();
  try {
    return await work();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}
export {
  ensureDir,
  pathExists,
  readJsonFile,
  withFileLock,
  writeJsonFileAtomic
};
//# sourceMappingURL=fs.js.map
