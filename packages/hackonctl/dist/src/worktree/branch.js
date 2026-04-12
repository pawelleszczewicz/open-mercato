const LANE_PREFIX = {
  docs: "docs",
  tests: "test",
  simple_bugs: "fix",
  experimental: "feat"
};
function generateBranchName(lane, taskId, slug) {
  const prefix = LANE_PREFIX[lane];
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${prefix}/hackon/${taskId.toLowerCase()}-${cleanSlug}`;
}
function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}
export {
  generateBranchName,
  slugify
};
//# sourceMappingURL=branch.js.map
