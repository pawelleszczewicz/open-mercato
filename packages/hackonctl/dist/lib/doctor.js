import path from "node:path";
import { isCommandAvailable } from "./shell.js";
import { pathExists } from "./fs.js";
async function runDoctor(config, runtimePaths, executor, githubProvider) {
  const target = config.targets[0];
  const checks = [];
  const gitAvailable = await isCommandAvailable(executor, "git");
  checks.push({
    id: "git",
    status: gitAvailable ? "available_and_ready" : "unavailable",
    detail: gitAvailable ? "git command is available." : "git command is missing."
  });
  if (gitAvailable) {
    const [gitUserName, gitUserEmail] = await Promise.all([
      executor.run("git", ["config", "--get", "user.name"], {
        cwd: runtimePaths.repoRoot,
        timeoutMs: 5e3
      }),
      executor.run("git", ["config", "--get", "user.email"], {
        cwd: runtimePaths.repoRoot,
        timeoutMs: 5e3
      })
    ]);
    const identityReady = gitUserName.exitCode === 0 && gitUserEmail.exitCode === 0;
    checks.push({
      id: "git_identity",
      status: identityReady ? "available_and_ready" : "available_but_may_require_approval",
      detail: identityReady ? "git user.name and user.email are configured for coordinator-managed commits." : "git user.name or user.email is missing; coordinator-managed commits may fail until identity is configured."
    });
  }
  const codexAvailable = await isCommandAvailable(executor, config.codex.binary);
  checks.push({
    id: "codex_exec",
    status: codexAvailable ? "available_and_ready" : "unavailable",
    detail: codexAvailable ? "codex exec is available." : `Missing codex binary: ${config.codex.binary}.`
  });
  const ghAvailable = await isCommandAvailable(executor, "gh");
  const githubProviderAvailable = await githubProvider.isAvailable(target);
  const githubProviderConfigured = Boolean(process.env[config.github.mcpTokenEnvVar]?.trim()) || ghAvailable;
  checks.push({
    id: "github_provider",
    status: githubProviderAvailable ? "available_but_may_require_approval" : "unavailable",
    detail: describeGithubProvider(config, githubProviderConfigured, ghAvailable, githubProviderAvailable)
  });
  const targetReady = await assessTargetRepo(target, runtimePaths);
  checks.push(targetReady);
  checks.push({
    id: "fork_push_access",
    status: target.forkRepoUrl ? "available_but_may_require_approval" : "unavailable",
    detail: target.forkRepoUrl ? `Fork remote is configured as ${target.forkRemoteName}; push still depends on credentials/network.` : "forkRepoUrl is empty in hackonctl.config.json."
  });
  const yarnAvailable = await isCommandAvailable(executor, "yarn");
  checks.push({
    id: "validation_commands",
    status: yarnAvailable ? "available_but_may_require_approval" : "unavailable",
    detail: yarnAvailable ? "Validation command binaries are present; some profiles may still be approval-sensitive or environment-sensitive." : "Missing yarn binary for configured validation profiles."
  });
  const playwrightAvailable = await isCommandAvailable(executor, "npx");
  checks.push({
    id: "playwright_optional",
    status: playwrightAvailable ? "available_but_may_require_approval" : "optional_but_missing",
    detail: playwrightAvailable ? "npx is available; Playwright still depends on local/browser installation." : "npx is missing, so Playwright-based validation cannot run here."
  });
  checks.push({
    id: "approval_sensitive_path",
    status: config.codex.implementer.failFastOnApprovalSensitive && config.codex.testImplementer.failFastOnApprovalSensitive && config.codex.reviewer.failFastOnApprovalSensitive ? "available_and_ready" : "unavailable",
    detail: config.codex.implementer.failFastOnApprovalSensitive && config.codex.testImplementer.failFastOnApprovalSensitive && config.codex.reviewer.failFastOnApprovalSensitive ? "Coordinator is configured to convert approval-sensitive agent runs into blocker artifacts." : "Codex roles are not configured to fail fast on approval-sensitive operations."
  });
  return checks;
}
function describeGithubProvider(config, githubProviderConfigured, ghAvailable, githubProviderAvailable) {
  const mcpConfigured = Boolean(process.env[config.github.mcpTokenEnvVar]?.trim());
  if (config.github.provider === "gh_cli") {
    return ghAvailable ? "gh CLI is installed; network/auth still need to be valid at runtime." : "gh CLI is missing.";
  }
  if (config.github.provider === "github_mcp") {
    if (githubProviderAvailable) {
      return `GitHub MCP is reachable via ${config.github.mcpUrl}; runtime access still depends on network and ${config.github.mcpTokenEnvVar}.`;
    }
    return mcpConfigured ? `GitHub MCP is configured but not reachable via ${config.github.mcpUrl}.` : `GitHub MCP is selected but ${config.github.mcpTokenEnvVar} is not set.`;
  }
  if (githubProviderAvailable) {
    return ghAvailable ? `GitHub MCP is preferred via ${config.github.mcpUrl}; gh CLI remains available as fallback.` : `GitHub MCP is preferred via ${config.github.mcpUrl}; gh CLI fallback is currently unavailable.`;
  }
  if (!githubProviderConfigured) {
    return `Neither GitHub MCP (${config.github.mcpTokenEnvVar}) nor gh CLI is available.`;
  }
  return `GitHub MCP or gh CLI is configured, but neither provider is currently reachable.`;
}
async function assessTargetRepo(target, runtimePaths) {
  const clonePath = path.resolve(runtimePaths.repoRoot, target.clonePath);
  const worktreeRoot = path.resolve(runtimePaths.repoRoot, target.worktreeRoot);
  const cloneReady = await pathExists(path.join(clonePath, ".git"));
  const worktreeReady = await pathExists(worktreeRoot);
  if (cloneReady && worktreeReady) {
    return {
      id: "target_repo",
      status: "available_and_ready",
      detail: `Canonical clone and worktree root exist at ${clonePath} and ${worktreeRoot}.`
    };
  }
  return {
    id: "target_repo",
    status: "available_but_may_require_approval",
    detail: 'Target clone/worktree layout is not ready yet; run "hackonctl sync" after init.'
  };
}
export {
  runDoctor
};
//# sourceMappingURL=doctor.js.map
