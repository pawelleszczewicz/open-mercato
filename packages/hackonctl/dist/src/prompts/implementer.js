const LANE_INSTRUCTIONS = {
  docs: `Focus on documentation quality:
- Fix grammar, formatting, and broken links
- Ensure sidebar entries match existing pages
- Keep language clear and concise
- Do not change code behavior`,
  tests: `Focus on test quality:
- Write meaningful test cases with clear assertions
- Follow existing test patterns in the codebase
- Use describe/it blocks with descriptive names
- Import from the module under test, not from dist/
- Ensure tests are deterministic and independent`,
  simple_bugs: `Focus on a minimal, correct fix:
- Identify the root cause before changing code
- Change only what's necessary to fix the bug
- Add a test that reproduces the bug and verifies the fix
- Do not refactor surrounding code`,
  experimental: `This is a complex task requiring careful analysis:
- Study the related code thoroughly before making changes
- Consider backward compatibility implications
- Document your reasoning in comments only where logic is non-obvious
- Add comprehensive test coverage
- Flag any areas of uncertainty`
};
function generateImplementerPrompt(task, worktreePath) {
  return `# Task: ${task.source.title}

## Source
- Type: ${task.source.type}
- ID: ${task.source.id}
- Lane: ${task.lane}
- Risk: ${task.riskZone}

## Working Directory
${worktreePath}

## Instructions
${LANE_INSTRUCTIONS[task.lane]}

## Expected Contribution Classes
${task.expectedClasses.join(", ")}

## Rules
- Work only in the provided worktree directory
- Do not modify files outside the scope of this task
- Run targeted tests after making changes
- Report any blockers immediately

## Context
Read the repository AGENTS.md and relevant module AGENTS.md files for coding conventions.
Check .ai/specs/ for any existing specs related to this module.
`;
}
export {
  generateImplementerPrompt
};
//# sourceMappingURL=implementer.js.map
