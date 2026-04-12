import { deriveState } from "../state/derive.js";
import { fetchPRState } from "../github/state-reader.js";
import { worktreeExists } from "../worktree/lifecycle.js";
async function getTaskStatuses(registry, config, github, basePath) {
  const tasks = registry.getAllTasks();
  const statuses = [];
  for (const task of tasks) {
    let pr = null;
    let reviews = [];
    if (task.prNumber !== null) {
      try {
        const prState = await fetchPRState(
          github,
          config.github.upstreamOwner,
          config.github.upstreamRepo,
          task.prNumber
        );
        pr = prState.pr;
        reviews = prState.reviews;
      } catch {
      }
    }
    const branchPresent = worktreeExists(basePath, config, task.taskId);
    const derivedState = deriveState({ task, pr, reviews, branchExists: branchPresent });
    statuses.push({
      task,
      derivedState,
      prUrl: task.prNumber ? `https://github.com/${config.github.upstreamOwner}/${config.github.upstreamRepo}/pull/${task.prNumber}` : null
    });
  }
  return statuses;
}
function formatStatusTable(statuses) {
  if (statuses.length === 0) return "No tasks registered.\n";
  const header = `${"Task".padEnd(10)} ${"State".padEnd(18)} ${"Lane".padEnd(14)} ${"Source".padEnd(15)} ${"PR".padEnd(8)} Title`;
  const separator = "-".repeat(100);
  const rows = statuses.map((s) => {
    const prCol = s.task.prNumber ? `#${s.task.prNumber}` : "-";
    const sourceCol = s.task.source.type === "github_issue" ? `issue #${s.task.source.id}` : s.task.source.type.slice(0, 14);
    const title = s.task.source.title.slice(0, 50);
    return `${s.task.taskId.padEnd(10)} ${s.derivedState.padEnd(18)} ${s.task.lane.padEnd(14)} ${sourceCol.padEnd(15)} ${prCol.padEnd(8)} ${title}`;
  });
  return [header, separator, ...rows, ""].join("\n");
}
function formatTaskDetail(status) {
  const { task, derivedState, prUrl } = status;
  return `
Task:     ${task.taskId}
State:    ${derivedState}
Lane:     ${task.lane}
Risk:     ${task.riskZone}
Source:   ${task.source.type} \u2014 ${task.source.id}
Title:    ${task.source.title}
Branch:   ${task.branchName}
PR:       ${prUrl ?? "(none)"}
Classes:  ${task.expectedClasses.join(", ")}
Dup Risk: ${task.duplicateRisk}
Created:  ${task.createdAt}
${task.notes.length > 0 ? `Notes:
${task.notes.map((n) => `  - ${n}`).join("\n")}` : ""}
`.trim();
}
export {
  formatStatusTable,
  formatTaskDetail,
  getTaskStatuses
};
//# sourceMappingURL=status.js.map
