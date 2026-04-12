function formatComment(config, role, body) {
  const prefix = config.github.commentPrefixes[role];
  return `${prefix} ${body}`;
}
function parseCommentRole(config, comment) {
  for (const [role, prefix] of Object.entries(config.github.commentPrefixes)) {
    if (comment.startsWith(prefix)) {
      return role;
    }
  }
  return null;
}
export {
  formatComment,
  parseCommentRole
};
//# sourceMappingURL=comments.js.map
