#!/usr/bin/env node
import { findGame, latestVersion, parseArgs, readJson, shanghaiDate, validateKnowledge } from "./lib.mjs";
const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0] || !flags.game) { console.error("用法：plan-collection.mjs <knowledge.json> --game <名称或ID> [--full] [--date YYYY-MM-DD]"); process.exit(2); }
try {
  const kb = readJson(positional[0]); const check = validateKnowledge(kb); if (check.errors.length) throw new Error(`知识库校验失败：${check.errors.join("；")}`); const today = String(flags.date || shanghaiDate()); const game = findGame(kb, flags.game); let result;
  if (!game) result = { action: "full", game: flags.game, from: null, to: today, reason: "知识库中不存在该游戏。" };
  else { const latest = latestVersion(game); const latestDate = latest ? shanghaiDate(new Date(latest.collectedAt)) : null;
    if (flags.full) result = { action: "full", gameId: game.id, game: game.canonicalName, from: null, to: today, previousVersionId: latest?.versionId || null, reason: "用户要求全部重新收集。" };
    else if (latestDate === today) result = { action: "skip", gameId: game.id, game: game.canonicalName, from: today, to: today, versionId: latest.versionId, reason: "当天已收集该游戏，不重复更新。" };
    else result = { action: "incremental", gameId: game.id, game: game.canonicalName, from: latest?.coverage?.to || latestDate, to: today, previousVersionId: latest?.versionId || null, reason: "从上次覆盖结束日增量收集到今天。" };
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exit(2); }
