function formatTaskId(num) {
  return `HCK-${String(num).padStart(4, "0")}`;
}
function parseTaskId(taskId) {
  const match = taskId.match(/^HCK-(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}
export {
  formatTaskId,
  parseTaskId
};
//# sourceMappingURL=id.js.map
