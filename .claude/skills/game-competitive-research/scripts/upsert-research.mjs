#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { findGame, latestVersion, parseArgs, readJson, shanghaiDate, slug, validateKnowledge, validateResearchRecord, writeJson } from "./lib.mjs";
const { positional, flags } = parseArgs(process.argv.slice(2));
if (positional.length < 2) { console.error("用法：upsert-research.mjs <knowledge.json> <research.json> [--in-place|--out file] [--full]"); process.exit(2); }
try {
  const source = positional[0]; const kb = readJson(source); const record = readJson(positional[1]); delete record._researchChecklist;
  const knowledgeCheck = validateKnowledge(kb); if (knowledgeCheck.errors.length) throw new Error(`原知识库校验失败：${knowledgeCheck.errors.join("；")}`);
  const inputCheck = validateResearchRecord(record); if (inputCheck.errors.length) throw new Error(inputCheck.errors.join("；"));
  const today = shanghaiDate(); let game = findGame(kb, record.game.id || record.game.canonicalName); const previous = latestVersion(game); const previousDate = previous ? shanghaiDate(new Date(previous.collectedAt)) : null;
  if (game && previousDate === today && !flags.full) throw new Error("当天已存在该游戏采集版本。只有用户明确要求全部重新收集时才可使用 --full。 ");
  if (!game) { game = { id: record.game.id || slug(record.game.canonicalName), canonicalName: record.game.canonicalName, aliases: record.game.aliases || [], versions: [] }; kb.games.push(game); }
  const snapshot = structuredClone(record.snapshot); snapshot.collectedAt = snapshot.collectedAt || new Date().toISOString(); snapshot.collectionMode = flags.full || !previous ? "full" : "incremental";
  snapshot.coverage = snapshot.coverage || {}; snapshot.coverage.from = snapshot.collectionMode === "full" ? null : (snapshot.coverage.from || previous?.coverage?.to || previousDate); snapshot.coverage.to = snapshot.coverage.to || today;
  snapshot.versionId = snapshot.versionId || `${game.id}@${snapshot.collectedAt.replace(/[:.]/g, "-")}`;
  game.canonicalName = record.game.canonicalName; game.aliases = [...new Set([...(game.aliases || []), ...(record.game.aliases || [])])]; game.versions.push(snapshot);
  kb.meta = { ...(kb.meta || {}), skillVersion: "1.3.0", schemaVersion: "1.4.0", updatedAt: new Date().toISOString() };
  const result = validateKnowledge(kb); if (result.errors.length) throw new Error(`更新后校验失败：${result.errors.join("；")}`);
  const output = flags["in-place"] ? source : String(flags.out || path.join(path.dirname(source), `${path.basename(source, path.extname(source))}.updated.json`));
  if (flags["in-place"]) fs.copyFileSync(source, `${source}.bak`); writeJson(output, kb);
  console.log(JSON.stringify({ output, gameId: game.id, versionId: snapshot.versionId, collectionMode: snapshot.collectionMode, warnings: [...inputCheck.warnings, ...result.warnings] }, null, 2));
} catch (error) { console.error(error.message); process.exit(2); }
