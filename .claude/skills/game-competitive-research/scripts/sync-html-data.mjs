#!/usr/bin/env node
import path from "node:path";
import { parseArgs, readJson, validateKnowledge, writeText } from "./lib.mjs";
const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0]) { console.error("用法：sync-html-data.mjs <knowledge.json> [--out knowledge.js]"); process.exit(2); }
try { const kb = readJson(positional[0]); const result = validateKnowledge(kb); if (result.errors.length) throw new Error(result.errors.join("；")); const out = String(flags.out || path.join(path.dirname(positional[0]), "knowledge.js")); writeText(out, `window.GAME_RESEARCH_KB = ${JSON.stringify(kb, null, 2)};\n`); console.log(`已同步：${out}`); }
catch (error) { console.error(error.message); process.exit(2); }
