import { execSync } from "node:child_process";
function exec(command, options) {
  try {
    const stdout = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 3e5,
      ...options
    });
    return { success: true, stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (err) {
    const error = err;
    return {
      success: false,
      stdout: (error.stdout ?? "").toString().trim(),
      stderr: (error.stderr ?? "").toString().trim(),
      exitCode: error.status ?? 1
    };
  }
}
function execOrThrow(command, options) {
  const result = exec(command, options);
  if (!result.success) {
    throw new Error(`Command failed (exit ${result.exitCode}): ${command}
${result.stderr}`);
  }
  return result.stdout;
}
export {
  exec,
  execOrThrow
};
//# sourceMappingURL=shell.js.map
