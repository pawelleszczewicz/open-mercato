import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs, getFlagValue, getFlagValues, hasFlag } from "./lib/argv.js";
import { bootstrapRuntimeLayout, createDefaultConfig, findRepoRoot, loadConfig, writeDefaultConfig } from "./lib/config.js";
import { pathExists, writeJsonFileAtomic } from "./lib/fs.js";
import { getLaneGuardrail, evaluateChangePolicy } from "./lib/change-policy.js";
import { resolveRuntimePaths, getDriveGreenCycleArtifactPath, getTaskArtifactRoot } from "./lib/runtime-paths.js";
import { ensureRuntimeLayout } from "./lib/workspace.js";
import { StateStore } from "./lib/state/store.js";
import { SpawnCommandExecutor } from "./lib/shell.js";
import { createGithubProvider } from "./lib/github.js";
import { qualifyTask } from "./lib/qualification.js";
import { GitTargetRepoAdapter } from "./lib/target-repo.js";
import { getTargetById } from "./lib/area-rules.js";
import { runDuplicateCheck } from "./lib/duplicates.js";
import { writeTaskContext } from "./lib/context.js";
import { runCodexAgent } from "./lib/codex.js";
import { runDoctor } from "./lib/doctor.js";
import { buildDiscoveryQualificationHint, discoverCandidates, makeDiscoverySourceKey, parseDiscoveryLanes, summarizeDiscoveryCandidate } from "./lib/discovery.js";
import { countGreenLaneDriveActiveTasks, maxAutonomousGreenLaneConcurrency, progressGreenLaneTasksInParallel, selectGreenLaneDispatchCandidates, selectProgressableGreenLaneTasks, selectQueuedGreenLaneTasks, startTasksInParallel } from "./lib/dispatch.js";
import { shouldContinueGreenDriveLoopImmediately } from "./lib/drive-loop.js";
import { isIntegrationTestTask } from "./lib/task-focus.js";
import { runValidationProfiles } from "./lib/validation.js";
import { evaluateReviewGate, parseReviewerDirective } from "./lib/review-state.js";
import { extractLatestJudgeRejectionReason, isChangesRequestedPullRequest, isDuplicatePullRequest, isRejectedPullRequest, parseJudgeDiscussionDirective, selectJudgePendingTasks } from "./lib/judge-sync.js";
import { splitCommaList } from "./lib/strings.js";
import { defaultPrunableWorktreeStates, selectPrunableTaskWorktrees } from "./lib/prune.js";
import { shouldAutoAbandonPrePrBlockedTask } from "./lib/pre-pr-blocks.js";
import { taskStateSchema } from "./lib/types.js";
async function run(argv) {
  const executor = new SpawnCommandExecutor();
  const targetRepo = new GitTargetRepoAdapter(executor);
  const parsed = parseArgs(argv.slice(2));
  const repoRoot = await findRepoRoot(process.cwd());
  const [command, subcommand, taskOrSource] = parsed.positionals;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (command === "init") {
    const wroteConfig = await writeDefaultConfig(repoRoot);
    const config2 = wroteConfig ? createDefaultConfig() : (await loadConfig(repoRoot)).config;
    await bootstrapRuntimeLayout(repoRoot, config2);
    console.log(wroteConfig ? "Created hackonctl.config.json and runtime directories." : "Runtime directories are ready; existing config kept.");
    return 0;
  }
  const { config, configFilePath } = await loadConfig(repoRoot);
  const githubProvider = createGithubProvider(config.github, executor);
  const runtimePaths = resolveRuntimePaths(repoRoot, configFilePath, config);
  await ensureRuntimeLayout(runtimePaths, config);
  const stateStore = new StateStore(runtimePaths);
  await stateStore.initialize();
  switch (command) {
    case "doctor": {
      const checks = await runDoctor(config, runtimePaths, executor, githubProvider);
      for (const check of checks) {
        console.log(`${check.id}	${check.status}	${check.detail}`);
      }
      return checks.some((check) => check.status === "unavailable") ? 1 : 0;
    }
    case "sync": {
      const target = getTargetById(config, getFlagValue(parsed, "target") ?? config.targets[0].id);
      const clonePath = await targetRepo.ensureCanonicalClone(target, repoRoot);
      console.log(`Canonical clone ready at ${clonePath}`);
      return 0;
    }
    case "queue": {
      const tasks = await stateStore.listTasks();
      if (tasks.length === 0) {
        console.log("No tasks in queue.");
        return 0;
      }
      for (const task of tasks) {
        console.log([
          task.taskId,
          task.state,
          task.lane,
          task.duplicateRiskClass,
          task.sourceType,
          task.sourceId,
          task.sourceTitle
        ].join("	"));
      }
      return 0;
    }
    case "discover": {
      const limitRaw = getFlagValue(parsed, "limit") ?? "20";
      const limit = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error(`Invalid --limit value: ${limitRaw}`);
      }
      const lanes = parseDiscoveryLanes(getFlagValues(parsed, "lane"));
      const snapshot = await discoverCandidates({
        targetId: getFlagValue(parsed, "target") ?? config.targets[0].id,
        lanes,
        limit
      }, {
        config,
        runtimePaths,
        stateStore,
        githubProvider,
        executor
      });
      if (snapshot.candidates.length === 0) {
        console.log(`No discovery candidates found. Snapshot: ${snapshot.snapshotPath}`);
        return 0;
      }
      for (const candidate of snapshot.candidates) {
        console.log(`${summarizeDiscoveryCandidate(candidate)}	${buildDiscoveryQualificationHint(candidate)}`);
      }
      console.log(`snapshot	${snapshot.snapshotPath}`);
      return 0;
    }
    case "dispatch": {
      if (subcommand !== "green") {
        throw new Error("Usage: hackonctl dispatch green [--limit <n>] [--discover-limit <n>] [--concurrency <n>] [--dry-run]");
      }
      const options = parseGreenDispatchOptions(parsed);
      const cycle = await runGreenDispatchCycle({
        repoRoot,
        config,
        runtimePaths,
        stateStore,
        githubProvider,
        targetRepo,
        executor
      }, {
        targetId: getFlagValue(parsed, "target") ?? config.targets[0].id,
        selectionLimit: options.limit,
        dispatchLimit: options.limit,
        discoverLimit: options.discoverLimit,
        concurrency: options.concurrency,
        dryRun: hasFlag(parsed, "dry-run"),
        advanceWorkflow: false
      });
      printGreenDispatchCycle(cycle);
      return cycle.startResults.every((result) => result.result.exitCode === 0) && cycle.progressResults.every((result) => result.result.exitCode === 0) ? 0 : 1;
    }
    case "drive": {
      if (subcommand !== "green") {
        throw new Error("Usage: hackonctl drive green [--target-active <n>] [--interval-seconds <n>] [--limit <n>] [--discover-limit <n>] [--concurrency <n>] [--once] [--dry-run]");
      }
      const options = parseGreenDispatchOptions(parsed);
      const targetActiveRaw = getFlagValue(parsed, "target-active") ?? "2";
      const intervalSecondsRaw = getFlagValue(parsed, "interval-seconds") ?? "900";
      const maxCyclesRaw = hasFlag(parsed, "once") ? "1" : getFlagValue(parsed, "max-cycles") ?? "0";
      const targetActive = Number.parseInt(targetActiveRaw, 10);
      const intervalSeconds = Number.parseInt(intervalSecondsRaw, 10);
      const maxCycles = Number.parseInt(maxCyclesRaw, 10);
      if (!Number.isFinite(targetActive) || targetActive <= 0 || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0 || !Number.isFinite(maxCycles) || maxCycles < 0) {
        throw new Error("drive green requires positive numeric --target-active and --interval-seconds values, plus a non-negative --max-cycles value.");
      }
      const clampedTargetActive = Math.min(targetActive, maxAutonomousGreenLaneConcurrency);
      let cycleNumber = 0;
      let hadFailures = false;
      while (maxCycles === 0 || cycleNumber < maxCycles) {
        cycleNumber += 1;
        const tasks = await stateStore.listTasks();
        const activeGreenTasks = countGreenLaneDriveActiveTasks(tasks);
        const dispatchCapacity = Math.max(0, Math.min(options.limit, clampedTargetActive - activeGreenTasks));
        console.log(`cycle	${cycleNumber}	active_green=${activeGreenTasks}	target_active=${clampedTargetActive}	dispatch_capacity=${dispatchCapacity}`);
        const cycle = await runGreenDispatchCycle({
          repoRoot,
          config,
          runtimePaths,
          stateStore,
          githubProvider,
          targetRepo,
          executor
        }, {
          targetId: getFlagValue(parsed, "target") ?? config.targets[0].id,
          selectionLimit: options.limit,
          dispatchLimit: dispatchCapacity,
          discoverLimit: options.discoverLimit,
          concurrency: options.concurrency,
          dryRun: hasFlag(parsed, "dry-run"),
          advanceWorkflow: true
        });
        await writeDriveGreenCycleArtifact(runtimePaths, {
          cycleNumber,
          activeGreenTasks,
          targetActive: clampedTargetActive,
          dispatchCapacity,
          cycle
        });
        printGreenDispatchCycle(cycle);
        if (dispatchCapacity === 0) {
          console.log("hold	active green target already met; discovery refreshed without starting more tasks");
        }
        hadFailures = hadFailures || !cycle.startResults.every((result) => result.result.exitCode === 0) || !cycle.progressResults.every((result) => result.result.exitCode === 0);
        if (maxCycles !== 0 && cycleNumber >= maxCycles) {
          break;
        }
        const postCycleTasks = await stateStore.listTasks();
        const postCycleActiveGreenTasks = countGreenLaneDriveActiveTasks(postCycleTasks);
        const postCycleDispatchCapacity = Math.max(0, Math.min(options.limit, clampedTargetActive - postCycleActiveGreenTasks));
        if (shouldContinueGreenDriveLoopImmediately(postCycleDispatchCapacity, cycle)) {
          console.log("refill	free capacity remains and the last cycle made progress; continuing immediately");
          continue;
        }
        await sleep(intervalSeconds * 1e3);
      }
      return hadFailures ? 1 : 0;
    }
    case "qualify": {
      const issueOrSignal = taskOrSource ?? subcommand;
      if (!issueOrSignal) {
        throw new Error("Usage: hackonctl qualify <issue-or-signal> [--title ...]");
      }
      const result = await qualifyTask({
        targetId: getFlagValue(parsed, "target") ?? config.targets[0].id,
        issueOrSignal,
        sourceTitle: getFlagValue(parsed, "title"),
        sourceEvidence: splitCommaList(getFlagValues(parsed, "evidence")),
        candidatePaths: splitCommaList(getFlagValues(parsed, "path")),
        expectedContributionClasses: splitCommaList(getFlagValues(parsed, "class")),
        contributionGroupId: getFlagValue(parsed, "contribution-group"),
        allowDuplicateRisk: hasFlag(parsed, "allow-duplicate-risk") || hasFlag(parsed, "human-override"),
        differentiationNote: getFlagValue(parsed, "differentiation-note")
      }, {
        config,
        stateStore,
        githubProvider
      });
      console.log(`${result.task.taskId}	${result.task.state}	${result.task.duplicateRiskClass}	${result.task.sourceTitle}`);
      return result.task.state === "qualified" ? 0 : 1;
    }
    case "start": {
      const taskId = taskOrSource ?? subcommand;
      if (!taskId) {
        throw new Error("Usage: hackonctl start <task-id>");
      }
      let task = await stateStore.getTask(taskId);
      if (!["qualified", "workspace_prepared", "implementing", "changes_requested", "blocked"].includes(task.state)) {
        throw new Error(`Task ${taskId} cannot be started from state ${task.state}.`);
      }
      const target = getTargetById(config, task.targetId);
      const activeExperimental = task.lane === "experimental" ? (await stateStore.listTasks()).filter((item) => item.taskId !== task.taskId && item.lane === "experimental" && !["duplicate_closed", "abandoned", "judge_approved", "judge_adjusted", "judge_rejected"].includes(item.state)) : [];
      if (activeExperimental.length > 0) {
        console.error(`Experimental lane already has an active task: ${activeExperimental[0]?.taskId}`);
        return 1;
      }
      const workspace = await targetRepo.ensureWorktree(target, repoRoot, task.taskId, task.branchName ?? "feat/hackon/unassigned");
      const guideFiles = await resolveTaskGuideFiles(targetRepo, target, repoRoot, task, workspace.worktreePath);
      const context = await writeTaskContext(runtimePaths, task, {
        config,
        target,
        worktreePath: workspace.worktreePath,
        guideFiles
      });
      if (task.state === "qualified") {
        task = await stateStore.transitionTask(task.taskId, "workspace_prepared", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "workspace.prepared",
            message: `Prepared worktree ${workspace.worktreePath}.`,
            artifactRefs: [context.contextPath]
          },
          mutate: (current) => ({
            ...current,
            worktreePath: workspace.worktreePath,
            branchName: workspace.branchName
          })
        });
      }
      if (task.state !== "implementing") {
        task = await stateStore.transitionTask(task.taskId, "implementing", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "run.implementer.started",
            message: task.state === "blocked" ? "Retrying implementer after coordinator-managed blocker." : "Implementer run started.",
            artifactRefs: [context.implementerPromptPath]
          },
          mutate: (current) => ({
            ...current,
            blockers: [],
            worktreePath: workspace.worktreePath,
            branchName: workspace.branchName
          })
        });
      }
      const run2 = await runCodexAgent(runtimePaths, config, task, "implementer", context.implementerPromptPath, workspace.worktreePath, executor);
      if (run2.blockerArtifact) {
        const nextState = shouldAutoAbandonPrePrBlockedTask(task, "before_validation") ? "abandoned" : "blocked";
        task = await stateStore.transitionTask(task.taskId, nextState, {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: nextState === "abandoned" ? "task.closed" : "run.implementer",
            message: nextState === "abandoned" ? "Task auto-closed as abandoned because the implementer run was blocked before a draft PR was opened." : `Implementer blocked: ${run2.blockerArtifact.summary}`,
            artifactRefs: [context.implementerPromptPath, run2.runArtifact.stdoutPath, run2.runArtifact.stderrPath]
          },
          blockers: nextState === "abandoned" ? [] : [toBlockerReference(run2.blockerArtifact, run2.runArtifact.blockerArtifactPath)],
          mutate: (current) => ({
            ...current,
            worktreePath: workspace.worktreePath,
            branchName: workspace.branchName,
            lastCoordinatorDecision: nextState === "abandoned" ? {
              at: (/* @__PURE__ */ new Date()).toISOString(),
              decision: "Task auto-closed as abandoned after an implementer blocker before draft PR open.",
              rationale: run2.blockerArtifact.summary,
              overrideApplied: false,
              artifactRefs: [run2.runArtifact.stdoutPath, run2.runArtifact.stderrPath]
            } : current.lastCoordinatorDecision
          })
        });
      } else {
        task = await stateStore.saveTask({
          ...task,
          state: "implementing",
          blockers: [],
          worktreePath: workspace.worktreePath,
          branchName: workspace.branchName,
          eventLog: [
            ...task.eventLog,
            {
              at: (/* @__PURE__ */ new Date()).toISOString(),
              type: "run.implementer",
              message: "Implementer run completed.",
              artifactRefs: [context.implementerPromptPath, run2.runArtifact.stdoutPath, run2.runArtifact.stderrPath]
            }
          ],
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      console.log(`${task.taskId}	${task.state}	${workspace.worktreePath}`);
      return task.state === "blocked" || task.state === "abandoned" ? 1 : 0;
    }
    case "validate": {
      const taskId = taskOrSource ?? subcommand;
      if (!taskId) {
        throw new Error("Usage: hackonctl validate <task-id>");
      }
      let task = await stateStore.getTask(taskId);
      assertTaskStateAllowed(task, ["workspace_prepared", "implementing", "changes_requested", "draft_pr_open", "validating"], "validate");
      if (!task.worktreePath) {
        throw new Error(`Task ${taskId} does not have a prepared worktree.`);
      }
      const target = getTargetById(config, task.targetId);
      const canonicalClonePath = await targetRepo.ensureCanonicalClone(target, repoRoot);
      const worktreePath = task.worktreePath;
      task = await enforceChangePolicy(task, "before_validation", {
        config,
        runtimePaths,
        stateStore,
        target,
        targetRepo,
        worktreePath
      });
      if (task.state === "blocked" || task.state === "abandoned") {
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      if (task.state !== "validating") {
        task = await stateStore.transitionTask(task.taskId, "validating", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "validation.started",
            message: "Validation started.",
            artifactRefs: []
          }
        });
      }
      const validation = await runValidationProfiles(runtimePaths, config, target, task, worktreePath, canonicalClonePath, executor, {
        allowApprovalSensitiveProfiles: hasFlag(parsed, "allow-approval-sensitive-validation"),
        includeOptionalProfiles: hasFlag(parsed, "include-optional-validation")
      });
      const shouldAutoAbandon = shouldAutoAbandonPrePrBlockedTask(task, "before_validation");
      const nextState = validation.hasBlockingIssues ? shouldAutoAbandon ? "abandoned" : "blocked" : validation.hasRequiredFailures ? task.prNumber ? "changes_requested" : shouldAutoAbandon ? "abandoned" : "blocked" : task.prNumber ? "draft_pr_open" : "implementing";
      task = await stateStore.transitionTask(task.taskId, nextState, {
        event: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          type: nextState === "abandoned" ? "task.closed" : "validation.completed",
          message: nextState === "abandoned" ? validation.hasBlockingIssues ? "Task auto-closed as abandoned because validation was blocked before a draft PR was opened." : "Task auto-closed as abandoned because required validation failed before a draft PR was opened." : validation.hasBlockingIssues ? "Validation was blocked by execution policy." : validation.hasRequiredFailures ? "Required validation found new failures relative to baseline." : "Required validation passed without new baseline regressions.",
          artifactRefs: []
        },
        blockers: nextState === "abandoned" ? [] : validation.hasBlockingIssues ? [{
          reason: "policy_exception_required",
          summary: "A required approval-sensitive validation profile was blocked by policy.",
          artifactPath: path.join(runtimePaths.artifactsDir, task.taskId, "validation"),
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        }] : validation.hasRequiredFailures ? [{
          reason: "validation_failed",
          summary: "Required validation produced new failures relative to baseline.",
          artifactPath: path.join(runtimePaths.artifactsDir, task.taskId, "validation"),
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        }] : void 0,
        mutate: nextState === "abandoned" ? (current) => ({
          ...current,
          lastCoordinatorDecision: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            decision: "Task auto-closed as abandoned after pre-PR validation failure.",
            rationale: validation.hasBlockingIssues ? "Validation was blocked by execution policy before draft PR open." : "Required validation failed before draft PR open.",
            overrideApplied: false,
            artifactRefs: []
          }
        }) : void 0
      });
      console.log(`${task.taskId}	${task.state}	${validation.artifacts.length} validation artifacts`);
      return validation.hasBlockingIssues || validation.hasRequiredFailures || task.state === "abandoned" ? 1 : 0;
    }
    case "pr": {
      const prCommand = subcommand;
      const taskId = taskOrSource;
      if (!prCommand || !taskId) {
        throw new Error("Usage: hackonctl pr <open|sync> <task-id>");
      }
      let task = await stateStore.getTask(taskId);
      if (prCommand === "open") {
        assertTaskStateAllowed(task, ["implementing", "validating", "blocked"], "pr open");
        if (task.prNumber) {
          throw new Error(`Task ${taskId} already has PR #${task.prNumber}. Use "hackonctl pr sync ${taskId}" instead.`);
        }
      } else if (prCommand === "sync") {
        assertTaskStateAllowed(task, ["draft_pr_open", "review_in_progress", "changes_requested", "review_complete", "ready_pr", "awaiting_portal_submission", "portal_submitted", "judge_pending"], "pr sync");
      } else {
        throw new Error("Usage: hackonctl pr <open|sync> <task-id>");
      }
      const target = getTargetById(config, task.targetId);
      if (!task.branchName) {
        throw new Error(`Task ${taskId} does not have a branch name yet.`);
      }
      if (!task.worktreePath) {
        throw new Error(`Task ${taskId} does not have a prepared worktree.`);
      }
      const worktreePath = task.worktreePath;
      if (prCommand === "open" && task.state === "blocked") {
        task = await stateStore.transitionTask(task.taskId, "implementing", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "pr.open.retry",
            message: "Retrying draft PR open after a coordinator-managed blocker.",
            artifactRefs: []
          },
          mutate: (current) => ({
            ...current,
            blockers: []
          })
        });
      }
      task = await enforceChangePolicy(task, "before_draft_pr_open", {
        config,
        runtimePaths,
        stateStore,
        target,
        targetRepo,
        worktreePath
      });
      if (task.state === "blocked" || task.state === "abandoned") {
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      task = await enforceDuplicateCheckpoint(task, "before_draft_pr_open", {
        target,
        config,
        stateStore,
        githubProvider,
        allowDuplicateRisk: hasFlag(parsed, "allow-duplicate-risk") || hasFlag(parsed, "human-override"),
        differentiationNote: getFlagValue(parsed, "differentiation-note")
      });
      if (task.state === "blocked" || task.state === "duplicate_closed" || task.state === "abandoned") {
        console.log(`${task.taskId}	${task.state}	${task.duplicateRiskClass}`);
        return 1;
      }
      const branchName = task.branchName;
      if (!branchName) {
        throw new Error(`Task ${taskId} does not have a branch name yet.`);
      }
      if (!worktreePath) {
        throw new Error(`Task ${taskId} does not have a prepared worktree.`);
      }
      let branchState;
      try {
        branchState = await targetRepo.prepareBranchForPullRequest(target, worktreePath, {
          branchName,
          commitMessage: buildTaskCommitMessage(task)
        });
      } catch (error) {
        task = await blockTaskWithArtifact(task, {
          stateStore,
          runtimePaths,
          reason: "target_repo_unavailable",
          checkpoint: `pr.${prCommand}.prepare`,
          summary: stringifyErrorMessage(error, "Failed to prepare the task branch for PR packaging.")
        });
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      const branchArtifactPath = path.join(getTaskArtifactRoot(runtimePaths, task.taskId), "branch", `${prCommand}.json`);
      await writeJsonFileAtomic(branchArtifactPath, {
        taskId: task.taskId,
        prCommand,
        preparedAt: (/* @__PURE__ */ new Date()).toISOString(),
        branchState
      });
      try {
        await targetRepo.pushBranch(target, worktreePath, branchName);
      } catch (error) {
        task = await blockTaskWithArtifact(task, {
          stateStore,
          runtimePaths,
          reason: "target_repo_unavailable",
          checkpoint: `pr.${prCommand}.push`,
          summary: stringifyErrorMessage(error, `Failed to push ${branchName} to ${target.forkRemoteName}.`)
        });
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      const prBody = buildPullRequestBody(task, branchState);
      if (prCommand === "open") {
        let pr;
        try {
          pr = await githubProvider.createDraftPullRequest(target, {
            title: task.sourceTitle,
            body: prBody,
            branchName,
            baseBranch: target.defaultBaseBranch
          });
        } catch (error) {
          task = await blockTaskWithArtifact(task, {
            stateStore,
            runtimePaths,
            reason: "github_provider_unavailable",
            checkpoint: "pr.open.github",
            summary: stringifyErrorMessage(error, "Failed to open the draft PR through GitHub.")
          });
          console.log(`${task.taskId}	${task.state}`);
          return 1;
        }
        task = await stateStore.transitionTask(task.taskId, "draft_pr_open", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "pr.opened",
            message: `Draft PR #${pr.number} opened.`,
            artifactRefs: [branchArtifactPath]
          },
          mutate: (current) => ({
            ...current,
            prNumber: pr.number,
            prUrl: pr.url
          })
        });
        console.log(`${task.taskId}	${task.state}	${task.prUrl}`);
        return 0;
      }
      if (!task.prNumber) {
        throw new Error(`Task ${taskId} does not have a PR yet.`);
      }
      try {
        await githubProvider.updatePullRequestBody(target, {
          prNumber: task.prNumber,
          body: prBody
        });
        const implementerComment = `[implementer-agent] Updated: Branch ${task.branchName} was synchronized by the coordinator.`;
        await githubProvider.commentOnPullRequest(target, task.prNumber, implementerComment);
      } catch (error) {
        task = await blockTaskWithArtifact(task, {
          stateStore,
          runtimePaths,
          reason: "github_provider_unavailable",
          checkpoint: "pr.sync.github",
          summary: stringifyErrorMessage(error, "Failed to synchronize the draft PR on GitHub.")
        });
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      console.log(`${task.taskId}	${task.prNumber}	synced`);
      return 0;
    }
    case "ready": {
      const taskId = taskOrSource ?? subcommand;
      if (!taskId) {
        throw new Error("Usage: hackonctl ready <task-id>");
      }
      let task = await stateStore.getTask(taskId);
      assertTaskStateAllowed(task, ["draft_pr_open", "review_in_progress", "blocked"], "ready");
      if (task.state === "blocked") {
        const retryKind = getReadyRetryKind(task);
        if (!retryKind) {
          throw new Error(`Task ${taskId} is blocked for a non-retryable reason and cannot resume through ready().`);
        }
        task = await stateStore.transitionTask(task.taskId, "review_in_progress", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: retryKind === "duplicate_checkpoint" ? "ready.retry.duplicate" : "ready.retry",
            message: retryKind === "duplicate_checkpoint" ? "Retrying ready after a duplicate-checkpoint reassessment." : "Retrying ready after a coordinator-managed GitHub provider blocker.",
            artifactRefs: []
          },
          mutate: (current) => ({
            ...current,
            blockers: []
          })
        });
      }
      if (task.lane === "experimental") {
        task = await stateStore.transitionTask(task.taskId, "human_required", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "ready.blocked",
            message: "Experimental lane tasks never auto-transition to ready.",
            artifactRefs: []
          }
        });
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      if (!task.worktreePath || !task.prNumber) {
        throw new Error(`Task ${taskId} must have a worktree and draft PR before ready().`);
      }
      const worktreePath = task.worktreePath;
      const prNumber = task.prNumber;
      const target = getTargetById(config, task.targetId);
      task = await enforceChangePolicy(task, "before_ready", {
        config,
        runtimePaths,
        stateStore,
        target,
        targetRepo,
        worktreePath
      });
      if (task.state === "blocked") {
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      const guideFiles = await resolveTaskGuideFiles(targetRepo, target, repoRoot, task, worktreePath);
      const context = await writeTaskContext(runtimePaths, task, {
        config,
        target,
        worktreePath,
        guideFiles
      });
      if (task.state !== "review_in_progress") {
        task = await stateStore.transitionTask(task.taskId, "review_in_progress", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "review.started",
            message: "Reviewer run started.",
            artifactRefs: [context.reviewerPromptPath]
          }
        });
      }
      const reviewRun = await runCodexAgent(runtimePaths, config, task, "reviewer", context.reviewerPromptPath, worktreePath, executor);
      const reviewMessage = reviewRun.lastMessage.trim();
      const reviewerDirective = parseReviewerDirective(reviewMessage);
      if (reviewRun.blockerArtifact) {
        task = await stateStore.transitionTask(task.taskId, "blocked", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "review.blocked",
            message: `Reviewer run was blocked: ${reviewRun.blockerArtifact.summary}`,
            artifactRefs: [reviewRun.runArtifact.stdoutPath, reviewRun.runArtifact.stderrPath]
          },
          blockers: [toBlockerReference(reviewRun.blockerArtifact, reviewRun.runArtifact.blockerArtifactPath)]
        });
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      if (reviewMessage) {
        try {
          await githubProvider.commentOnPullRequest(target, prNumber, reviewMessage);
        } catch (error) {
          task = await blockTaskWithArtifact(task, {
            stateStore,
            runtimePaths,
            reason: "github_provider_unavailable",
            checkpoint: "ready.comment",
            summary: stringifyErrorMessage(error, "Failed to post the reviewer result to the PR discussion.")
          });
          console.log(`${task.taskId}	${task.state}`);
          return 1;
        }
      }
      if (reviewerDirective === "unknown") {
        task = await stateStore.transitionTask(task.taskId, "human_required", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "review.contract_violation",
            message: "Reviewer output did not follow the required PR comment contract.",
            artifactRefs: [reviewRun.runArtifact.stdoutPath, reviewRun.runArtifact.stderrPath]
          },
          blockers: [{
            reason: "review_unresolved",
            summary: "Reviewer output did not start with the required [reviewer-agent] prefix.",
            artifactPath: reviewRun.runArtifact.stdoutPath,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }]
        });
        try {
          await githubProvider.commentOnPullRequest(target, prNumber, "[coordinator-agent] Human required: Reviewer output did not follow the required comment contract.");
        } catch {
        }
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      if (reviewerDirective === "blocking") {
        task = await stateStore.transitionTask(task.taskId, "changes_requested", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "review.blocking",
            message: "Reviewer reported blocking findings.",
            artifactRefs: [reviewRun.runArtifact.stdoutPath, reviewRun.runArtifact.stderrPath]
          },
          blockers: [{
            reason: "review_unresolved",
            summary: "Reviewer has unresolved blocking findings.",
            artifactPath: reviewRun.runArtifact.stdoutPath,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }]
        });
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      let reviewSnapshot = null;
      try {
        reviewSnapshot = await githubProvider.getPullRequestReviewSnapshot(target, prNumber);
      } catch (error) {
        task = await blockTaskWithArtifact(task, {
          stateStore,
          runtimePaths,
          reason: "github_provider_unavailable",
          checkpoint: "ready.review_snapshot",
          summary: stringifyErrorMessage(error, "Failed to load the PR review snapshot from GitHub.")
        });
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      if (!reviewSnapshot) {
        task = await blockTaskWithArtifact(task, {
          stateStore,
          runtimePaths,
          reason: "github_provider_unavailable",
          checkpoint: "ready.review_snapshot",
          summary: "GitHub review snapshot was unavailable while evaluating readiness."
        });
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      const reviewGate = evaluateReviewGate(reviewSnapshot);
      const reviewArtifactPath = path.join(getTaskArtifactRoot(runtimePaths, task.taskId), "reviews", "ready-check.json");
      await writeJsonFileAtomic(reviewArtifactPath, {
        taskId: task.taskId,
        prNumber,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
        reviewerDirective,
        reviewGate,
        reviewSnapshot
      });
      if (reviewGate.disposition === "human_required") {
        task = await stateStore.transitionTask(task.taskId, "human_required", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "review.human_required",
            message: reviewGate.summary,
            artifactRefs: [reviewArtifactPath, reviewRun.runArtifact.stdoutPath, reviewRun.runArtifact.stderrPath]
          },
          blockers: [{
            reason: "review_unresolved",
            summary: reviewGate.summary,
            artifactPath: reviewArtifactPath,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }]
        });
        try {
          await githubProvider.commentOnPullRequest(target, prNumber, `[coordinator-agent] Human required: ${reviewGate.summary}`);
        } catch {
        }
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      if (reviewGate.disposition === "changes_requested") {
        task = await stateStore.transitionTask(task.taskId, "changes_requested", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "review.blocking",
            message: reviewGate.summary,
            artifactRefs: [reviewArtifactPath, reviewRun.runArtifact.stdoutPath, reviewRun.runArtifact.stderrPath]
          },
          blockers: [{
            reason: "review_unresolved",
            summary: reviewGate.summary,
            artifactPath: reviewArtifactPath,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }]
        });
        console.log(`${task.taskId}	${task.state}`);
        return 1;
      }
      const readyArtifactRefs = [reviewArtifactPath, reviewRun.runArtifact.stdoutPath, reviewRun.runArtifact.stderrPath];
      task = await enforceDuplicateCheckpoint(task, "before_portal_submission", {
        target,
        config,
        stateStore,
        githubProvider,
        allowDuplicateRisk: hasFlag(parsed, "allow-duplicate-risk") || hasFlag(parsed, "human-override"),
        differentiationNote: getFlagValue(parsed, "differentiation-note")
      });
      if (task.state === "blocked" || task.state === "duplicate_closed") {
        console.log(`${task.taskId}	${task.state}	${task.duplicateRiskClass}`);
        return 1;
      }
      task = await stateStore.transitionTask(task.taskId, "review_complete", {
        event: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          type: "review.complete",
          message: "Reviewer marked the PR ready.",
          artifactRefs: readyArtifactRefs
        },
        blockers: []
      });
      if (task.portalStatus === "submitted") {
        task = await stateStore.transitionTask(task.taskId, "judge_pending", {
          event: {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            type: "judge.pending",
            message: "Updated submitted PR is ready for judge handling.",
            artifactRefs: readyArtifactRefs
          },
          blockers: [],
          mutate: (current) => ({
            ...current,
            judgeStatus: "pending",
            lastCoordinatorDecision: {
              at: (/* @__PURE__ */ new Date()).toISOString(),
              decision: "Updated submitted PR is ready for another judge pass.",
              rationale: "Reviewer marked the post-feedback update ready without requiring a new portal submission.",
              overrideApplied: false,
              artifactRefs: readyArtifactRefs
            }
          })
        });
        console.log(`${task.taskId}	${task.state}	${task.prUrl ?? ""}`);
        return 0;
      }
      task = await stateStore.transitionTask(task.taskId, "ready_pr", {
        event: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          type: "ready.pr",
          message: "PR is ready for portal submission.",
          artifactRefs: []
        }
      });
      task = await stateStore.transitionTask(task.taskId, "awaiting_portal_submission", {
        event: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          type: "portal.awaiting",
          message: "Waiting for manual portal submission.",
          artifactRefs: []
        },
        mutate: (current) => ({
          ...current,
          portalStatus: "awaiting_submission"
        })
      });
      await githubProvider.commentOnPullRequest(target, prNumber, buildPortalAwaitingComment(task));
      console.log(`${task.taskId}	${task.state}	${task.prUrl ?? ""}`);
      return 0;
    }
    case "portal": {
      if (subcommand !== "confirm") {
        throw new Error("Usage: hackonctl portal confirm <task-id>");
      }
      const taskId = taskOrSource;
      if (!taskId) {
        throw new Error("Usage: hackonctl portal confirm <task-id>");
      }
      let task = await stateStore.getTask(taskId);
      assertTaskStateAllowed(task, ["awaiting_portal_submission"], "portal confirm");
      task = await stateStore.transitionTask(task.taskId, "portal_submitted", {
        event: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          type: "portal.submitted",
          message: "Manual portal submission confirmed.",
          artifactRefs: []
        },
        mutate: (current) => ({
          ...current,
          portalStatus: "submitted"
        })
      });
      task = await stateStore.transitionTask(task.taskId, "judge_pending", {
        event: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          type: "judge.pending",
          message: "Submission is now waiting for judge handling.",
          artifactRefs: []
        },
        mutate: (current) => ({
          ...current,
          judgeStatus: "pending"
        })
      });
      console.log(`${task.taskId}	${task.state}`);
      return 0;
    }
    case "judge": {
      if (subcommand !== "update") {
        throw new Error("Usage: hackonctl judge update <task-id> --status <pending|approved|adjusted|rejected>");
      }
      const taskId = taskOrSource;
      const status = getFlagValue(parsed, "status");
      if (!taskId || !status) {
        throw new Error("Usage: hackonctl judge update <task-id> --status <pending|approved|adjusted|rejected>");
      }
      const task = await stateStore.getTask(taskId);
      assertTaskStateAllowed(task, ["portal_submitted", "judge_pending"], "judge update");
      const transitionMap = {
        pending: "judge_pending",
        approved: "judge_approved",
        adjusted: "judge_adjusted",
        rejected: "judge_rejected"
      };
      const nextState = transitionMap[status];
      if (!nextState) {
        throw new Error(`Unsupported judge status: ${status}`);
      }
      const nextTask = await stateStore.transitionTask(task.taskId, nextState, {
        event: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          type: "judge.updated",
          message: `Judge status updated to ${status}.`,
          artifactRefs: []
        },
        mutate: (current) => ({
          ...current,
          judgeStatus: status === "pending" ? "pending" : status === "approved" ? "approved" : status === "adjusted" ? "adjusted" : "rejected"
        })
      });
      console.log(`${nextTask.taskId}	${nextTask.state}`);
      return 0;
    }
    case "prune": {
      const requestedStates = getFlagValues(parsed, "state");
      const allowedStates = requestedStates.length > 0 ? requestedStates.map((state) => taskStateSchema.parse(state)) : defaultPrunableWorktreeStates;
      const prunableTasks = selectPrunableTaskWorktrees(await stateStore.listTasks(), allowedStates);
      if (prunableTasks.length === 0) {
        console.log("No prunable worktrees found.");
        return 0;
      }
      if (hasFlag(parsed, "dry-run")) {
        for (const task of prunableTasks) {
          console.log(`prunable	${task.taskId}	${task.state}	${task.worktreePath ?? ""}`);
        }
        return 0;
      }
      let hadFailures = false;
      for (const task of prunableTasks) {
        if (!task.worktreePath) {
          continue;
        }
        const target = getTargetById(config, task.targetId);
        try {
          await targetRepo.removeWorktree(target, repoRoot, task.worktreePath);
          const prunedAt = (/* @__PURE__ */ new Date()).toISOString();
          await stateStore.saveTask({
            ...task,
            worktreePath: null,
            eventLog: [
              ...task.eventLog,
              {
                at: prunedAt,
                type: "workspace.pruned",
                message: "Coordinator pruned the local task worktree to reclaim disk space.",
                artifactRefs: []
              }
            ],
            updatedAt: prunedAt
          });
          console.log(`pruned	${task.taskId}	${task.state}`);
        } catch (error) {
          hadFailures = true;
          console.log(`failed	${task.taskId}	${stringifyErrorMessage(error, "Failed to prune the task worktree.")}`);
        }
      }
      return hadFailures ? 1 : 0;
    }
    case "close": {
      const taskId = taskOrSource ?? subcommand;
      if (!taskId) {
        throw new Error("Usage: hackonctl close <task-id> [--state duplicate_closed|abandoned]");
      }
      const task = await stateStore.getTask(taskId);
      const requestedState = getFlagValue(parsed, "state") === "duplicate_closed" ? "duplicate_closed" : "abandoned";
      const nextTask = await stateStore.transitionTask(task.taskId, requestedState, {
        event: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          type: "task.closed",
          message: `Task closed as ${requestedState}.`,
          artifactRefs: []
        }
      });
      console.log(`${nextTask.taskId}	${nextTask.state}`);
      return 0;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
function buildPullRequestBody(task, branchState) {
  const changedFilesSection = branchState && branchState.changedFiles.length > 0 ? [
    ...branchState.changedFiles.slice(0, 12).map((filePath) => `- ${filePath}`),
    branchState.changedFiles.length > 12 ? `- ...and ${branchState.changedFiles.length - 12} more file(s)` : "",
    `- Diff summary: +${branchState.addedLines} / -${branchState.removedLines} (${branchState.totalDiffLines} total lines)`,
    `- Branch head: ${branchState.headSha}`
  ].filter(Boolean) : ["- Coordinator has not recorded committed branch changes yet."];
  return [
    `Source: ${task.sourceType === "github_issue" ? `GitHub issue #${task.sourceId}` : `Repository signal \u2014 ${task.sourceTitle}`}`,
    "",
    "## Problem Summary",
    task.sourceTitle,
    "",
    "## Expected Behavior",
    task.sourceEvidence[0] ?? "Behavior should match the referenced source and contribution intent.",
    "",
    "## Actual Behavior",
    task.sourceEvidence.slice(1).join("\n") || "Current repository state does not satisfy the contribution target.",
    "",
    "## What Changed",
    ...changedFilesSection,
    "",
    "## Validation / Tests",
    ...task.validationProfileIds.map((profileId) => `- ${profileId}`),
    task.validationProfileIds.length === 0 ? "- No validation profiles were auto-selected." : "",
    "",
    "## Expected Contribution Classes",
    ...task.expectedContributionClasses.map((item) => `- ${item}`),
    task.expectedContributionClasses.length === 0 ? "- Unspecified" : "",
    task.differentiationNote ? "" : "",
    task.differentiationNote ? "## Duplicate Differentiation Note" : "",
    task.differentiationNote ?? ""
  ].filter(Boolean).join("\n");
}
function buildTaskCommitMessage(task) {
  const normalizedTitle = task.sourceTitle.replace(/\s+/g, " ").trim();
  const truncatedTitle = normalizedTitle.length > 60 ? `${normalizedTitle.slice(0, 57).trimEnd()}...` : normalizedTitle;
  return `hackon(${task.taskId}): ${truncatedTitle}`;
}
function buildPortalAwaitingComment(task) {
  return [
    "[coordinator-agent] Awaiting portal submission:",
    `- PR URL: ${task.prUrl ?? "(missing)"}`,
    `- PR title: ${task.sourceTitle}`,
    `- Short summary: ${task.sourceTitle}`,
    `- Expected contribution classes: ${task.expectedContributionClasses.join(", ") || "(unspecified)"}`,
    `- Duplicate-risk status: ${task.duplicateRiskClass}`,
    `- Contribution-group context: ${task.contributionGroupId ?? "(none)"}`
  ].join("\n");
}
async function resolveTaskGuideFiles(targetRepo, target, repoRoot, task, worktreePath) {
  const guideFiles = await targetRepo.resolveGuideFiles(target, repoRoot, task.candidatePaths);
  const supplementalGuideFiles = await resolveSupplementalTaskGuideFiles(task, worktreePath);
  return [.../* @__PURE__ */ new Set([...guideFiles, ...supplementalGuideFiles])];
}
async function resolveSupplementalTaskGuideFiles(task, worktreePath) {
  const requiresIntegrationTestGuidance = isIntegrationTestTask(task);
  if (!requiresIntegrationTestGuidance || !worktreePath) {
    return [];
  }
  const candidateGuideFiles = [
    path.join(worktreePath, ".ai", "qa", "AGENTS.md"),
    path.join(worktreePath, ".ai", "skills", "integration-tests", "SKILL.md")
  ];
  const resolvedGuideFiles = [];
  for (const candidateGuideFile of candidateGuideFiles) {
    if (await pathExists(candidateGuideFile)) {
      resolvedGuideFiles.push(candidateGuideFile);
    }
  }
  return resolvedGuideFiles;
}
function getAutonomousTaskTimeoutMs(config) {
  return Math.max(
    config.codex.implementer.timeoutMs,
    config.codex.testImplementer?.timeoutMs ?? config.codex.implementer.timeoutMs
  ) + 10 * 60 * 1e3;
}
function toBlockerReference(blocker, artifactPath) {
  return {
    reason: blocker.reason,
    summary: blocker.summary,
    createdAt: blocker.createdAt,
    artifactPath: artifactPath ?? blocker.runId
  };
}
function assertTaskStateAllowed(task, allowedStates, action) {
  if (!allowedStates.includes(task.state)) {
    throw new Error(`Task ${task.taskId} cannot run "${action}" from state ${task.state}. Allowed states: ${allowedStates.join(", ")}.`);
  }
}
async function blockTaskWithArtifact(task, options) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const artifactPath = path.join(getTaskArtifactRoot(options.runtimePaths, task.taskId), "blockers", `${options.checkpoint}.json`);
  await writeJsonFileAtomic(artifactPath, {
    taskId: task.taskId,
    checkpoint: options.checkpoint,
    reason: options.reason,
    summary: options.summary,
    createdAt
  });
  return options.stateStore.transitionTask(task.taskId, "blocked", {
    event: {
      at: createdAt,
      type: `blocker.${options.checkpoint}`,
      message: options.summary,
      artifactRefs: [artifactPath]
    },
    blockers: [{
      reason: options.reason,
      summary: options.summary,
      artifactPath,
      createdAt
    }],
    mutate: (current) => ({
      ...current,
      lastCoordinatorDecision: {
        at: createdAt,
        decision: `Blocked at ${options.checkpoint}.`,
        rationale: options.summary,
        overrideApplied: false,
        artifactRefs: [artifactPath]
      }
    })
  });
}
function stringifyErrorMessage(error, fallback) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}
function getReadyRetryKind(task) {
  if (task.state !== "blocked" || !task.prNumber) {
    return null;
  }
  if (task.blockers.length > 0 && task.blockers.every((blocker) => blocker.reason === "github_provider_unavailable")) {
    return "github_provider";
  }
  if (task.blockers.length > 0 || task.duplicateRiskClass !== "likely_duplicate") {
    return null;
  }
  if (!task.lastCoordinatorDecision?.decision.startsWith("Blocked at duplicate checkpoint ")) {
    return null;
  }
  const blockedAt = Date.parse(task.lastCoordinatorDecision.at);
  const alreadyRetried = task.eventLog.some((event) => {
    if (event.type !== "ready.retry.duplicate") {
      return false;
    }
    if (!Number.isFinite(blockedAt)) {
      return true;
    }
    return Date.parse(event.at) >= blockedAt;
  });
  return alreadyRetried ? null : "duplicate_checkpoint";
}
async function enforceChangePolicy(task, checkpoint, options) {
  const guardrail = getLaneGuardrail(options.config, task.lane);
  const summary = await options.targetRepo.getChangeSummary(options.target, options.worktreePath);
  const result = evaluateChangePolicy(guardrail, summary);
  const artifactPath = path.join(getTaskArtifactRoot(options.runtimePaths, task.taskId), "policy", `${checkpoint}.json`);
  await writeJsonFileAtomic(artifactPath, {
    taskId: task.taskId,
    checkpoint,
    lane: task.lane,
    guardrail,
    result
  });
  if (result.status === "passed") {
    return task;
  }
  if (shouldAutoAbandonPrePrBlockedTask(task, checkpoint)) {
    return options.stateStore.transitionTask(task.taskId, "abandoned", {
      event: {
        at: (/* @__PURE__ */ new Date()).toISOString(),
        type: "task.closed",
        message: `Task auto-closed as abandoned after change policy blocked it at ${checkpoint} before a draft PR was opened.`,
        artifactRefs: [artifactPath]
      },
      blockers: [],
      mutate: (current) => ({
        ...current,
        lastCoordinatorDecision: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          decision: `Change policy auto-closed the task at ${checkpoint} before draft PR open.`,
          rationale: result.reasons.join(" "),
          overrideApplied: false,
          artifactRefs: [artifactPath]
        }
      })
    });
  }
  return options.stateStore.transitionTask(task.taskId, "blocked", {
    event: {
      at: (/* @__PURE__ */ new Date()).toISOString(),
      type: `policy.${checkpoint}`,
      message: `Change policy blocked the task at ${checkpoint}.`,
      artifactRefs: [artifactPath]
    },
    blockers: [{
      reason: "policy_exception_required",
      summary: result.reasons.join(" "),
      artifactPath,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }],
    mutate: (current) => ({
      ...current,
      lastCoordinatorDecision: {
        at: (/* @__PURE__ */ new Date()).toISOString(),
        decision: `Change policy blocked the task at ${checkpoint}.`,
        rationale: result.reasons.join(" "),
        overrideApplied: false,
        artifactRefs: [artifactPath]
      }
    })
  });
}
async function enforceDuplicateCheckpoint(task, checkpoint, options) {
  const duplicateCheck = await runDuplicateCheck({
    taskId: task.taskId,
    sourceType: task.sourceType,
    sourceId: task.sourceId,
    sourceTitle: task.sourceTitle,
    sourceEvidence: task.sourceEvidence,
    candidatePaths: task.candidatePaths,
    contributionGroupId: task.contributionGroupId,
    branchName: task.branchName
  }, {
    target: options.target,
    localTasks: await options.stateStore.listTasks(),
    githubProvider: options.githubProvider
  });
  const differentiationNote = options.differentiationNote ?? task.differentiationNote;
  const duplicateDecision = duplicateCheck.signals.map((signal) => signal.summary).join(" ") || "No duplicate-risk signals found.";
  const decisionAt = (/* @__PURE__ */ new Date()).toISOString();
  if (duplicateCheck.duplicateRiskClass === "none") {
    const nextTask2 = {
      ...task,
      duplicateRiskClass: "none",
      duplicateSignals: [],
      lastCoordinatorDecision: {
        at: decisionAt,
        decision: `Duplicate checkpoint ${checkpoint} passed.`,
        rationale: duplicateDecision,
        overrideApplied: false,
        artifactRefs: []
      },
      updatedAt: decisionAt
    };
    await options.stateStore.saveTask(nextTask2);
    return nextTask2;
  }
  const shouldBlock = duplicateCheck.duplicateRiskClass === "hard_duplicate" || !options.allowDuplicateRisk || options.config.policy.requireDifferentiationNoteOnOverride && !differentiationNote;
  if (shouldBlock) {
    const nextState = task.state === "qualified" && duplicateCheck.duplicateRiskClass === "hard_duplicate" ? "duplicate_closed" : "blocked";
    if (nextState === "blocked" && shouldAutoAbandonPrePrBlockedTask(task, checkpoint)) {
      return options.stateStore.transitionTask(task.taskId, "abandoned", {
        event: {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          type: "task.closed",
          message: `Task auto-closed as abandoned after duplicate checkpoint ${checkpoint} blocked it before a draft PR was opened.`,
          artifactRefs: []
        },
        blockers: [],
        mutate: (current) => ({
          ...current,
          duplicateRiskClass: duplicateCheck.duplicateRiskClass,
          duplicateSignals: duplicateCheck.signals,
          differentiationNote: differentiationNote ?? current.differentiationNote,
          lastCoordinatorDecision: {
            at: decisionAt,
            decision: `Duplicate checkpoint ${checkpoint} auto-closed the task before draft PR open.`,
            rationale: duplicateDecision,
            overrideApplied: false,
            artifactRefs: []
          }
        })
      });
    }
    return options.stateStore.transitionTask(task.taskId, nextState, {
      event: {
        at: (/* @__PURE__ */ new Date()).toISOString(),
        type: `duplicate.${checkpoint}`,
        message: `Duplicate checkpoint ${checkpoint} blocked the task.`,
        artifactRefs: []
      },
      mutate: (current) => ({
        ...current,
        duplicateRiskClass: duplicateCheck.duplicateRiskClass,
        duplicateSignals: duplicateCheck.signals,
        differentiationNote: differentiationNote ?? current.differentiationNote,
        lastCoordinatorDecision: {
          at: decisionAt,
          decision: `Blocked at duplicate checkpoint ${checkpoint}.`,
          rationale: duplicateDecision,
          overrideApplied: false,
          artifactRefs: []
        }
      })
    });
  }
  const nextTask = {
    ...task,
    duplicateRiskClass: duplicateCheck.duplicateRiskClass,
    duplicateSignals: duplicateCheck.signals,
    differentiationNote,
    lastCoordinatorDecision: {
      at: decisionAt,
      decision: `Duplicate checkpoint ${checkpoint} passed with explicit override.`,
      rationale: duplicateDecision,
      overrideApplied: true,
      artifactRefs: []
    },
    updatedAt: decisionAt
  };
  await options.stateStore.saveTask(nextTask);
  return nextTask;
}
function printHelp() {
  console.log(`hackonctl commands:
  hackonctl init
  hackonctl doctor
  hackonctl sync
  hackonctl discover [--lane <lane>] [--limit <n>]
  hackonctl dispatch green [--limit <n>] [--discover-limit <n>] [--concurrency <n>] [--dry-run]
  hackonctl drive green [--target-active <n>] [--interval-seconds <n>] [--limit <n>] [--discover-limit <n>] [--concurrency <n>] [--once] [--dry-run]
  hackonctl queue
  hackonctl qualify <issue-or-signal>
  hackonctl start <task-id>
  hackonctl validate <task-id> [--allow-approval-sensitive-validation] [--include-optional-validation]
  hackonctl pr open <task-id>
  hackonctl pr sync <task-id>
  hackonctl ready <task-id>
  hackonctl portal confirm <task-id>
  hackonctl judge update <task-id> --status <pending|approved|adjusted|rejected>
  hackonctl prune [--state <task-state>] [--dry-run]
  hackonctl close <task-id>`);
}
function parseGreenDispatchOptions(parsed) {
  const limitRaw = getFlagValue(parsed, "limit") ?? "2";
  const discoverLimitRaw = getFlagValue(parsed, "discover-limit") ?? String(Math.max(Number.parseInt(limitRaw, 10) * 4 || 8, 8));
  const concurrencyRaw = getFlagValue(parsed, "concurrency") ?? "2";
  const limit = Number.parseInt(limitRaw, 10);
  const discoverLimit = Number.parseInt(discoverLimitRaw, 10);
  const concurrency = Number.parseInt(concurrencyRaw, 10);
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(discoverLimit) || discoverLimit <= 0 || !Number.isFinite(concurrency) || concurrency <= 0) {
    throw new Error("green dispatch requires positive numeric --limit, --discover-limit, and --concurrency values.");
  }
  return {
    limit: Math.min(limit, maxAutonomousGreenLaneConcurrency),
    discoverLimit,
    concurrency: Math.min(concurrency, maxAutonomousGreenLaneConcurrency)
  };
}
const maxImmediateGithubRediscoveryBatches = 3;
async function runGreenDispatchCycle(dependencies, options, hooks = {}) {
  const cycleStartedAtMs = Date.now();
  const cycleStartedAt = new Date(cycleStartedAtMs).toISOString();
  const syncSubmittedTasks = hooks.syncSubmittedJudgeTasks ?? syncSubmittedJudgeTasks;
  const discoverAndQueue = hooks.discoverAndQueueGreenLaneCandidates ?? discoverAndQueueGreenLaneCandidates;
  const startQueuedTasks = hooks.startTasksInParallel ?? startTasksInParallel;
  const progressTasks = hooks.progressGreenLaneTasksInParallel ?? progressGreenLaneTasksInParallel;
  const events = [];
  const judgeSyncCandidates = options.dryRun || !options.advanceWorkflow ? [] : selectJudgePendingTasks(await dependencies.stateStore.listTasks(), options.targetId);
  const judgeSyncTaskIds = judgeSyncCandidates.map((task) => task.taskId);
  if (judgeSyncTaskIds.length > 0) {
    events.push({
      at: cycleStartedAt,
      phase: "judge_sync",
      status: "started",
      taskIds: judgeSyncTaskIds,
      message: `Checking ${judgeSyncTaskIds.length} submitted PR(s) for merged, changes-requested, or rejected outcomes.`
    });
  }
  const judgeSyncResults = judgeSyncTaskIds.length > 0 ? await syncSubmittedTasks(dependencies, {
    taskIds: judgeSyncTaskIds
  }) : [];
  if (judgeSyncTaskIds.length > 0) {
    events.push({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      phase: "judge_sync",
      status: "completed",
      taskIds: judgeSyncTaskIds,
      successCount: judgeSyncResults.length,
      message: `Checked ${judgeSyncTaskIds.length} submitted PR(s) and applied ${judgeSyncResults.length} submitted-PR update(s).`
    });
  }
  const progressableTasks = options.dryRun || !options.advanceWorkflow ? [] : selectProgressableGreenLaneTasks(await dependencies.stateStore.listTasks(), maxAutonomousGreenLaneConcurrency);
  const progressedTaskIds = progressableTasks.map((task) => task.taskId);
  if (progressedTaskIds.length > 0) {
    events.push({
      at: cycleStartedAt,
      phase: "progress",
      status: "started",
      taskIds: progressedTaskIds,
      message: `Starting progression for ${progressedTaskIds.length} active green-lane task(s).`
    });
  }
  const progressResults = progressedTaskIds.length > 0 ? await progressTasks(progressedTaskIds, {
    repoRoot: dependencies.repoRoot,
    executor: dependencies.executor,
    concurrency: options.concurrency,
    timeoutMsByStep: {
      validate: getAutonomousTaskTimeoutMs(dependencies.config),
      pr_open: 5 * 60 * 1e3,
      pr_sync: 5 * 60 * 1e3,
      ready: dependencies.config.codex.reviewer.timeoutMs + 10 * 60 * 1e3
    },
    getTask: async (taskId) => dependencies.stateStore.getTask(taskId)
  }) : [];
  if (progressedTaskIds.length > 0) {
    events.push({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      phase: "progress",
      status: "completed",
      taskIds: progressedTaskIds,
      successCount: progressResults.filter((result) => result.result.exitCode === 0).length,
      failureCount: progressResults.filter((result) => result.result.exitCode !== 0).length,
      message: `Completed progression for ${progressedTaskIds.length} active green-lane task(s).`
    });
  }
  const discoveryBatches = [];
  const repoSignalBatch = await discoverAndQueue(dependencies, {
    attempt: 1,
    targetId: options.targetId,
    discoverLimit: options.discoverLimit,
    selectionLimit: options.selectionLimit,
    sourceKind: "repo_signal",
    dryRun: options.dryRun
  });
  discoveryBatches.push(repoSignalBatch);
  events.push(toGreenDiscoveryEvent(repoSignalBatch));
  events.push(toGreenQueueSnapshotEvent(repoSignalBatch));
  let tasks = await dependencies.stateStore.listTasks();
  let queuedTasks = selectQueuedGreenLaneTasks(tasks, Number.MAX_SAFE_INTEGER);
  let queuedGithubTasks = queuedTasks.filter((task) => task.sourceType === "github_issue");
  const excludedGithubSourceKeys = /* @__PURE__ */ new Set();
  let githubDiscoveryAttempt = 0;
  while (queuedGithubTasks.length === 0 && githubDiscoveryAttempt < maxImmediateGithubRediscoveryBatches) {
    githubDiscoveryAttempt += 1;
    const githubBatch = await discoverAndQueue(dependencies, {
      attempt: githubDiscoveryAttempt,
      targetId: options.targetId,
      discoverLimit: options.discoverLimit,
      selectionLimit: options.selectionLimit,
      sourceKind: "github_issue",
      dryRun: options.dryRun,
      excludeSourceKeys: [...excludedGithubSourceKeys]
    });
    discoveryBatches.push(githubBatch);
    events.push(toGreenDiscoveryEvent(githubBatch));
    events.push(toGreenQueueSnapshotEvent(githubBatch));
    for (const candidate of [
      ...githubBatch.selection.selected,
      ...githubBatch.selection.skipped.map((entry) => entry.candidate)
    ]) {
      excludedGithubSourceKeys.add(makeDiscoverySourceKey(candidate.sourceType, candidate.sourceId));
    }
    if (githubBatch.discoveredCandidates === 0) {
      break;
    }
    tasks = await dependencies.stateStore.listTasks();
    queuedTasks = selectQueuedGreenLaneTasks(tasks, Number.MAX_SAFE_INTEGER);
    queuedGithubTasks = queuedTasks.filter((task) => task.sourceType === "github_issue");
    if (githubBatch.selection.selected.length > 0 || queuedGithubTasks.length > 0) {
      break;
    }
  }
  const queueTasksBeforeDispatch = await dependencies.stateStore.listTasks();
  const queueSnapshotBeforeDispatch = buildGreenQueueSnapshot(queueTasksBeforeDispatch);
  const dispatchQueue = selectQueuedGreenLaneTasks(queueTasksBeforeDispatch, options.dispatchLimit);
  const dispatchedTaskIds = dispatchQueue.map((task) => task.taskId);
  if (options.dryRun) {
    const completedAt2 = (/* @__PURE__ */ new Date()).toISOString();
    return {
      startedAt: cycleStartedAt,
      completedAt: completedAt2,
      durationMs: Date.now() - cycleStartedAtMs,
      queuedTaskIds: dispatchQueue.map((task) => task.taskId),
      dispatchedTaskIds,
      progressedTaskIds: [],
      queueSnapshotBeforeDispatch,
      queueSnapshotAfterCycle: queueSnapshotBeforeDispatch,
      discoveryBatches,
      judgeSyncResults: [],
      startResults: [],
      progressResults: [],
      events
    };
  }
  if (dispatchedTaskIds.length > 0) {
    events.push({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      phase: "start",
      status: "started",
      taskIds: dispatchedTaskIds,
      dispatchCount: dispatchedTaskIds.length,
      message: `Starting ${dispatchedTaskIds.length} queued green-lane task(s).`
    });
  }
  const startResults = dispatchedTaskIds.length > 0 ? await startQueuedTasks(dispatchedTaskIds, {
    repoRoot: dependencies.repoRoot,
    runtimePaths: dependencies.runtimePaths,
    executor: dependencies.executor,
    concurrency: options.concurrency,
    timeoutMs: getAutonomousTaskTimeoutMs(dependencies.config)
  }) : [];
  if (dispatchedTaskIds.length > 0) {
    events.push({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      phase: "start",
      status: "completed",
      taskIds: dispatchedTaskIds,
      dispatchCount: dispatchedTaskIds.length,
      successCount: startResults.filter((result) => result.result.exitCode === 0).length,
      failureCount: startResults.filter((result) => result.result.exitCode !== 0).length,
      message: `Completed start attempts for ${dispatchedTaskIds.length} queued green-lane task(s).`
    });
  }
  const postCycleTasks = await dependencies.stateStore.listTasks();
  const queueSnapshotAfterCycle = buildGreenQueueSnapshot(postCycleTasks);
  const completedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!options.advanceWorkflow) {
    return {
      startedAt: cycleStartedAt,
      completedAt,
      durationMs: Date.now() - cycleStartedAtMs,
      queuedTaskIds: dispatchQueue.map((task) => task.taskId),
      dispatchedTaskIds,
      progressedTaskIds: [],
      queueSnapshotBeforeDispatch,
      queueSnapshotAfterCycle,
      discoveryBatches,
      judgeSyncResults,
      startResults,
      progressResults: [],
      events
    };
  }
  return {
    startedAt: cycleStartedAt,
    completedAt,
    durationMs: Date.now() - cycleStartedAtMs,
    queuedTaskIds: dispatchQueue.map((task) => task.taskId),
    dispatchedTaskIds,
    progressedTaskIds,
    queueSnapshotBeforeDispatch,
    queueSnapshotAfterCycle,
    discoveryBatches,
    judgeSyncResults,
    startResults,
    progressResults,
    events
  };
}
async function syncSubmittedJudgeTasks(dependencies, options) {
  const queue = [...options.taskIds];
  const results = [];
  const workerCount = Math.max(1, Math.min(queue.length, 4, maxAutonomousGreenLaneConcurrency));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const taskId = queue.shift();
      if (!taskId) {
        return;
      }
      const result = await syncSubmittedJudgeTask(dependencies, taskId);
      if (result) {
        results.push(result);
      }
    }
  }));
  return results;
}
async function syncSubmittedJudgeTask(dependencies, taskId) {
  let task = await dependencies.stateStore.getTask(taskId);
  if (task.state !== "judge_pending" || !task.prNumber) {
    return null;
  }
  const target = getTargetById(dependencies.config, task.targetId);
  let pullRequest;
  try {
    pullRequest = await dependencies.githubProvider.getPullRequest(target, task.prNumber);
  } catch {
    return null;
  }
  if (!pullRequest) {
    return null;
  }
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  const judgeArtifactPath = path.join(getTaskArtifactRoot(dependencies.runtimePaths, task.taskId), "judge", "latest.json");
  if (pullRequest.mergedAt) {
    await writeJsonFileAtomic(judgeArtifactPath, {
      checkedAt,
      prNumber: task.prNumber,
      prUrl: task.prUrl ?? pullRequest.url,
      outcome: "merged",
      pullRequest
    });
    const artifactRefs2 = [judgeArtifactPath];
    task = await dependencies.stateStore.transitionTask(task.taskId, "judge_approved", {
      event: {
        at: checkedAt,
        type: "judge.synced",
        message: `PR #${task.prNumber} merged upstream; task auto-marked approved.`,
        artifactRefs: artifactRefs2
      },
      mutate: (current) => ({
        ...current,
        judgeStatus: "approved",
        lastCoordinatorDecision: {
          at: checkedAt,
          decision: "Judge outcome auto-synced from merged PR.",
          rationale: `PR #${task.prNumber} is merged upstream.`,
          overrideApplied: false,
          artifactRefs: artifactRefs2
        }
      })
    });
    return {
      taskId: task.taskId,
      outcome: "approved",
      summary: `PR #${task.prNumber} merged upstream.`
    };
  }
  if (isDuplicatePullRequest(pullRequest)) {
    await writeJsonFileAtomic(judgeArtifactPath, {
      checkedAt,
      prNumber: task.prNumber,
      prUrl: task.prUrl ?? pullRequest.url,
      outcome: "duplicate",
      pullRequest
    });
    const artifactRefs2 = [judgeArtifactPath];
    task = await dependencies.stateStore.transitionTask(task.taskId, "duplicate_closed", {
      event: {
        at: checkedAt,
        type: "judge.synced",
        message: `PR #${task.prNumber} was closed as a duplicate; task auto-closed.`,
        artifactRefs: artifactRefs2
      },
      mutate: (current) => ({
        ...current,
        judgeStatus: "rejected",
        lastCoordinatorDecision: {
          at: checkedAt,
          decision: "Judge outcome auto-synced from duplicate closure.",
          rationale: `PR #${task.prNumber} was closed with the duplicate label.`,
          overrideApplied: false,
          artifactRefs: artifactRefs2
        }
      })
    });
    return {
      taskId: task.taskId,
      outcome: "rejected",
      summary: `PR #${task.prNumber} was closed as a duplicate.`
    };
  }
  const reviewSnapshot = await dependencies.githubProvider.getPullRequestReviewSnapshot(target, task.prNumber).catch(() => null);
  if (isChangesRequestedPullRequest(pullRequest, reviewSnapshot)) {
    const reviewGate = reviewSnapshot ? evaluateReviewGate(reviewSnapshot) : null;
    const requestedChangesReason = extractLatestJudgeRejectionReason(reviewSnapshot);
    await writeJsonFileAtomic(judgeArtifactPath, {
      checkedAt,
      prNumber: task.prNumber,
      prUrl: task.prUrl ?? pullRequest.url,
      outcome: "changes_requested",
      pullRequest,
      reviewGate,
      requestedChangesReason
    });
    const artifactRefs2 = [judgeArtifactPath];
    const rationale = requestedChangesReason?.body ?? reviewGate?.summary ?? `Submitted PR #${task.prNumber} now has changes requested.`;
    task = await dependencies.stateStore.transitionTask(task.taskId, "changes_requested", {
      event: {
        at: checkedAt,
        type: "judge.changes_requested",
        message: `PR #${task.prNumber} now has requested changes from upstream review.`,
        artifactRefs: artifactRefs2
      },
      blockers: [{
        reason: "review_unresolved",
        summary: rationale,
        artifactPath: judgeArtifactPath,
        createdAt: checkedAt
      }],
      mutate: (current) => ({
        ...current,
        judgeStatus: "pending",
        lastCoordinatorDecision: {
          at: checkedAt,
          decision: "Judge requested changes on the submitted PR.",
          rationale,
          overrideApplied: false,
          artifactRefs: artifactRefs2
        }
      })
    });
    return {
      taskId: task.taskId,
      outcome: "discussion_started",
      summary: `PR #${task.prNumber} requires follow-up changes.`
    };
  }
  if (!isRejectedPullRequest(pullRequest)) {
    return null;
  }
  const rejectionReason = extractLatestJudgeRejectionReason(reviewSnapshot);
  await writeJsonFileAtomic(judgeArtifactPath, {
    checkedAt,
    prNumber: task.prNumber,
    prUrl: task.prUrl ?? pullRequest.url,
    outcome: "rejected",
    pullRequest,
    rejectionReason
  });
  const artifactRefs = [judgeArtifactPath];
  if (!rejectionReason) {
    const commentBody2 = "[coordinator-agent] Discussion: This PR was closed with the `rejected` label, but I could not find a concrete rejection reason in the discussion. Could you point to the specific issue that still needs adjustment?";
    try {
      await dependencies.githubProvider.commentOnPullRequest(target, task.prNumber, commentBody2);
    } catch (error) {
      const summary = stringifyErrorMessage(error, "Rejected PR had no clear reason, and the coordinator failed to ask for clarification.");
      task = await dependencies.stateStore.transitionTask(task.taskId, "human_required", {
        event: {
          at: checkedAt,
          type: "judge.discussion.human_required",
          message: summary,
          artifactRefs
        },
        mutate: (current) => ({
          ...current,
          judgeStatus: "rejected",
          lastCoordinatorDecision: {
            at: checkedAt,
            decision: "Rejected PR requires human follow-up.",
            rationale: summary,
            overrideApplied: false,
            artifactRefs
          }
        })
      });
      return {
        taskId: task.taskId,
        outcome: "human_required",
        summary
      };
    }
    task = await dependencies.stateStore.transitionTask(task.taskId, "human_required", {
      event: {
        at: checkedAt,
        type: "judge.discussion.started",
        message: "Rejected PR had no clear reason; coordinator requested clarification.",
        artifactRefs
      },
      mutate: (current) => ({
        ...current,
        judgeStatus: "rejected",
        lastCoordinatorDecision: {
          at: checkedAt,
          decision: "Rejected PR reason unclear; coordinator requested clarification.",
          rationale: "No concrete external rejection reason was found in the PR discussion.",
          overrideApplied: false,
          artifactRefs
        }
      })
    });
    return {
      taskId: task.taskId,
      outcome: "discussion_started",
      summary: `Rejected PR #${task.prNumber} lacked a clear reason; clarification requested.`
    };
  }
  if (!task.worktreePath) {
    const summary = `Rejected PR #${task.prNumber} needs review, but worktree ${task.worktreePath ?? "(missing)"} is unavailable.`;
    task = await dependencies.stateStore.transitionTask(task.taskId, "human_required", {
      event: {
        at: checkedAt,
        type: "judge.discussion.human_required",
        message: summary,
        artifactRefs
      },
      mutate: (current) => ({
        ...current,
        judgeStatus: "rejected",
        lastCoordinatorDecision: {
          at: checkedAt,
          decision: "Rejected PR requires human follow-up.",
          rationale: summary,
          overrideApplied: false,
          artifactRefs
        }
      })
    });
    return {
      taskId: task.taskId,
      outcome: "human_required",
      summary
    };
  }
  const guideFiles = await resolveTaskGuideFiles(
    dependencies.targetRepo,
    target,
    dependencies.repoRoot,
    task,
    task.worktreePath
  );
  const context = await writeTaskContext(dependencies.runtimePaths, task, {
    config: dependencies.config,
    target,
    worktreePath: task.worktreePath,
    guideFiles
  });
  const discussionPromptPath = path.join(path.dirname(context.reviewerPromptPath), "judge-discussion.md");
  await fs.mkdir(path.dirname(discussionPromptPath), { recursive: true });
  await fs.writeFile(discussionPromptPath, buildJudgeDiscussionPrompt(task, task.worktreePath, guideFiles, {
    prNumber: task.prNumber,
    prUrl: task.prUrl ?? pullRequest.url,
    reason: rejectionReason
  }) + "\n", "utf8");
  const discussionRun = await runCodexAgent(
    dependencies.runtimePaths,
    dependencies.config,
    task,
    "reviewer",
    discussionPromptPath,
    task.worktreePath,
    dependencies.executor
  );
  const discussionArtifactRefs = [
    ...artifactRefs,
    context.contextPath,
    discussionPromptPath,
    discussionRun.runArtifact.stdoutPath,
    discussionRun.runArtifact.stderrPath
  ];
  const directive = parseJudgeDiscussionDirective(discussionRun.lastMessage);
  if (discussionRun.runArtifact.status !== "completed" || directive.disposition === "unknown") {
    const summary = discussionRun.runArtifact.status !== "completed" ? `Coordinator could not complete the rejected-PR discussion check for PR #${task.prNumber}.` : "Coordinator could not classify the rejected-PR discussion result.";
    task = await dependencies.stateStore.transitionTask(task.taskId, "human_required", {
      event: {
        at: checkedAt,
        type: "judge.discussion.human_required",
        message: summary,
        artifactRefs: discussionArtifactRefs
      },
      mutate: (current) => ({
        ...current,
        judgeStatus: "rejected",
        lastCoordinatorDecision: {
          at: checkedAt,
          decision: "Rejected PR requires human follow-up.",
          rationale: summary,
          overrideApplied: false,
          artifactRefs: discussionArtifactRefs
        }
      })
    });
    return {
      taskId: task.taskId,
      outcome: "human_required",
      summary
    };
  }
  if (directive.disposition === "agree") {
    task = await dependencies.stateStore.transitionTask(task.taskId, "judge_rejected", {
      event: {
        at: checkedAt,
        type: "judge.synced",
        message: `PR #${task.prNumber} stayed rejected after coordinator review.`,
        artifactRefs: discussionArtifactRefs
      },
      mutate: (current) => ({
        ...current,
        judgeStatus: "rejected",
        lastCoordinatorDecision: {
          at: checkedAt,
          decision: "Judge rejection confirmed by coordinator review.",
          rationale: directive.body || rejectionReason.body,
          overrideApplied: false,
          artifactRefs: discussionArtifactRefs
        }
      })
    });
    return {
      taskId: task.taskId,
      outcome: "rejected",
      summary: `Rejected PR #${task.prNumber} was confirmed.`
    };
  }
  const commentBody = `[coordinator-agent] Discussion: ${directive.body}`;
  try {
    await dependencies.githubProvider.commentOnPullRequest(target, task.prNumber, commentBody);
  } catch (error) {
    const summary = stringifyErrorMessage(error, `Coordinator disagreed with the rejection on PR #${task.prNumber}, but failed to post the discussion comment.`);
    task = await dependencies.stateStore.transitionTask(task.taskId, "human_required", {
      event: {
        at: checkedAt,
        type: "judge.discussion.human_required",
        message: summary,
        artifactRefs: discussionArtifactRefs
      },
      mutate: (current) => ({
        ...current,
        judgeStatus: "rejected",
        lastCoordinatorDecision: {
          at: checkedAt,
          decision: "Rejected PR requires human follow-up.",
          rationale: summary,
          overrideApplied: false,
          artifactRefs: discussionArtifactRefs
        }
      })
    });
    return {
      taskId: task.taskId,
      outcome: "human_required",
      summary
    };
  }
  task = await dependencies.stateStore.transitionTask(task.taskId, "human_required", {
    event: {
      at: checkedAt,
      type: "judge.discussion.started",
      message: `Coordinator disagreed with the rejection on PR #${task.prNumber} and started a discussion.`,
      artifactRefs: discussionArtifactRefs
    },
    mutate: (current) => ({
      ...current,
      judgeStatus: "rejected",
      lastCoordinatorDecision: {
        at: checkedAt,
        decision: "Coordinator disagreed with the judge rejection and started a discussion.",
        rationale: directive.body,
        overrideApplied: false,
        artifactRefs: discussionArtifactRefs
      }
    })
  });
  return {
    taskId: task.taskId,
    outcome: "discussion_started",
    summary: `Started a discussion on rejected PR #${task.prNumber}.`
  };
}
function buildJudgeDiscussionPrompt(task, worktreePath, guideFiles, options) {
  return [
    `You are evaluating a judge rejection for HackOn task ${task.taskId}.`,
    `Work only inside ${worktreePath}.`,
    "Read the listed guide files before evaluating whether the rejection is justified.",
    ...guideFiles.map((item) => `Guide: ${item}`),
    "",
    `PR: #${options.prNumber} (${options.prUrl})`,
    `Task title: ${task.sourceTitle}`,
    `Candidate paths: ${task.candidatePaths.join(", ") || "(unspecified)"}`,
    "",
    "Judge rejection reason:",
    `- Source: ${options.reason.source}`,
    `- Author: ${options.reason.authorLogin ?? "unknown"}`,
    `- Created at: ${options.reason.createdAt ?? "unknown"}`,
    options.reason.body,
    "",
    "Instructions:",
    "- Review the current branch diff, the task scope, and the rejection reason.",
    '- If the rejection is justified, reply with exactly one line that starts with "[discussion-agent] Agree:" followed by a brief rationale.',
    '- If the rejection seems incorrect, incomplete, or based on a misunderstanding, reply with exactly one line that starts with "[discussion-agent] Disagree:" followed by one concise PR comment for the judge.',
    "- Keep the disagreement comment collaborative and specific.",
    "- Do not post comments yourself and do not write coordinator state."
  ].join("\n");
}
function printGreenDispatchCycle(cycle) {
  console.log(`cycle-summary	started_at=${cycle.startedAt}	completed_at=${cycle.completedAt}	duration_ms=${cycle.durationMs}	queued_before=${cycle.queueSnapshotBeforeDispatch.queuedTotal}	queued_after=${cycle.queueSnapshotAfterCycle.queuedTotal}	dispatched=${cycle.dispatchedTaskIds.length}	progressed=${cycle.progressedTaskIds.length}`);
  for (const event of cycle.events) {
    const parts = [
      `phase	${event.phase}	${event.status}`,
      event.label ? `label=${event.label}` : null,
      event.sourceKind ? `source=${event.sourceKind}` : null,
      typeof event.attempt === "number" ? `attempt=${event.attempt}` : null,
      typeof event.durationMs === "number" ? `duration_ms=${event.durationMs}` : null,
      typeof event.discoveredCandidates === "number" ? `discovered=${event.discoveredCandidates}` : null,
      typeof event.selectedCount === "number" ? `selected=${event.selectedCount}` : null,
      typeof event.skippedCount === "number" ? `skipped=${event.skippedCount}` : null,
      typeof event.qualifiedCount === "number" ? `qualified=${event.qualifiedCount}` : null,
      typeof event.queuedTotal === "number" ? `queued_total=${event.queuedTotal}` : null,
      typeof event.queuedGithub === "number" ? `queued_github=${event.queuedGithub}` : null,
      typeof event.queuedRepoSignal === "number" ? `queued_repo_signal=${event.queuedRepoSignal}` : null,
      typeof event.dispatchCount === "number" ? `dispatch_count=${event.dispatchCount}` : null,
      typeof event.successCount === "number" ? `successes=${event.successCount}` : null,
      typeof event.failureCount === "number" ? `failures=${event.failureCount}` : null,
      event.snapshotPath ? `snapshot=${event.snapshotPath}` : null,
      event.message
    ].filter((part) => Boolean(part));
    console.log(parts.join("	"));
  }
  for (const batch of cycle.discoveryBatches) {
    for (const candidate of batch.selection.selected) {
      console.log(`selected	${batch.sourceKind}	${summarizeDiscoveryCandidate(candidate)}	${buildDiscoveryQualificationHint(candidate)}`);
    }
    for (const skipped of batch.selection.skipped.slice(0, 10)) {
      console.log(`skipped	${batch.sourceKind}	${summarizeDiscoveryCandidate(skipped.candidate)}	${skipped.reasons.join(" ")}`);
    }
    console.log(`snapshot	${batch.sourceKind}	${batch.snapshotPath}`);
    for (const taskId of batch.qualifiedTaskIds) {
      console.log(`qualified	${batch.sourceKind}	${taskId}`);
    }
  }
  for (const taskId of cycle.dispatchedTaskIds) {
    console.log(`dispatching	${taskId}`);
  }
  for (const result of cycle.startResults) {
    const summary = result.result.stdout.trim() || result.result.stderr.trim() || `exit=${result.result.exitCode}`;
    console.log(`started	${result.taskId}	${summary}`);
  }
  for (const taskId of cycle.progressedTaskIds) {
    console.log(`progressing	${taskId}`);
  }
  for (const result of cycle.progressResults) {
    const summary = result.result.stdout.trim() || result.result.stderr.trim() || `exit=${result.result.exitCode}`;
    console.log(`progressed	${result.taskId}	${result.step}	${summary}`);
  }
  for (const result of cycle.judgeSyncResults) {
    console.log(`judge-sync	${result.taskId}	${result.outcome}	${result.summary}`);
  }
}
async function discoverAndQueueGreenLaneCandidates(dependencies, options) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = await discoverCandidates({
    targetId: options.targetId,
    lanes: ["docs", "tests", "simple_bugs"],
    limit: options.discoverLimit,
    excludeSourceKeys: options.excludeSourceKeys,
    includeGitHubIssues: options.sourceKind === "github_issue",
    includeRepoSignals: options.sourceKind === "repo_signal"
  }, {
    config: dependencies.config,
    runtimePaths: dependencies.runtimePaths,
    stateStore: dependencies.stateStore,
    githubProvider: dependencies.githubProvider,
    executor: dependencies.executor
  });
  const selection = selectGreenLaneDispatchCandidates(snapshot, options.selectionLimit);
  if (options.dryRun || selection.selected.length === 0) {
    const completedAt2 = (/* @__PURE__ */ new Date()).toISOString();
    const queueSnapshot2 = buildGreenQueueSnapshot(await dependencies.stateStore.listTasks());
    return {
      sourceKind: options.sourceKind,
      attempt: options.attempt,
      startedAt,
      completedAt: completedAt2,
      durationMs: Date.now() - startedAtMs,
      excludedSourceKeyCount: options.excludeSourceKeys?.length ?? 0,
      snapshotPath: snapshot.snapshotPath,
      selection,
      qualifiedTaskIds: [],
      discoveredCandidates: snapshot.candidates.length,
      queueSnapshot: queueSnapshot2
    };
  }
  const qualifiedTaskIds = [];
  for (const candidate of selection.selected) {
    const result = await qualifyTask({
      targetId: candidate.targetId,
      issueOrSignal: candidate.sourceType === "github_issue" ? `github:${candidate.sourceId}` : candidate.sourceId,
      sourceTitle: candidate.sourceTitle,
      sourceEvidence: candidate.sourceEvidence,
      candidatePaths: candidate.candidatePaths,
      expectedContributionClasses: candidate.expectedContributionClasses,
      contributionGroupId: candidate.sourceType === "github_issue" ? `issue-${candidate.sourceId}` : candidate.sourceId
    }, {
      config: dependencies.config,
      stateStore: dependencies.stateStore,
      githubProvider: dependencies.githubProvider
    });
    if (result.task.state === "qualified") {
      qualifiedTaskIds.push(result.task.taskId);
    }
  }
  const completedAt = (/* @__PURE__ */ new Date()).toISOString();
  const queueSnapshot = buildGreenQueueSnapshot(await dependencies.stateStore.listTasks());
  return {
    sourceKind: options.sourceKind,
    attempt: options.attempt,
    startedAt,
    completedAt,
    durationMs: Date.now() - startedAtMs,
    excludedSourceKeyCount: options.excludeSourceKeys?.length ?? 0,
    snapshotPath: snapshot.snapshotPath,
    selection,
    qualifiedTaskIds,
    discoveredCandidates: snapshot.candidates.length,
    queueSnapshot
  };
}
function buildGreenQueueSnapshot(tasks) {
  const queuedTasks = tasks.filter((task) => ["qualified", "workspace_prepared"].includes(task.state));
  return {
    queuedTotal: queuedTasks.length,
    queuedGithub: queuedTasks.filter((task) => task.sourceType === "github_issue").length,
    queuedRepoSignal: queuedTasks.filter((task) => task.sourceType === "repo_signal").length
  };
}
function toGreenDiscoveryEvent(batch) {
  return {
    at: batch.completedAt,
    phase: "discover",
    status: "completed",
    label: `${batch.sourceKind}-batch`,
    sourceKind: batch.sourceKind,
    attempt: batch.attempt,
    durationMs: batch.durationMs,
    discoveredCandidates: batch.discoveredCandidates,
    selectedCount: batch.selection.selected.length,
    skippedCount: batch.selection.skipped.length,
    qualifiedCount: batch.qualifiedTaskIds.length,
    excludedSourceKeyCount: batch.excludedSourceKeyCount,
    snapshotPath: batch.snapshotPath,
    message: `Discovery batch completed for ${batch.sourceKind}.`
  };
}
function toGreenQueueSnapshotEvent(batch) {
  return {
    at: batch.completedAt,
    phase: "queue",
    status: "snapshot",
    sourceKind: batch.sourceKind,
    attempt: batch.attempt,
    queuedTotal: batch.queueSnapshot.queuedTotal,
    queuedGithub: batch.queueSnapshot.queuedGithub,
    queuedRepoSignal: batch.queueSnapshot.queuedRepoSignal,
    message: `Queue snapshot after ${batch.sourceKind} discovery.`
  };
}
async function writeDriveGreenCycleArtifact(runtimePaths, options) {
  const cycleId = `cycle-${String(options.cycleNumber).padStart(4, "0")}-${options.cycle.startedAt.replace(/[:.]/g, "-").replace(/Z$/, "Z")}`;
  const artifactPath = getDriveGreenCycleArtifactPath(runtimePaths, cycleId);
  const artifact = {
    cycleId,
    cycleNumber: options.cycleNumber,
    activeGreenTasks: options.activeGreenTasks,
    targetActive: options.targetActive,
    dispatchCapacity: options.dispatchCapacity,
    ...options.cycle
  };
  await writeJsonFileAtomic(artifactPath, artifact);
  await writeJsonFileAtomic(runtimePaths.driveGreenLatestFilePath, {
    ...artifact,
    artifactPath
  });
}
export {
  run,
  runGreenDispatchCycle,
  syncSubmittedJudgeTasks
};
//# sourceMappingURL=hackonctl.js.map
