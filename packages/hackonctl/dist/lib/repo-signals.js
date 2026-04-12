import fs from "node:fs/promises";
import path from "node:path";
import { normalizePath, slugify } from "./strings.js";
const docsFilePattern = /\.mdx?$/i;
const skippedTestPattern = /\b(?:it|test|describe)\.skip\s*\(\s*(['"`])([^'"`]+?)\1/;
const todoTestPattern = /\b(?:it|test)\.todo\s*\(\s*(['"`])([^'"`]+?)\1/;
const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
const htmlHrefPattern = /\bhref=["']([^"']+)["']/g;
const npmRunPattern = /\bnpm\s+run\s+([a-zA-Z0-9:_-]+)/g;
const yarnPattern = /\byarn\s+(?:run\s+)?([a-zA-Z0-9:_-]+)/g;
const pnpmPattern = /\bpnpm\s+(?:run\s+)?([a-zA-Z0-9:_-]+)/g;
const runtimeExportPattern = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|let|var)\b/;
const commonExcludedDirectoryNames = /* @__PURE__ */ new Set([
  ".git",
  ".next",
  ".state",
  ".workspace",
  "agentic",
  "coverage",
  "dist",
  "node_modules"
]);
const excludedTestDirectoryNames = /* @__PURE__ */ new Set([
  ...commonExcludedDirectoryNames,
  "template"
]);
const docsTopLevelDirectories = /* @__PURE__ */ new Set([
  "api",
  "appendix",
  "architecture",
  "cli",
  "customization",
  "enterprise",
  "framework",
  "installation",
  "introduction",
  "tutorials",
  "user-guide"
]);
const ignoredYarnCommands = /* @__PURE__ */ new Set([
  "add",
  "bin",
  "cache",
  "config",
  "create",
  "dedupe",
  "dlx",
  "exec",
  "explain",
  "help",
  "import",
  "info",
  "init",
  "install",
  "link",
  "node",
  "npm",
  "pack",
  "patch",
  "plugin",
  "rebuild",
  "remove",
  "run",
  "set",
  "unplug",
  "unlink",
  "up",
  "upgrade",
  "version",
  "why",
  "workspace",
  "workspaces"
]);
const ignoredPnpmCommands = /* @__PURE__ */ new Set([
  "add",
  "create",
  "dlx",
  "env",
  "exec",
  "fetch",
  "help",
  "import",
  "init",
  "install",
  "link",
  "list",
  "pack",
  "patch",
  "publish",
  "remove",
  "root",
  "setup",
  "store",
  "up",
  "update",
  "unlink",
  "why",
  "workspace"
]);
const lowLevelUntestedSignalLimit = 24;
const uncoveredIntegrationScenarioSignalLimit = 24;
async function discoverRepoSignals(repoRoot, options = {}) {
  const docsInventory = await loadDocsInventory(repoRoot);
  const [sidebarSignals, orphanDocSignals, brokenDocsLinkSignals, staleCommandSignals, skippedTestSignals, todoTestSignals, lowLevelUntestedSignals, uncoveredIntegrationScenarioSignals] = await Promise.all([
    docsInventory ? discoverMissingSidebarSignals(docsInventory) : Promise.resolve([]),
    docsInventory ? discoverOrphanDocSignals(docsInventory) : Promise.resolve([]),
    docsInventory ? discoverBrokenDocsLinkSignals(docsInventory) : Promise.resolve([]),
    docsInventory ? discoverStaleDocsCommandSignals(repoRoot, docsInventory) : Promise.resolve([]),
    discoverSkippedTestSignals(repoRoot),
    discoverTodoTestSignals(repoRoot),
    discoverUntestedLowLevelModuleSignals(repoRoot),
    discoverUncoveredIntegrationScenarioSignals(repoRoot, options)
  ]);
  return dedupeSignals([
    ...sidebarSignals,
    ...orphanDocSignals,
    ...brokenDocsLinkSignals,
    ...staleCommandSignals,
    ...skippedTestSignals,
    ...todoTestSignals,
    ...lowLevelUntestedSignals,
    ...uncoveredIntegrationScenarioSignals
  ]).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}
async function discoverMissingSidebarSignals(inventory) {
  const signals = [];
  for (const entry of inventory.docEntries) {
    if (!entry.docId.startsWith("user-guide/")) {
      continue;
    }
    if (inventory.sidebarsReferencedDocIds.has(entry.docId)) {
      continue;
    }
    const sourceId = `DOCSIG-sidebar-${slugify(entry.docId)}`;
    signals.push({
      sourceId,
      sourceTitle: `docs: add missing sidebar entry for ${entry.docId}`,
      sourceEvidence: [
        `${entry.relativePath} exists as a documentation page.`,
        `${inventory.sidebarsPath} does not reference "${entry.docId}".`
      ],
      sourceUrl: `repo-signal://${sourceId}`,
      candidatePaths: [inventory.sidebarsPath, entry.relativePath],
      expectedContributionClasses: ["docs"],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return signals;
}
async function discoverOrphanDocSignals(inventory) {
  const signals = [];
  for (const entry of inventory.docEntries) {
    if (entry.docId.startsWith("user-guide/")) {
      continue;
    }
    if (inventory.sidebarsReferencedDocIds.has(entry.docId)) {
      continue;
    }
    if ((inventory.inboundDocRefs.get(entry.docId)?.size ?? 0) > 0) {
      continue;
    }
    const sourceId = `DOCSIG-orphan-${slugify(entry.docId)}`;
    signals.push({
      sourceId,
      sourceTitle: `docs: surface orphan doc page ${entry.docId}`,
      sourceEvidence: [
        `${entry.relativePath} exists as a documentation page.`,
        `${inventory.sidebarsPath} does not reference "${entry.docId}".`,
        `No other docs pages link to "${entry.docId}".`
      ],
      sourceUrl: `repo-signal://${sourceId}`,
      candidatePaths: [inventory.sidebarsPath, entry.relativePath],
      expectedContributionClasses: ["docs"],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return signals;
}
async function discoverBrokenDocsLinkSignals(inventory) {
  const signals = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of inventory.docEntries) {
    const lines = entry.content.split("\n");
    for (const [lineIndex, line] of lines.entries()) {
      const targets = extractLinkTargets(line);
      for (const target of targets) {
        const resolution = resolveDocsTarget(entry, target, inventory);
        if (resolution.kind !== "broken") {
          continue;
        }
        const dedupeKey = `${entry.relativePath}:${resolution.normalizedTarget}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        const sourceId = `DOCSIG-broken-link-${slugify(`${entry.docId}-${resolution.normalizedTarget}`)}`;
        signals.push({
          sourceId,
          sourceTitle: `docs: fix broken link "${resolution.normalizedTarget}" in ${entry.docId}`,
          sourceEvidence: [
            `Broken docs link found in ${entry.relativePath}:${lineIndex + 1}.`,
            `Link target "${resolution.normalizedTarget}" does not resolve to an existing docs page.`,
            `Declaration: ${line.trim().slice(0, 240)}`
          ],
          sourceUrl: `repo-signal://${sourceId}`,
          candidatePaths: [entry.relativePath],
          expectedContributionClasses: ["docs"],
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
  }
  return signals;
}
async function discoverStaleDocsCommandSignals(repoRoot, inventory) {
  const rootScripts = await readRootScripts(repoRoot);
  const signals = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of inventory.docEntries) {
    const lines = entry.content.split("\n");
    for (const [lineIndex, line] of lines.entries()) {
      for (const command of extractCommandReferences(line)) {
        if (rootScripts.has(command.scriptName)) {
          continue;
        }
        const dedupeKey = `${entry.relativePath}:${command.scriptName}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        const sourceId = `DOCSIG-stale-command-${slugify(`${entry.docId}-${command.scriptName}`)}`;
        signals.push({
          sourceId,
          sourceTitle: `docs: replace stale command "${command.scriptName}" in ${entry.docId}`,
          sourceEvidence: [
            `Command "${command.rawCommand}" in ${entry.relativePath}:${lineIndex + 1} references a missing root script.`,
            `package.json does not define the script "${command.scriptName}".`,
            `Declaration: ${line.trim().slice(0, 240)}`
          ],
          sourceUrl: `repo-signal://${sourceId}`,
          candidatePaths: ["package.json", entry.relativePath],
          expectedContributionClasses: ["docs"],
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
  }
  return signals;
}
async function discoverSkippedTestSignals(repoRoot) {
  return discoverExplicitTestDebtSignals(repoRoot, {
    pattern: skippedTestPattern,
    sourcePrefix: "TESTSIG-skipped",
    titlePrefix: "tests: re-enable skipped test",
    evidencePrefix: "Skipped test found"
  });
}
async function discoverTodoTestSignals(repoRoot) {
  return discoverExplicitTestDebtSignals(repoRoot, {
    pattern: todoTestPattern,
    sourcePrefix: "TESTSIG-todo",
    titlePrefix: "tests: add missing coverage for",
    evidencePrefix: "Pending todo test found"
  });
}
async function discoverExplicitTestDebtSignals(repoRoot, options) {
  const searchRoots = [
    path.join(repoRoot, "packages"),
    path.join(repoRoot, "apps")
  ];
  const signals = [];
  for (const searchRoot of searchRoots) {
    if (!await fileExists(searchRoot)) {
      continue;
    }
    const testFiles = await listFilesRecursive(searchRoot, (entryPath) => /(?:^|\/)(?:__tests__\/.+|[^/]+\.(?:test|spec)\.[jt]sx?)$/i.test(entryPath), {
      excludeDirectoryNames: excludedTestDirectoryNames
    });
    for (const absolutePath of testFiles) {
      const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
      const fileContent = await fs.readFile(absolutePath, "utf8");
      const lines = fileContent.split("\n");
      for (const [lineIndex, line] of lines.entries()) {
        const match = line.match(options.pattern);
        if (!match) {
          continue;
        }
        const testTitle = (match[2] ?? "").trim();
        if (!testTitle) {
          continue;
        }
        const sourceId = `${options.sourcePrefix}-${slugify(`${relativePath}-${testTitle}`)}`;
        signals.push({
          sourceId,
          sourceTitle: `${options.titlePrefix} "${testTitle}"`,
          sourceEvidence: [
            `${options.evidencePrefix} in ${relativePath}:${lineIndex + 1}.`,
            `Declaration: ${line.trim()}`
          ],
          sourceUrl: `repo-signal://${sourceId}`,
          candidatePaths: [relativePath],
          expectedContributionClasses: ["tests"],
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
  }
  return signals;
}
async function discoverUntestedLowLevelModuleSignals(repoRoot) {
  const packagesRoot = path.join(repoRoot, "packages");
  if (!await fileExists(packagesRoot)) {
    return [];
  }
  const [sourceFiles, testFiles] = await Promise.all([
    listFilesRecursive(packagesRoot, isLowLevelSourceFile, {
      excludeDirectoryNames: commonExcludedDirectoryNames
    }),
    listFilesRecursive(packagesRoot, (entryPath) => /(?:^|\/)(?:__tests__\/.+|[^/]+\.(?:test|spec)\.[jt]sx?)$/i.test(entryPath), {
      excludeDirectoryNames: excludedTestDirectoryNames
    })
  ]);
  const testFileSet = new Set(testFiles.map((absolutePath) => normalizePath(path.relative(repoRoot, absolutePath))));
  const signals = [];
  for (const absolutePath of sourceFiles.sort()) {
    const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
    const content = await fs.readFile(absolutePath, "utf8");
    if (!looksLikeRuntimeLowLevelModule(content)) {
      continue;
    }
    if (countMeaningfulLines(content) < 5) {
      continue;
    }
    const nearbyTestCandidates = buildNearbyTestCandidates(relativePath);
    if (nearbyTestCandidates.some((candidatePath) => testFileSet.has(candidatePath))) {
      continue;
    }
    const sourceId = `TESTSIG-lowlevel-untested-${slugify(relativePath)}`;
    signals.push({
      sourceId,
      sourceTitle: `tests: add low-level coverage for ${path.posix.basename(relativePath)}`,
      sourceEvidence: [
        `${relativePath} exports runtime logic in a low-level package path.`,
        `No nearby test file was found for ${relativePath}.`,
        `Checked: ${nearbyTestCandidates.slice(0, 4).join(", ")}${nearbyTestCandidates.length > 4 ? " ..." : ""}`
      ],
      sourceUrl: `repo-signal://${sourceId}`,
      candidatePaths: [relativePath],
      expectedContributionClasses: ["tests"],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (signals.length >= lowLevelUntestedSignalLimit) {
      break;
    }
  }
  return signals;
}
async function discoverUncoveredIntegrationScenarioSignals(repoRoot, options) {
  const report = options.integrationSpecCoverageReport ?? await loadIntegrationSpecCoverageReport(repoRoot, options);
  if (!report || report.uncoveredScenarioIds.length === 0) {
    return [];
  }
  const scenarioRoot = path.join(repoRoot, ".ai", "qa", "scenarios");
  const scenarioFiles = await fileExists(scenarioRoot) ? await listFilesRecursive(scenarioRoot, (entryPath) => entryPath.endsWith(".md")) : [];
  const scenarioFileByCaseId = /* @__PURE__ */ new Map();
  const scenarioEntries = await Promise.all(scenarioFiles.map(async (absolutePath) => ({
    absolutePath,
    content: await fs.readFile(absolutePath, "utf8")
  })));
  for (const { absolutePath, content } of scenarioEntries) {
    const caseId = extractTestCaseId(path.basename(absolutePath), content);
    if (!caseId || scenarioFileByCaseId.has(caseId)) {
      continue;
    }
    scenarioFileByCaseId.set(caseId, normalizePath(path.relative(repoRoot, absolutePath)));
  }
  const signals = [];
  for (const uncoveredScenarioId of [...new Set(report.uncoveredScenarioIds)].sort().slice(0, uncoveredIntegrationScenarioSignalLimit)) {
    const scenarioPath = scenarioFileByCaseId.get(uncoveredScenarioId) ?? normalizePath(path.join(".ai", "qa", "scenarios", `${uncoveredScenarioId}.md`));
    const sourceId = `TESTSIG-integration-scenario-${slugify(uncoveredScenarioId)}`;
    signals.push({
      sourceId,
      sourceTitle: `tests: implement missing integration scenario ${uncoveredScenarioId}`,
      sourceEvidence: [
        `Integration spec coverage reports ${uncoveredScenarioId} as uncovered.`,
        `Scenario file: ${scenarioPath}.`,
        "Create a module-local Playwright integration spec that implements this scenario."
      ],
      sourceUrl: `repo-signal://${sourceId}`,
      candidatePaths: [scenarioPath],
      expectedContributionClasses: ["tests"],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return signals;
}
async function loadIntegrationSpecCoverageReport(repoRoot, options) {
  if (!options.coordinatorRepoRoot || !options.executor) {
    return null;
  }
  const cliPath = path.join(options.coordinatorRepoRoot, "packages", "cli", "dist", "bin.js");
  if (!await fileExists(cliPath)) {
    return null;
  }
  const result = await options.executor.run(process.execPath, [cliPath, "test", "spec-coverage", "--json"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OM_CLI_QUIET: "1"
    },
    timeoutMs: 6e4
  });
  if (result.exitCode !== 0) {
    return null;
  }
  return parseIntegrationSpecCoverageReport(`${result.stdout}
${result.stderr}`);
}
function parseIntegrationSpecCoverageReport(output) {
  const firstBrace = output.indexOf("{");
  const lastBrace = output.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(output.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const report = parsed;
  const uncoveredScenarioIds = Array.isArray(report.uncoveredScenarioIds) ? report.uncoveredScenarioIds.filter((value) => typeof value === "string" && value.length > 0) : [];
  return {
    uncoveredScenarioIds
  };
}
async function loadDocsInventory(repoRoot) {
  const docsContentRoot = path.join(repoRoot, "apps/docs/docs");
  const sidebarsPath = path.join(repoRoot, "apps/docs/sidebars.ts");
  if (!await fileExists(docsContentRoot) || !await fileExists(sidebarsPath)) {
    return null;
  }
  const sidebarsContent = await fs.readFile(sidebarsPath, "utf8");
  const docFiles = await listFilesRecursive(docsContentRoot, (entryPath) => docsFilePattern.test(entryPath), {
    excludeDirectoryNames: commonExcludedDirectoryNames
  });
  const docEntries = await Promise.all(docFiles.sort().map(async (absolutePath) => {
    const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
    const docId = normalizePath(path.relative(docsContentRoot, absolutePath)).replace(/\.mdx?$/i, "");
    return {
      absolutePath,
      relativePath,
      docId,
      content: await fs.readFile(absolutePath, "utf8")
    };
  }));
  const docIdSet = new Set(docEntries.map((entry) => entry.docId));
  const docRelativePathById = new Map(docEntries.map((entry) => [entry.docId, entry.relativePath]));
  const sidebarsReferencedDocIds = new Set(docEntries.map((entry) => entry.docId).filter((docId) => referencesDocIdInSidebar(sidebarsContent, docId)));
  const inboundDocRefs = new Map(docEntries.map((entry) => [entry.docId, /* @__PURE__ */ new Set()]));
  const topLevelDocSegments = new Set(docEntries.map((entry) => entry.docId.split("/")[0]).filter((segment) => Boolean(segment)));
  const inventory = {
    repoRoot,
    docsContentRoot,
    sidebarsContent,
    sidebarsPath: normalizePath(path.relative(repoRoot, sidebarsPath)),
    docEntries,
    docIdSet,
    docRelativePathById,
    sidebarsReferencedDocIds,
    inboundDocRefs,
    topLevelDocSegments
  };
  for (const entry of docEntries) {
    for (const target of extractLinkTargets(entry.content)) {
      const resolution = resolveDocsTarget(entry, target, inventory);
      if (resolution.kind === "doc" && resolution.docId !== entry.docId) {
        inventory.inboundDocRefs.get(resolution.docId)?.add(entry.docId);
      }
    }
  }
  return inventory;
}
function referencesDocIdInSidebar(sidebarsContent, docId) {
  const normalizedDocId = normalizePath(docId).replace(/\/index$/i, "");
  const candidates = /* @__PURE__ */ new Set([
    docId,
    normalizedDocId,
    `/${docId}`,
    `/${normalizedDocId}`,
    `/docs/${docId}`,
    `/docs/${normalizedDocId}`
  ]);
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (sidebarsContent.includes(`"${candidate}"`) || sidebarsContent.includes(`'${candidate}'`)) {
      return true;
    }
  }
  return false;
}
function extractLinkTargets(content) {
  const targets = /* @__PURE__ */ new Set();
  for (const pattern of [markdownLinkPattern, htmlHrefPattern]) {
    for (const match of content.matchAll(pattern)) {
      const rawTarget = (match[1] ?? "").trim();
      if (rawTarget) {
        targets.add(rawTarget);
      }
    }
  }
  return [...targets];
}
function resolveDocsTarget(entry, rawTarget, inventory) {
  const normalizedTarget = normalizeDocsTarget(rawTarget);
  if (!normalizedTarget || isExternalTarget(normalizedTarget) || normalizedTarget.startsWith("#")) {
    return { kind: "ignored" };
  }
  if (normalizedTarget.startsWith("/")) {
    return resolveRouteDocsTarget(normalizedTarget, inventory);
  }
  return resolveRelativeDocsTarget(entry, normalizedTarget, inventory);
}
function normalizeDocsTarget(rawTarget) {
  const trimmed = rawTarget.trim().replace(/^<|>$/g, "");
  if (!trimmed) {
    return "";
  }
  return trimmed.split(/\s+/)[0] ?? "";
}
function isExternalTarget(target) {
  return /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(target) || target.startsWith("//");
}
function resolveRouteDocsTarget(target, inventory) {
  const withoutQuery = stripQueryAndFragment(target);
  const normalizedRoute = normalizePath(withoutQuery).replace(/^docs\//, "");
  if (!normalizedRoute) {
    return { kind: "ignored" };
  }
  const docId = resolveDocIdFromRoute(normalizedRoute, inventory);
  if (docId) {
    return { kind: "doc", docId };
  }
  const firstSegment = normalizedRoute.split("/")[0] ?? "";
  if (inventory.topLevelDocSegments.has(firstSegment) || docsTopLevelDirectories.has(firstSegment)) {
    return { kind: "broken", normalizedTarget: `/${normalizedRoute}` };
  }
  return { kind: "ignored" };
}
function resolveRelativeDocsTarget(entry, target, inventory) {
  const withoutQuery = stripQueryAndFragment(target);
  const extension = path.posix.extname(withoutQuery);
  const docsLikeTarget = !extension || docsFilePattern.test(withoutQuery);
  if (!docsLikeTarget) {
    return { kind: "ignored" };
  }
  const resolvedAbsolutePath = path.resolve(path.dirname(entry.absolutePath), withoutQuery);
  const docId = resolveDocIdFromFilePath(resolvedAbsolutePath, inventory);
  if (docId) {
    return { kind: "doc", docId };
  }
  return { kind: "broken", normalizedTarget: normalizePath(withoutQuery) };
}
function resolveDocIdFromRoute(routePath, inventory) {
  const normalizedRoute = normalizePath(routePath).replace(/\.mdx?$/i, "").replace(/^\/+/, "").replace(/\/+$/, "");
  const candidateIds = /* @__PURE__ */ new Set([
    normalizedRoute,
    `${normalizedRoute}/index`,
    normalizedRoute.replace(/\/index$/i, "")
  ]);
  for (const candidateId of candidateIds) {
    if (!candidateId) {
      continue;
    }
    if (inventory.docIdSet.has(candidateId)) {
      return candidateId;
    }
  }
  return null;
}
function resolveDocIdFromFilePath(resolvedAbsolutePath, inventory) {
  const candidatePaths = buildDocFileCandidates(resolvedAbsolutePath);
  for (const candidatePath of candidatePaths) {
    const relativeToDocsRoot = normalizePath(path.relative(inventory.docsContentRoot, candidatePath));
    if (relativeToDocsRoot.startsWith("..")) {
      continue;
    }
    const docId = relativeToDocsRoot.replace(/\.mdx?$/i, "");
    if (inventory.docIdSet.has(docId)) {
      return docId;
    }
  }
  return null;
}
function buildDocFileCandidates(resolvedAbsolutePath) {
  const normalizedResolvedPath = resolvedAbsolutePath.replace(/\\/g, "/");
  const extension = path.posix.extname(normalizedResolvedPath);
  if (docsFilePattern.test(extension)) {
    return [normalizedResolvedPath];
  }
  return [
    `${normalizedResolvedPath}.mdx`,
    `${normalizedResolvedPath}.md`,
    path.posix.join(normalizedResolvedPath, "index.mdx"),
    path.posix.join(normalizedResolvedPath, "index.md")
  ];
}
function stripQueryAndFragment(target) {
  return target.split("#")[0]?.split("?")[0] ?? target;
}
async function readRootScripts(repoRoot) {
  const packageJsonPath = path.join(repoRoot, "package.json");
  if (!await fileExists(packageJsonPath)) {
    return /* @__PURE__ */ new Set();
  }
  const parsed = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  return new Set(Object.keys(parsed.scripts ?? {}));
}
function extractCommandReferences(line) {
  const commands = [];
  for (const match of line.matchAll(npmRunPattern)) {
    const scriptName = (match[1] ?? "").trim();
    if (!scriptName) {
      continue;
    }
    commands.push({
      rawCommand: `npm run ${scriptName}`,
      scriptName
    });
  }
  for (const match of line.matchAll(yarnPattern)) {
    const scriptName = (match[1] ?? "").trim();
    if (!scriptName || scriptName.startsWith("-") || ignoredYarnCommands.has(scriptName)) {
      continue;
    }
    commands.push({
      rawCommand: `yarn ${scriptName}`,
      scriptName
    });
  }
  for (const match of line.matchAll(pnpmPattern)) {
    const scriptName = (match[1] ?? "").trim();
    if (!scriptName || scriptName.startsWith("-") || ignoredPnpmCommands.has(scriptName)) {
      continue;
    }
    commands.push({
      rawCommand: `pnpm ${scriptName}`,
      scriptName
    });
  }
  return commands;
}
function isLowLevelSourceFile(entryPath) {
  const normalizedEntryPath = normalizePath(entryPath);
  return normalizedEntryPath.endsWith(".ts") && !normalizedEntryPath.endsWith(".d.ts") && /\/src\/(?:lib|utils)\//.test(normalizedEntryPath) && !/(?:^|\/)(?:__tests__|__fixtures__)\//.test(normalizedEntryPath) && !/\/testing\//.test(normalizedEntryPath) && !/\.(?:test|spec)\.ts$/i.test(normalizedEntryPath) && !/\/index\.ts$/i.test(normalizedEntryPath) && !/\/types\.ts$/i.test(normalizedEntryPath);
}
function looksLikeRuntimeLowLevelModule(content) {
  return runtimeExportPattern.test(content);
}
function countMeaningfulLines(content) {
  return content.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).filter((line) => !line.startsWith("import ")).filter((line) => !line.startsWith("export type ")).filter((line) => !line.startsWith("export interface ")).length;
}
function buildNearbyTestCandidates(relativeSourcePath) {
  const normalizedSourcePath = normalizePath(relativeSourcePath);
  const withoutExtension = normalizedSourcePath.replace(/\.[^.]+$/i, "");
  const basename = path.posix.basename(withoutExtension);
  const directory = path.posix.dirname(normalizedSourcePath);
  const suffixes = [".test.ts", ".spec.ts", ".test.tsx", ".spec.tsx"];
  const candidates = /* @__PURE__ */ new Set();
  for (const suffix of suffixes) {
    candidates.add(`${withoutExtension}${suffix}`);
    candidates.add(path.posix.join(directory, "__tests__", `${basename}${suffix}`));
  }
  const segments = directory.split("/");
  const srcIndex = segments.lastIndexOf("src");
  if (srcIndex !== -1) {
    for (let index = segments.length; index > srcIndex; index -= 1) {
      const ancestorDirectory = segments.slice(0, index).join("/");
      for (const suffix of suffixes) {
        candidates.add(path.posix.join(ancestorDirectory, "__tests__", `${basename}${suffix}`));
      }
    }
  }
  return [...candidates].map(normalizePath);
}
function extractTestCaseId(fileName, content) {
  const contentCaseId = extractTestCaseIdFromContent(content);
  if (contentCaseId) {
    return contentCaseId;
  }
  const fileStem = fileName.replace(/\.[^.]+$/i, "");
  const segments = fileStem.split("-").map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  if (segments[0] !== "TC" || segments.length < 3) {
    return null;
  }
  const caseIdSegments = ["TC"];
  for (const segment of segments.slice(1)) {
    caseIdSegments.push(segment);
    if (/\d/.test(segment)) {
      return caseIdSegments.join("-");
    }
  }
  return null;
}
function extractTestCaseIdFromContent(content) {
  if (!content) {
    return null;
  }
  const lines = content.split("\n").map((line) => line.trim());
  for (const [index, line] of lines.entries()) {
    if (!/^##\s+test id$/i.test(line)) {
      continue;
    }
    const nextNonEmptyLine = lines.slice(index + 1).find((candidate) => candidate.length > 0);
    if (nextNonEmptyLine && /^TC-[A-Z0-9-]+$/.test(nextNonEmptyLine)) {
      return nextNonEmptyLine;
    }
  }
  return null;
}
function dedupeSignals(signals) {
  const seen = /* @__PURE__ */ new Set();
  return signals.filter((signal) => {
    if (seen.has(signal.sourceId)) {
      return false;
    }
    seen.add(signal.sourceId);
    return true;
  });
}
async function listFilesRecursive(rootPath, includeFile, options = {}) {
  const files = [];
  const directoryEntries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of directoryEntries) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      if (options.excludeDirectoryNames?.has(entry.name)) {
        continue;
      }
      files.push(...await listFilesRecursive(absolutePath, includeFile, options));
      continue;
    }
    if (entry.isFile() && includeFile(absolutePath)) {
      files.push(absolutePath);
    }
  }
  return files;
}
async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
export {
  discoverRepoSignals
};
//# sourceMappingURL=repo-signals.js.map
