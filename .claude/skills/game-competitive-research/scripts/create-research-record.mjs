#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAYERS, blankVisualPresentation, parseArgs, readJson, shanghaiDate, slug, writeJson } from "./lib.mjs";
const { flags } = parseArgs(process.argv.slice(2));
if (!flags.game || !flags.type || !flags.out) { console.error("用法：create-research-record.mjs --game <名称> --type <类型ID或名称> --out research.json [--mode full|incremental] [--from YYYY-MM-DD]"); process.exit(2); }
try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); const catalog = readJson(path.join(root, "references/development-template-catalog.json"));
  const query = String(flags.type).toLowerCase(); const type = catalog.gameTypes.find((item) => item.id.toLowerCase() === query || item.name.toLowerCase() === query); if (!type) throw new Error(`未知类型：${flags.type}`);
  const today = shanghaiDate(); const mode = String(flags.mode || "full");
  if (!["full", "incremental"].includes(mode)) throw new Error("--mode 只能是 full 或 incremental。");
  if (mode === "incremental" && !flags.from) throw new Error("增量模板必须提供 --from YYYY-MM-DD。");
  const record = { game: { id: slug(flags.game), canonicalName: String(flags.game), aliases: [] }, snapshot: {
    collectedAt: new Date().toISOString(), collectionMode: mode, coverage: { from: mode === "incremental" ? String(flags.from || "") : null, to: today }, versionNotes: "",
    basic: { name: String(flags.game), englishName: "", developer: "", publisher: "", genres: [type.name], platforms: [], regions: [], releaseDate: "", status: "", businessModel: "", currentVersion: "", officialSites: [], storeIdentifiers: [], summary: "", operatingDuration: { launchDate: "", asOf: today, days: null, display: "", scope: "", evidenceIds: [] }, stageRevenue: [], dailyActiveUsers: [], targetAudience: { summary: "", segments: [], ageRanges: [], genderTendency: "", regions: [], motivations: [], behaviors: [], spendingProfiles: [], confidence: "", evidenceIds: [] }, marketMetrics: [], basicMetrics: [], evidenceGaps: [] },
    systemGameplay: { taxonomy: { marketGenres: [type.name], mainCorePrototype: "", secondaryCorePrototypes: [] }, playerMotivation: [], coreGameplay: { fantasy: "", primaryActions: [], primaryDecisions: [], skillDimensions: [], sessionStructure: "", evidenceIds: [] }, coreLoop: { steps: [], reset: "", success: "", failure: "", evidenceIds: [] }, metaLoop: { steps: [], cadence: "", evidenceIds: [] }, visualPresentation: blankVisualPresentation(), systemLayers: Object.fromEntries(LAYERS.map((layer) => [layer, { status: "unknown", summary: "", systems: [] }])), systems: [], features: [], keyMetrics: [], designObservations: [], evidenceGaps: ["母版中的品类与系统建议尚未得到该游戏证据验证。"] },
    commercialization: { paymentPoints: [], updateCadence: { minorDays: null, majorDays: null, seasonDays: null, observedWindow: "", evidenceIds: [] }, regularActivities: [], priceTierSummary: { count: null, min: null, max: null, currency: "", notes: "", evidenceIds: [] }, themedActivities: [], observations: [], evidenceGaps: [] },
    community: { channels: [], regularActivities: [], specialActivities: [], observations: [], evidenceGaps: [] },
    sources: []
  }, _researchChecklist: { developmentTemplate: { gameTypeId: type.id, gameType: type.name, corePrototype: type.corePrototype, recommendedSystemIds: type.recommendedSystemIds }, rule: "Checklist only. Do not add a system as a game fact until it is supported by evidence. For each confirmed system, set templateSystemId to the matching S01-S64 ID; leave it blank when no unambiguous match exists." } };
  writeJson(String(flags.out), record); console.log(`已创建：${flags.out}`);
} catch (error) { console.error(error.message); process.exit(2); }
