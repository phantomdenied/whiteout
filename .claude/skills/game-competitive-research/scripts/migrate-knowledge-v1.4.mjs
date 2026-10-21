#!/usr/bin/env node
import { blankVisualPresentation, parseArgs, readJson, validateKnowledge, writeJson } from "./lib.mjs";

const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0]) {
  console.error("用法：migrate-knowledge-v1.4.mjs <knowledge.json> [--in-place] [--out file]");
  process.exit(2);
}

try {
  const source = String(positional[0]);
  const knowledge = readJson(source);
  let migratedSnapshots = 0;
  for (const game of knowledge.games || []) for (const snapshot of game.versions || []) {
    snapshot.systemGameplay ||= {};
    const defaults = blankVisualPresentation();
    if (!snapshot.systemGameplay.visualPresentation) migratedSnapshots += 1;
    snapshot.systemGameplay.visualPresentation ||= {};
    for (const [group, value] of Object.entries(defaults)) snapshot.systemGameplay.visualPresentation[group] ||= value;
  }
  knowledge.meta = { ...(knowledge.meta || {}), skillVersion: "1.3.0", schemaVersion: "1.4.0" };
  const validation = validateKnowledge(knowledge);
  if (validation.errors.length) throw new Error(validation.errors.join("；"));
  const output = flags["in-place"] ? source : String(flags.out || `${source}.v1.4.json`);
  writeJson(output, knowledge);
  console.log(JSON.stringify({ output, games: knowledge.games?.length || 0, migratedSnapshots, schemaVersion: knowledge.meta.schemaVersion, warnings: validation.warnings }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
