#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findGame, latestVersion, parseArgs, readJson, writeJson } from "./lib.mjs";
import { selectDevelopmentTemplates } from "./template-lib.mjs";

const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0] || !flags.game) {
  console.error("用法：select-development-templates.mjs <knowledge.json> --game <ID或名称> [--version id] [--out selection.json] [--include-unverified]");
  process.exit(2);
}

try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const catalog = readJson(path.join(root, "references/development-template-catalog.json"));
  const kb = readJson(positional[0]);
  const game = findGame(kb, flags.game);
  if (!game) throw new Error(`找不到游戏：${flags.game}`);
  const snapshot = flags.version ? game.versions.find((item) => item.versionId === flags.version) : latestVersion(game);
  if (!snapshot) throw new Error("找不到指定版本。");
  const selection = selectDevelopmentTemplates(snapshot, catalog, { includeUnverified: flags["include-unverified"] });
  const output = {
    gameId: game.id,
    versionId: snapshot.versionId,
    templateCatalog: catalog.meta,
    matched: selection.matched.map((item) => ({ systemName: item.system.name, templateSystemId: item.template.id, templateName: item.template.name, matchedBy: item.matchedBy })),
    unmatched: selection.unmatched.map((item) => ({ systemName: item.system.name, reason: item.reason })),
    excluded: selection.excluded.map((item) => ({ systemName: item.system.name, reason: item.reason })),
  };
  if (flags.out) writeJson(String(flags.out), output);
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
