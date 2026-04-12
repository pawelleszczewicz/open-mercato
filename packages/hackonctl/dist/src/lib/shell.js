import { execSync } from "node:child_process";
function shell(command, options) {
  try {
    const stdout = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 12e4,
      ...options
    });
    return { stdout: String(stdout).trim(), success: true, exitCode: 0 };
  } catch (error) {
    const execError = error;
    return {
      stdout: String(execError.stdout ?? "").trim(),
      success: false,
      exitCode: execError.status ?? 1
    };
  }
}
function shellOrThrow(command, options) {
  const result = shell(command, options);
  if (!result.success) {
    throw new Error(`Command failed (exit ${result.exitCode}): ${command}
${result.stdout}`);
  }
  return result.stdout;
}
export {
  shell,
  shellOrThrow
};
//# sourceMappingURL=shell.js.map
