const COMMANDS = {
  init: {
    description: "Create hackonctl.config.json interactively",
    usage: "hackonctl init"
  },
  discover: {
    description: "Run discovery sources, print ranked candidates",
    usage: "hackonctl discover [--source=issues|signals|gaps]"
  },
  queue: {
    description: "Show current candidate queue",
    usage: "hackonctl queue"
  },
  qualify: {
    description: "Qualify a candidate and create a task record",
    usage: "hackonctl qualify <candidateId>"
  },
  status: {
    description: "Dashboard: all tasks with derived GitHub state",
    usage: "hackonctl status [taskId]"
  },
  start: {
    description: "Create worktree and branch for a task",
    usage: "hackonctl start <taskId>"
  },
  gate: {
    description: "Run gate checks in worktree",
    usage: "hackonctl gate <taskId>"
  },
  pr: {
    description: "Create or sync draft PR",
    usage: "hackonctl pr <taskId>"
  },
  review: {
    description: "Print context for reviewer agent",
    usage: "hackonctl review <taskId>"
  },
  ready: {
    description: "Remove draft flag (= submitted to HackOn)",
    usage: "hackonctl ready <taskId>"
  },
  close: {
    description: "Abandon task, cleanup worktree",
    usage: "hackonctl close <taskId>"
  },
  doctor: {
    description: "System diagnostics",
    usage: "hackonctl doctor"
  }
};
function printHelp() {
  console.log("\nhackonctl \u2014 HackOn Bounty Hunting Coordinator\n");
  console.log("Commands:");
  for (const [name, info] of Object.entries(COMMANDS)) {
    console.log(`  ${info.usage.padEnd(50)} ${info.description}`);
  }
  console.log("");
}
export {
  COMMANDS,
  printHelp
};
//# sourceMappingURL=commands.js.map
