import path from "node:path";
import fs from "node:fs/promises";
import { ensureDir, pathExists } from "./fs.js";
import { normalizePath } from "./strings.js";
class GitTargetRepoAdapter {
  constructor(executor) {
    this.executor = executor;
  }
  async ensureCanonicalClone(target, repoRoot) {
    const clonePath = path.resolve(repoRoot, target.clonePath);
    const cloneGitPath = path.join(clonePath, ".git");
    const clonePathExists = await pathExists(clonePath);
    if (clonePathExists && !await pathExists(cloneGitPath)) {
      throw new Error(`Target clone path exists but is not a git repository: ${clonePath}`);
    }
    if (!await pathExists(cloneGitPath)) {
      await ensureDir(path.dirname(clonePath));
      const source = target.seedPath ? path.resolve(repoRoot, target.seedPath) : target.repoUrl;
      const cloneResult = await this.executor.run("git", ["clone", source, clonePath], { timeoutMs: 10 * 60 * 1e3 });
      if (cloneResult.exitCode !== 0) {
        throw new Error(cloneResult.stderr || cloneResult.stdout || `Failed to clone ${source}`);
      }
    }
    const fetchResult = await this.executor.run("git", ["-C", clonePath, "fetch", "--prune", "origin", target.defaultBaseBranch], {
      timeoutMs: 5 * 60 * 1e3
    });
    if (fetchResult.exitCode !== 0) {
      throw new Error(fetchResult.stderr || fetchResult.stdout || `Failed to fetch origin/${target.defaultBaseBranch}.`);
    }
    const baseRef = `refs/remotes/origin/${target.defaultBaseBranch}`;
    const verifyBaseResult = await this.executor.run("git", ["-C", clonePath, "show-ref", "--verify", baseRef], {
      timeoutMs: 3e4
    });
    if (verifyBaseResult.exitCode !== 0) {
      throw new Error(`Missing upstream base branch ${baseRef} in canonical clone.`);
    }
    await this.executor.run("git", ["-C", clonePath, "worktree", "prune"], { timeoutMs: 3e4 });
    await this.synchronizeGitIdentity(repoRoot, clonePath);
    return clonePath;
  }
  async ensureWorktree(target, repoRoot, taskId, branchName) {
    const canonicalClonePath = await this.ensureCanonicalClone(target, repoRoot);
    const worktreePath = path.resolve(repoRoot, target.worktreeRoot, taskId);
    const worktrees = await this.listRegisteredWorktrees(canonicalClonePath);
    const registeredWorktree = worktrees.find((entry) => normalizePath(entry.path) === normalizePath(worktreePath));
    if (!await pathExists(worktreePath)) {
      const branchInUse = worktrees.find((entry) => entry.branchName === branchName);
      if (branchInUse) {
        throw new Error(`Branch ${branchName} is already checked out in worktree ${branchInUse.path}.`);
      }
      await ensureDir(path.dirname(worktreePath));
      const baseRef = `origin/${target.defaultBaseBranch}`;
      const result = await this.executor.run("git", ["-C", canonicalClonePath, "worktree", "add", "-B", branchName, worktreePath, baseRef], {
        timeoutMs: 5 * 60 * 1e3
      });
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || "Failed to create worktree.");
      }
    } else if (!registeredWorktree) {
      throw new Error(`Existing task worktree is not registered in the canonical clone: ${worktreePath}`);
    }
    const branchResult = await this.executor.run("git", ["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"], {
      timeoutMs: 3e4
    });
    if (branchResult.exitCode !== 0) {
      throw new Error(branchResult.stderr || branchResult.stdout || `Failed to resolve branch for worktree ${worktreePath}.`);
    }
    const currentBranch = branchResult.stdout.trim();
    if (currentBranch !== branchName) {
      throw new Error(`Task worktree ${worktreePath} is on ${currentBranch}, expected ${branchName}.`);
    }
    await this.synchronizeGitIdentity(repoRoot, worktreePath);
    return {
      canonicalClonePath,
      worktreePath,
      branchName
    };
  }
  async removeWorktree(target, repoRoot, worktreePath) {
    const canonicalClonePath = await this.ensureCanonicalClone(target, repoRoot);
    const result = await this.executor.run("git", ["-C", canonicalClonePath, "worktree", "remove", "--force", worktreePath], {
      timeoutMs: 2 * 60 * 1e3
    });
    const output = `${result.stdout}
${result.stderr}`.trim();
    if (result.exitCode !== 0 && !/is not a working tree|does not exist|not a working tree/i.test(output)) {
      throw new Error(output || `Failed to remove worktree ${worktreePath}.`);
    }
    const pruneResult = await this.executor.run("git", ["-C", canonicalClonePath, "worktree", "prune"], {
      timeoutMs: 3e4
    });
    if (pruneResult.exitCode !== 0) {
      throw new Error(pruneResult.stderr || pruneResult.stdout || `Failed to prune git worktree metadata for ${canonicalClonePath}.`);
    }
  }
  async resolveGuideFiles(target, repoRoot, candidatePaths) {
    const clonePath = path.resolve(repoRoot, target.clonePath);
    const files = /* @__PURE__ */ new Set();
    const contributing = path.join(clonePath, "CONTRIBUTING.md");
    const rootAgents = path.join(clonePath, "AGENTS.md");
    if (await pathExists(contributing)) files.add(contributing);
    if (await pathExists(rootAgents)) files.add(rootAgents);
    for (const candidate of candidatePaths.map(normalizePath)) {
      let cursor = path.join(clonePath, candidate);
      const stat = await fs.stat(cursor).catch(() => null);
      if (stat?.isFile()) {
        cursor = path.dirname(cursor);
      }
      while (cursor.startsWith(clonePath)) {
        const agentsPath = path.join(cursor, "AGENTS.md");
        if (await pathExists(agentsPath)) {
          files.add(agentsPath);
        }
        if (cursor === clonePath) {
          break;
        }
        cursor = path.dirname(cursor);
      }
    }
    return [...files];
  }
  async listChangedFiles(worktreePath) {
    const result = await this.executor.run("git", ["-C", worktreePath, "status", "--porcelain"], { timeoutMs: 3e4 });
    if (result.exitCode !== 0) {
      return [];
    }
    return [...new Set(result.stdout.split("\n").map((line) => parseStatusLine(line)).filter(Boolean).map((line) => normalizePath(line)))];
  }
  async getChangeSummary(target, worktreePath) {
    const changedFiles = await this.listChangedFiles(worktreePath);
    const diffResult = await this.executor.run("git", ["-C", worktreePath, "diff", "--numstat", `origin/${target.defaultBaseBranch}`], {
      timeoutMs: 3e4
    });
    let addedLines = 0;
    let removedLines = 0;
    if (diffResult.exitCode === 0) {
      for (const line of diffResult.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
        const [addedRaw, removedRaw] = line.split(/\s+/, 3);
        const parsedAdded = addedRaw === "-" ? 0 : Number.parseInt(addedRaw ?? "0", 10);
        const parsedRemoved = removedRaw === "-" ? 0 : Number.parseInt(removedRaw ?? "0", 10);
        addedLines += Number.isFinite(parsedAdded) ? parsedAdded : 0;
        removedLines += Number.isFinite(parsedRemoved) ? parsedRemoved : 0;
      }
    }
    return {
      changedFiles,
      addedLines,
      removedLines,
      totalDiffLines: addedLines + removedLines
    };
  }
  async prepareBranchForPullRequest(target, worktreePath, options) {
    const branchResult = await this.executor.run("git", ["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"], {
      timeoutMs: 3e4
    });
    if (branchResult.exitCode !== 0) {
      throw new Error(branchResult.stderr || branchResult.stdout || `Failed to resolve branch for worktree ${worktreePath}.`);
    }
    const currentBranch = branchResult.stdout.trim();
    if (currentBranch !== options.branchName) {
      throw new Error(`Task worktree ${worktreePath} is on ${currentBranch}, expected ${options.branchName}.`);
    }
    let commitCreated = false;
    const pendingChanges = await this.listChangedFiles(worktreePath);
    if (pendingChanges.length > 0) {
      const addResult = await this.executor.run("git", ["-C", worktreePath, "add", "--all"], { timeoutMs: 6e4 });
      if (addResult.exitCode !== 0) {
        throw new Error(addResult.stderr || addResult.stdout || "Failed to stage task changes before PR packaging.");
      }
      const commitResult = await this.executor.run("git", ["-C", worktreePath, "commit", "-m", options.commitMessage], {
        timeoutMs: 2 * 60 * 1e3
      });
      const commitOutput = `${commitResult.stdout}
${commitResult.stderr}`.trim();
      if (commitResult.exitCode !== 0 && !/nothing to commit|no changes added to commit/i.test(commitOutput)) {
        throw new Error(commitOutput || "Failed to create the task commit before PR packaging.");
      }
      commitCreated = commitResult.exitCode === 0;
    }
    const headResult = await this.executor.run("git", ["-C", worktreePath, "rev-parse", "HEAD"], {
      timeoutMs: 3e4
    });
    if (headResult.exitCode !== 0) {
      throw new Error(headResult.stderr || headResult.stdout || "Failed to resolve branch HEAD before PR packaging.");
    }
    const aheadBehindResult = await this.executor.run("git", [
      "-C",
      worktreePath,
      "rev-list",
      "--left-right",
      "--count",
      `origin/${target.defaultBaseBranch}...${options.branchName}`
    ], {
      timeoutMs: 3e4
    });
    if (aheadBehindResult.exitCode !== 0) {
      throw new Error(aheadBehindResult.stderr || aheadBehindResult.stdout || "Failed to compare the task branch against the upstream base branch.");
    }
    const [behindRaw, aheadRaw] = aheadBehindResult.stdout.trim().split(/\s+/);
    const behindBy = Number.parseInt(behindRaw ?? "0", 10);
    const aheadBy = Number.parseInt(aheadRaw ?? "0", 10);
    if (!Number.isFinite(aheadBy) || aheadBy <= 0) {
      throw new Error(`Branch ${options.branchName} has no commits ahead of origin/${target.defaultBaseBranch}.`);
    }
    const diffSummary = await this.getBranchDiffSummary(target, worktreePath, options.branchName);
    return {
      ...diffSummary,
      branchName: options.branchName,
      headSha: headResult.stdout.trim(),
      aheadBy: Number.isFinite(aheadBy) ? aheadBy : 0,
      behindBy: Number.isFinite(behindBy) ? behindBy : 0,
      commitCreated
    };
  }
  async pushBranch(target, worktreePath, branchName) {
    if (!target.forkRepoUrl) {
      throw new Error("Target forkRepoUrl is not configured.");
    }
    const remoteResult = await this.executor.run("git", ["-C", worktreePath, "remote"], { timeoutMs: 1e4 });
    const remotes = remoteResult.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!remotes.includes(target.forkRemoteName)) {
      const addResult = await this.executor.run("git", ["-C", worktreePath, "remote", "add", target.forkRemoteName, target.forkRepoUrl], { timeoutMs: 3e4 });
      if (addResult.exitCode !== 0) {
        throw new Error(addResult.stderr || addResult.stdout || `Failed to add ${target.forkRemoteName} remote.`);
      }
    } else {
      const remoteUrlResult = await this.executor.run("git", ["-C", worktreePath, "remote", "get-url", target.forkRemoteName], { timeoutMs: 1e4 });
      if (remoteUrlResult.exitCode !== 0) {
        throw new Error(remoteUrlResult.stderr || remoteUrlResult.stdout || `Failed to inspect ${target.forkRemoteName} remote.`);
      }
      if (remoteUrlResult.stdout.trim() !== target.forkRepoUrl) {
        const setUrlResult = await this.executor.run("git", ["-C", worktreePath, "remote", "set-url", target.forkRemoteName, target.forkRepoUrl], {
          timeoutMs: 3e4
        });
        if (setUrlResult.exitCode !== 0) {
          throw new Error(setUrlResult.stderr || setUrlResult.stdout || `Failed to update ${target.forkRemoteName} remote.`);
        }
      }
    }
    const pushTarget = buildGitHubPushTarget(target.forkRepoUrl) ?? target.forkRemoteName;
    const pushResult = await this.executor.run("git", ["-C", worktreePath, "push", "--set-upstream", pushTarget, `${branchName}:${branchName}`], {
      timeoutMs: 5 * 60 * 1e3
    });
    if (pushResult.exitCode !== 0) {
      throw new Error(pushResult.stderr || pushResult.stdout || `Failed to push ${branchName} to ${target.forkRemoteName}.`);
    }
  }
  async getBranchDiffSummary(target, worktreePath, branchName) {
    const nameOnlyResult = await this.executor.run("git", [
      "-C",
      worktreePath,
      "diff",
      "--name-only",
      `origin/${target.defaultBaseBranch}...${branchName}`
    ], {
      timeoutMs: 3e4
    });
    if (nameOnlyResult.exitCode !== 0) {
      throw new Error(nameOnlyResult.stderr || nameOnlyResult.stdout || "Failed to enumerate branch diff files.");
    }
    const diffResult = await this.executor.run("git", [
      "-C",
      worktreePath,
      "diff",
      "--numstat",
      `origin/${target.defaultBaseBranch}...${branchName}`
    ], {
      timeoutMs: 3e4
    });
    if (diffResult.exitCode !== 0) {
      throw new Error(diffResult.stderr || diffResult.stdout || "Failed to compute branch diff statistics.");
    }
    const changedFiles = [...new Set(nameOnlyResult.stdout.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => normalizePath(line)))];
    let addedLines = 0;
    let removedLines = 0;
    for (const line of diffResult.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
      const [addedRaw, removedRaw] = line.split(/\s+/, 3);
      const parsedAdded = addedRaw === "-" ? 0 : Number.parseInt(addedRaw ?? "0", 10);
      const parsedRemoved = removedRaw === "-" ? 0 : Number.parseInt(removedRaw ?? "0", 10);
      addedLines += Number.isFinite(parsedAdded) ? parsedAdded : 0;
      removedLines += Number.isFinite(parsedRemoved) ? parsedRemoved : 0;
    }
    return {
      changedFiles,
      addedLines,
      removedLines,
      totalDiffLines: addedLines + removedLines
    };
  }
  async listRegisteredWorktrees(canonicalClonePath) {
    const result = await this.executor.run("git", ["-C", canonicalClonePath, "worktree", "list", "--porcelain"], {
      timeoutMs: 3e4
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `Failed to inspect worktrees for ${canonicalClonePath}.`);
    }
    const worktrees = [];
    let current = null;
    for (const line of result.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (current) {
          worktrees.push(current);
          current = null;
        }
        continue;
      }
      if (trimmed.startsWith("worktree ")) {
        if (current) {
          worktrees.push(current);
        }
        current = {
          path: trimmed.slice("worktree ".length).trim(),
          branchName: null
        };
        continue;
      }
      if (trimmed.startsWith("branch ") && current) {
        const branchRef = trimmed.slice("branch ".length).trim();
        current.branchName = branchRef.replace(/^refs\/heads\//, "");
      }
    }
    if (current) {
      worktrees.push(current);
    }
    return worktrees;
  }
  async synchronizeGitIdentity(sourceRepoPath, targetRepoPath) {
    const [nameResult, emailResult] = await Promise.all([
      this.executor.run("git", ["-C", sourceRepoPath, "config", "--get", "user.name"], {
        timeoutMs: 1e4
      }),
      this.executor.run("git", ["-C", sourceRepoPath, "config", "--get", "user.email"], {
        timeoutMs: 1e4
      })
    ]);
    const userName = nameResult.exitCode === 0 ? nameResult.stdout.trim() : "";
    const userEmail = emailResult.exitCode === 0 ? emailResult.stdout.trim() : "";
    if (!userName || !userEmail) {
      return;
    }
    const setNameResult = await this.executor.run("git", ["-C", targetRepoPath, "config", "user.name", userName], {
      timeoutMs: 1e4
    });
    if (setNameResult.exitCode !== 0) {
      throw new Error(setNameResult.stderr || setNameResult.stdout || `Failed to configure git user.name for ${targetRepoPath}.`);
    }
    const setEmailResult = await this.executor.run("git", ["-C", targetRepoPath, "config", "user.email", userEmail], {
      timeoutMs: 1e4
    });
    if (setEmailResult.exitCode !== 0) {
      throw new Error(setEmailResult.stderr || setEmailResult.stdout || `Failed to configure git user.email for ${targetRepoPath}.`);
    }
  }
}
function buildGitHubPushTarget(remoteUrl) {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim();
  if (!token) {
    return null;
  }
  if (!/^https:\/\/github\.com\//i.test(remoteUrl)) {
    return null;
  }
  const parsedUrl = new URL(remoteUrl);
  parsedUrl.username = "x-access-token";
  parsedUrl.password = token;
  return parsedUrl.toString();
}
function parseStatusLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  const body = line.length > 3 ? line.slice(3).trim() : trimmed;
  const renameParts = body.split(" -> ");
  return renameParts[renameParts.length - 1] ?? null;
}
export {
  GitTargetRepoAdapter
};
//# sourceMappingURL=target-repo.js.map
