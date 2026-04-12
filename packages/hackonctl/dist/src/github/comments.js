function formatComment(role, body, config) {
  const prefix = config.github.commentPrefixes[role];
  return `${prefix} ${body}`;
}
function parseCommentRole(comment, config) {
  const prefixes = config.github.commentPrefixes;
  if (comment.startsWith(prefixes.coordinator)) return "coordinator";
  if (comment.startsWith(prefixes.implementer)) return "implementer";
  if (comment.startsWith(prefixes.reviewer)) return "reviewer";
  return null;
}
export {
  formatComment,
  parseCommentRole
};
//# sourceMappingURL=comments.js.map
