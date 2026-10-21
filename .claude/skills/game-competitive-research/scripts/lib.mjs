import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const LAYERS = ["core", "progression", "content", "economy", "social", "liveOps", "monetization"];
export const MODULES = ["overview", "system-gameplay", "commercial", "community", "report", "knowledge", "development"];
export function blankVisualPresentation() {
  return {
    spatialPresentation: { dimensionality: "", camera: "", projection: "", coordinateRules: [], depthOrdering: "", occlusion: "", evidenceIds: [] },
    sceneArt: { artDirection: "", assetFamilies: [], perspectiveAndScale: "", lightingAndShadow: "", materialsAndPalette: "", animationStates: [], environmentComposition: "", evidenceIds: [] },
    mainInterfaceComposition: { sceneScreenRatio: "", hudSafeZones: [], entryPlacement: [], worldSpaceElements: [], screenSpaceElements: [], navigationPattern: "", negativeConstraints: [], evidenceIds: [] },
    visualAcceptance: { styleFrameRequirements: [], blockoutRequirements: [], similarityTargets: [], rejectionCriteria: [], reviewMethod: "", evidenceIds: [] },
  };
}

export function parseArgs(argv) {
  const positional = []; const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) positional.push(token);
    else { const key = token.slice(2); const next = argv[i + 1]; if (!next || next.startsWith("--")) flags[key] = true; else { flags[key] = next; i += 1; } }
  }
  return { positional, flags };
}
export function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim()); }
export function writeText(file, content) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, content); }
export function writeJson(file, data) { writeText(file, `${JSON.stringify(data, null, 2)}\n`); }
export function shanghaiDate(input = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(input); }
export function slug(value) { const raw = String(value || "").trim(); const ascii = raw.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); return ascii || `game-${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`; }
export function latestVersion(game) { return [...(game?.versions || [])].sort((a, b) => String(b.collectedAt).localeCompare(String(a.collectedAt)))[0] || null; }
export function findGame(kb, query) { const q = String(query || "").toLowerCase(); return kb.games.find((game) => game.id.toLowerCase() === q || game.canonicalName.toLowerCase() === q || (game.aliases || []).some((alias) => alias.toLowerCase() === q)); }
export function evidenceIds(snapshot) { return new Set((snapshot.sources || []).map((source) => source.id)); }
function checkEvidence(list, valid, at, errors) { for (const id of list || []) if (!valid.has(id)) errors.push(`${at} 引用了不存在的 evidenceId：${id}`); }

export function validateKnowledge(kb) {
  const errors = []; const warnings = [];
  if (!kb || typeof kb !== "object") return { errors: ["知识库顶层必须是对象。"], warnings };
  if (!Array.isArray(kb.games)) return { errors: ["games 必须是数组。"], warnings };
  const ids = new Set();
  kb.games.forEach((game, gi) => {
    const at = `games[${gi}]`;
    if (!game.id || !game.canonicalName) errors.push(`${at} 缺少 id 或 canonicalName。`);
    if (ids.has(game.id)) errors.push(`${at}.id 重复：${game.id}`); ids.add(game.id);
    if (!Array.isArray(game.versions) || !game.versions.length) errors.push(`${at}.versions 必须是非空数组。`);
    const versionIds = new Set();
    (game.versions || []).forEach((snapshot, vi) => {
      const vat = `${at}.versions[${vi}]`; const valid = evidenceIds(snapshot);
      if (!snapshot.versionId || versionIds.has(snapshot.versionId)) errors.push(`${vat}.versionId 缺失或重复。`); versionIds.add(snapshot.versionId);
      if (!snapshot.collectedAt || !snapshot.collectionMode) errors.push(`${vat} 缺少 collectedAt 或 collectionMode。`);
      else if (!["full", "incremental"].includes(snapshot.collectionMode)) errors.push(`${vat}.collectionMode 只能是 full 或 incremental。`);
      if (!snapshot.coverage?.to) errors.push(`${vat}.coverage.to 必填。`);
      if (!snapshot.basic || !snapshot.systemGameplay || !snapshot.commercialization || !snapshot.community) errors.push(`${vat} 缺少必需模块。`);
      if (!Array.isArray(snapshot.sources) || !snapshot.sources.length) errors.push(`${vat}.sources 至少需要一条来源。`);
      (snapshot.sources || []).forEach((source, si) => { if (!source.id || !source.title || !source.url || !source.accessedAt) errors.push(`${vat}.sources[${si}] 缺少 id/title/url/accessedAt。`); });
      const sg = snapshot.systemGameplay || {};
      if (!sg.taxonomy?.mainCorePrototype) warnings.push(`${vat} 缺少主核心玩法原型。`);
      if (!Array.isArray(sg.coreLoop?.steps) || !sg.coreLoop.steps.length) warnings.push(`${vat} 缺少核心循环。`);
      if (!sg.systemLayers || typeof sg.systemLayers !== "object") warnings.push(`${vat} 缺少通用系统层。`);
      else for (const layer of LAYERS) if (!sg.systemLayers[layer]) warnings.push(`${vat}.systemGameplay.systemLayers 缺少 ${layer}。`);
      checkEvidence(sg.coreGameplay?.evidenceIds, valid, `${vat}.systemGameplay.coreGameplay`, errors);
      checkEvidence(sg.coreLoop?.evidenceIds, valid, `${vat}.systemGameplay.coreLoop`, errors);
      checkEvidence(sg.metaLoop?.evidenceIds, valid, `${vat}.systemGameplay.metaLoop`, errors);
      if (!sg.visualPresentation) warnings.push(`${vat}.systemGameplay 缺少 visualPresentation。`);
      else for (const group of ["spatialPresentation", "sceneArt", "mainInterfaceComposition", "visualAcceptance"]) {
        if (!sg.visualPresentation[group]) warnings.push(`${vat}.systemGameplay.visualPresentation 缺少 ${group}。`);
        else checkEvidence(sg.visualPresentation[group].evidenceIds, valid, `${vat}.systemGameplay.visualPresentation.${group}`, errors);
      }
      (sg.systems || []).forEach((system, si) => {
        checkEvidence(system.evidenceIds, valid, `${vat}.systemGameplay.systems[${si}]`, errors);
        if (system.templateSystemId && !/^S(?:0[1-9]|[1-5][0-9]|6[0-4])$/.test(system.templateSystemId)) errors.push(`${vat}.systemGameplay.systems[${si}].templateSystemId 必须是 S01-S64。`);
        if (!(system.evidenceIds || []).length) warnings.push(`${vat}.systemGameplay.systems[${si}] 没有 evidenceIds；默认不会进入母版开发文档。`);
      });
      (snapshot.basic?.basicMetrics || []).forEach((metric, mi) => { if (!metric.asOf) warnings.push(`${vat}.basic.basicMetrics[${mi}] 缺少 asOf。`); checkEvidence(metric.evidenceIds, valid, `${vat}.basic.basicMetrics[${mi}]`, errors); });
      const basic = snapshot.basic || {};
      if (!basic.operatingDuration) warnings.push(`${vat}.basic 缺少 operatingDuration。`);
      else { if (!basic.operatingDuration.asOf) warnings.push(`${vat}.basic.operatingDuration 缺少 asOf。`); checkEvidence(basic.operatingDuration.evidenceIds, valid, `${vat}.basic.operatingDuration`, errors); }
      if (!Array.isArray(basic.stageRevenue)) warnings.push(`${vat}.basic 缺少 stageRevenue 数组。`);
      else basic.stageRevenue.forEach((item, i) => { if (!item.period) warnings.push(`${vat}.basic.stageRevenue[${i}] 缺少 period。`); checkEvidence(item.evidenceIds, valid, `${vat}.basic.stageRevenue[${i}]`, errors); });
      if (!Array.isArray(basic.dailyActiveUsers)) warnings.push(`${vat}.basic 缺少 dailyActiveUsers 数组。`);
      else basic.dailyActiveUsers.forEach((item, i) => { if (!item.asOf) warnings.push(`${vat}.basic.dailyActiveUsers[${i}] 缺少 asOf。`); checkEvidence(item.evidenceIds, valid, `${vat}.basic.dailyActiveUsers[${i}]`, errors); });
      if (!basic.targetAudience) warnings.push(`${vat}.basic 缺少 targetAudience。`);
      else checkEvidence(basic.targetAudience.evidenceIds, valid, `${vat}.basic.targetAudience`, errors);
      if (!Array.isArray(basic.storeIdentifiers)) warnings.push(`${vat}.basic 缺少 storeIdentifiers 数组。`);
      else basic.storeIdentifiers.forEach((item, i) => checkEvidence(item.evidenceIds, valid, `${vat}.basic.storeIdentifiers[${i}]`, errors));
      if (!Array.isArray(basic.marketMetrics)) warnings.push(`${vat}.basic 缺少 marketMetrics 数组。`);
      else basic.marketMetrics.forEach((item, i) => { if (!item.metric || !item.asOf && !item.period) warnings.push(`${vat}.basic.marketMetrics[${i}] 缺少 metric 或 asOf/period。`); checkEvidence(item.evidenceIds, valid, `${vat}.basic.marketMetrics[${i}]`, errors); });
      (snapshot.commercialization?.paymentPoints || []).forEach((item, i) => checkEvidence(item.evidenceIds, valid, `${vat}.commercialization.paymentPoints[${i}]`, errors));
      checkEvidence(snapshot.commercialization?.updateCadence?.evidenceIds, valid, `${vat}.commercialization.updateCadence`, errors);
      checkEvidence(snapshot.commercialization?.priceTierSummary?.evidenceIds, valid, `${vat}.commercialization.priceTierSummary`, errors);
      (snapshot.commercialization?.regularActivities || []).forEach((item, i) => checkEvidence(item.evidenceIds, valid, `${vat}.commercialization.regularActivities[${i}]`, errors));
      (snapshot.commercialization?.themedActivities || []).forEach((item, i) => checkEvidence(item.evidenceIds, valid, `${vat}.commercialization.themedActivities[${i}]`, errors));
      (snapshot.community?.channels || []).forEach((item, i) => checkEvidence(item.evidenceIds, valid, `${vat}.community.channels[${i}]`, errors));
      (snapshot.community?.regularActivities || []).forEach((item, i) => checkEvidence(item.evidenceIds, valid, `${vat}.community.regularActivities[${i}]`, errors));
      (snapshot.community?.specialActivities || []).forEach((item, i) => checkEvidence(item.evidenceIds, valid, `${vat}.community.specialActivities[${i}]`, errors));
    });
  });
  return { errors, warnings };
}

export function validateResearchRecord(record) {
  const errors = []; const warnings = [];
  if (!record?.game?.canonicalName) errors.push("game.canonicalName 必填。");
  if (!record?.snapshot) errors.push("snapshot 必填。");
  const snapshot = record?.snapshot || {};
  if (snapshot.collectionMode && !["full", "incremental"].includes(snapshot.collectionMode)) errors.push("snapshot.collectionMode 只能是 full 或 incremental。");
  if (!snapshot.coverage?.to) errors.push("snapshot.coverage.to 必填。");
  for (const section of ["basic", "systemGameplay", "commercialization", "community"]) if (!snapshot[section]) errors.push(`snapshot.${section} 必填。`);
  if (!Array.isArray(snapshot.sources) || !snapshot.sources.length) errors.push("snapshot.sources 至少需要一条来源。");
  if (!snapshot.basic?.operatingDuration) warnings.push("总览缺少上线时长 operatingDuration。");
  if (!Array.isArray(snapshot.basic?.stageRevenue)) warnings.push("总览缺少阶段流水 stageRevenue 数组。");
  if (!Array.isArray(snapshot.basic?.dailyActiveUsers)) warnings.push("总览缺少日活 dailyActiveUsers 数组。");
  if (!snapshot.basic?.targetAudience) warnings.push("总览缺少目标人群 targetAudience。");
  if (!Array.isArray(snapshot.basic?.storeIdentifiers)) warnings.push("总览缺少商店标识 storeIdentifiers 数组。");
  if (!Array.isArray(snapshot.basic?.marketMetrics)) warnings.push("总览缺少平台市场信号 marketMetrics 数组。");
  if (!snapshot.systemGameplay?.taxonomy?.mainCorePrototype) warnings.push("缺少主核心玩法原型。");
  if (!snapshot.systemGameplay?.coreLoop?.steps?.length) warnings.push("缺少核心循环步骤。");
  if (!snapshot.systemGameplay?.visualPresentation) warnings.push("系统与玩法缺少视觉表现 visualPresentation。");
  (snapshot.systemGameplay?.systems || []).forEach((system, index) => {
    if (system.templateSystemId && !/^S(?:0[1-9]|[1-5][0-9]|6[0-4])$/.test(system.templateSystemId)) errors.push(`snapshot.systemGameplay.systems[${index}].templateSystemId 必须是 S01-S64。`);
    if (!(system.evidenceIds || []).length) warnings.push(`snapshot.systemGameplay.systems[${index}] 没有 evidenceIds；默认不会进入母版开发文档。`);
  });
  return { errors, warnings };
}

export function htmlEscape(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
