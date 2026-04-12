function formatTaskId(num) {
  return `HCK-${String(num).padStart(4, "0")}`;
}
function parseTaskId(id) {
  const match = id.match(/^HCK-(\d{4,})$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}
export {
  formatTaskId,
  parseTaskId
};
//# sourceMappingURL=id.js.map
