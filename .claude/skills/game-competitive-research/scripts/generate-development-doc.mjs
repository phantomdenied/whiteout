#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDevelopmentPackage, writeDevelopmentPackage } from "./development-package-lib.mjs";
import { findGame, latestVersion, parseArgs, readJson, slug } from "./lib.mjs";

const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0] || !flags.game) {
  console.error("用法：generate-development-doc.mjs <knowledge.json> --game <ID或名称> [--version id] [--out-dir dir] [--profile logic-prototype|visual-vertical-slice|production-ready] [--engine name] [--platform name] [--topology name] [--save-mode name] [--art-source-mode supplied|commissioned|ai-generated-bitmap|licensed|procedural|placeholder] [--asset-references-approved true] [--schema-reviewed true] [--include-unverified]");
  process.exit(2);
}

try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const catalog = readJson(path.join(root, "references/development-template-catalog.json"));
  const storyTemplate = readJson(path.join(root, "references/story-development-template.json"));
  const kb = readJson(positional[0]);
  const game = findGame(kb, flags.game);
  if (!game) throw new Error(`找不到游戏：${flags.game}`);
  const snapshot = flags.version ? game.versions.find((item) => item.versionId === flags.version) : latestVersion(game);
  if (!snapshot) throw new Error("找不到指定版本。");
  const base = `${slug(game.canonicalName)}-${snapshot.versionId.split("@").at(-1).slice(0, 10)}-development`;
  const outputDir = path.resolve(String(flags["out-dir"] || "outputs"));
  const pkg = buildDevelopmentPackage({ game, snapshot, catalog, storyTemplate, options: {
    profile: flags.profile,
    engine: flags.engine,
    platform: flags.platform,
    topology: flags.topology,
    saveMode: flags["save-mode"],
    artSourceMode: flags["art-source-mode"],
    assetReferencesApproved: flags["asset-references-approved"],
    schemaReviewed: flags["schema-reviewed"],
    includeUnverified: flags["include-unverified"],
  }});
  const written = writeDevelopmentPackage(pkg, outputDir, base);
  console.log(JSON.stringify({
    gameId: game.id, versionId: snapshot.versionId, packageVersion: pkg.manifest.packageVersion,
    profile: pkg.profileKey, implementationStatus: pkg.audit.status, blockers: pkg.audit.blockers,
    matchedTemplates: pkg.selection.matched.map((item) => item.template.id), projectFoundations: pkg.foundations.map((item) => item.id),
    tables: [...pkg.dataModel.tables.keys()], artResourceRows: pkg.artRows.length,
    packageDir: written.packageDir, packageZip: written.zipPath, outputs: written.outputs,
    pdf: "Use the development module's print-ready HTML preview and 导出 PDF control.",
  }, null, 2));
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(2);
}
