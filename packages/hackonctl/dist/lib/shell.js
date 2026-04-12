import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
class SpawnCommandExecutor {
  async run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const stdoutChunks = [];
      const stderrChunks = [];
      const stdoutStream = options.stdoutFilePath ? fs.createWriteStream(options.stdoutFilePath, { flags: "a" }) : null;
      const stderrStream = options.stderrFilePath ? fs.createWriteStream(options.stderrFilePath, { flags: "a" }) : null;
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: "pipe"
      });
      let timedOut = false;
      let timeoutHandle;
      if (options.timeoutMs) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, options.timeoutMs);
      }
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        stdoutChunks.push(text);
        stdoutStream?.write(text);
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        stderrChunks.push(text);
        stderrStream?.write(text);
      });
      child.on("error", (error) => {
        stdoutStream?.end();
        stderrStream?.end();
        reject(error);
      });
      child.on("close", (code) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        stdoutStream?.end();
        stderrStream?.end();
        resolve({
          exitCode: code ?? 1,
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
          timedOut
        });
      });
      if (options.stdinText) {
        child.stdin.write(options.stdinText);
      }
      child.stdin.end();
    });
  }
}
async function isCommandAvailable(executor, binary) {
  const locator = process.platform === "win32" ? "where" : "which";
  const result = await executor.run(locator, [binary], { cwd: process.cwd(), timeoutMs: 5e3 });
  return result.exitCode === 0;
}
function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
export {
  SpawnCommandExecutor,
  ensureParentDirectory,
  isCommandAvailable
};
//# sourceMappingURL=shell.js.map
