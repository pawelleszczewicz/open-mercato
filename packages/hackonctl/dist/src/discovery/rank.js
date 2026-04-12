function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (b.expectedPoints !== a.expectedPoints) {
      return b.expectedPoints - a.expectedPoints;
    }
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    if (confidenceOrder[b.confidence] !== confidenceOrder[a.confidence]) {
      return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    }
    const riskOrder = { green: 3, yellow: 2, red: 1 };
    return riskOrder[b.suggestedRisk] - riskOrder[a.suggestedRisk];
  });
}
export {
  rankCandidates
};
//# sourceMappingURL=rank.js.map
