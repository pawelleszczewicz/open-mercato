import { formatTaskId } from "../registry/id.js";
const LANE_PREFIX = {
  docs: "docs",
  tests: "test",
  simple_bugs: "fix",
  experimental: "feat"
};
function generateBranchName(lane, taskNumber, title) {
  const prefix = LANE_PREFIX[lane];
  const taskId = formatTaskId(taskNumber).toLowerCase();
  const slug = slugify(title, 60);
  return `${prefix}/hackon/${taskId}-${slug}`;
}
function slugify(text, maxLength) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, maxLength).replace(/-+$/, "");
}
export {
  generateBranchName
};
//# sourceMappingURL=branch.js.map
