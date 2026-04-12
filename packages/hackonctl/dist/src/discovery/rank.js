function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (b.expectedPoints !== a.expectedPoints) return b.expectedPoints - a.expectedPoints;
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    if (confDiff !== 0) return confDiff;
    const riskOrder = { green: 0, yellow: 1, red: 2 };
    const riskDiff = riskOrder[a.suggestedRiskZone] - riskOrder[b.suggestedRiskZone];
    if (riskDiff !== 0) return riskDiff;
    return a.title.localeCompare(b.title);
  });
}
function deduplicateCandidates(candidates) {
  const seen = /* @__PURE__ */ new Set();
  return candidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}
export {
  deduplicateCandidates,
  rankCandidates
};
//# sourceMappingURL=rank.js.map
