#!/usr/bin/env node
import { parseArgs, readJson, validateKnowledge, validateResearchRecord } from "./lib.mjs";
const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0]) { console.error("用法：validate-knowledge.mjs <file.json> [--research-record]"); process.exit(2); }
try { const data = readJson(positional[0]); const result = flags["research-record"] ? validateResearchRecord(data) : validateKnowledge(data); console.log(JSON.stringify({ file: positional[0], ...result }, null, 2)); process.exit(result.errors.length ? 1 : 0); }
catch (error) { console.error(error.message); process.exit(2); }
