#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readJson } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const knowledge = readJson(path.join(root, "data/knowledge.json"));
const knowledgeScript = fs.readFileSync(path.join(root, "data/knowledge.js"), "utf8");
const templateCatalog = readJson(path.join(root, "references/development-template-catalog.json"));
const templateScript = fs.readFileSync(path.join(root, "data/development-templates.js"), "utf8");
const storyTemplate = readJson(path.join(root, "references/story-development-template.json"));
const storyTemplateScript = fs.readFileSync(path.join(root, "data/story-development-template.js"), "utf8");
const productionScript = fs.readFileSync(path.join(root, "data/development-production.js"), "utf8");
const competitiveReportScript = fs.readFileSync(path.join(root, "data/competitive-report.js"), "utf8");
const expectedModules = ["总览", "系统与玩法", "商业化活动", "社区运营", "竞品报告", "知识库", "开发文档"];
const errors = [];

const navMatch = html.match(/const NAV=(\[[^;]+\]);/);
if (!navMatch) errors.push("未找到 NAV 定义。");
else {
  try {
    const nav = JSON.parse(navMatch[1]);
    if (nav.length !== 7 || JSON.stringify(nav.map((item) => item[2])) !== JSON.stringify(expectedModules)) {
      errors.push("NAV 必须按规定仅包含七个模块。");
    }
  } catch {
    errors.push("NAV 不是可验证的静态 JSON 数组。");
  }
}

const forbiddenBrand = ["scout", "deck"].join("");
if (new RegExp(forbiddenBrand, "i").test(html)) errors.push("页面中仍含旧站点品牌。");
const fetchTargets = [...html.matchAll(/(?:window\.)?fetch\(\s*["']([^"']+)/g)].map((match) => match[1]);
const approvedResearchTargets = ["https://api.openai.com/v1/responses", "https://api.anthropic.com/v1/messages", "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", "https://api.x.ai/v1/responses", "https://api.perplexity.ai/chat/completions", "https://open.bigmodel.cn/api/paas/v4/chat/completions"];
if (fetchTargets.length) errors.push("联网采集必须通过受控厂商配置动态取址，不得出现旁路硬编码 fetch。");
for (const target of approvedResearchTargets) if (!html.includes(target)) errors.push(`页面缺少受控联网采集目标：${target}`);
if (!html.includes("window.fetch(request.url,request.init)")) errors.push("页面缺少用户显式触发的受控联网采集入口。");
if (/\b(?:XMLHttpRequest|WebSocket)\s*\(/.test(html)) errors.push("页面包含未授权的网络通道。");
if (/<script[^>]+src=["']https?:\/\//i.test(html) || /<link[^>]+href=["']https?:\/\//i.test(html)) errors.push("页面包含远程脚本或样式依赖。");
if (!/<script src=["']data\/knowledge\.js["']><\/script>/.test(html)) errors.push("页面未通过本地 knowledge.js 加载知识库。");
if (!/<script src=["']data\/development-templates\.js["']><\/script>/.test(html)) errors.push("页面未加载离线开发母版索引。");
if (!/<script src=["']data\/story-development-template\.js["']><\/script>/.test(html)) errors.push("页面未加载剧情互动条件母版。");
if (!/<script src=["']data\/development-production\.js["']><\/script>/.test(html)) errors.push("页面未加载生产开发包构建器。");
if (!/<script src=["']data\/competitive-report\.js["']><\/script>/.test(html)) errors.push("页面未加载竞品报告构建器。");
if (!Array.isArray(knowledge.games) || knowledge.games.length !== 0) errors.push("交付知识库必须以空 games 数组安装。");
if (knowledge.meta?.skillVersion !== "1.3.0") errors.push("交付知识库 skillVersion 必须是 1.3.0。");
if (knowledge.meta?.schemaVersion !== "1.4.0") errors.push("知识库 schemaVersion 必须是 1.4.0。");
if (!/GAME_RESEARCH_KB\s*=/.test(knowledgeScript) || !/"games"\s*:\s*\[\s*\]/.test(knowledgeScript)) errors.push("knowledge.js 必须包含空知识库镜像。");
if (!/GAME_DEV_TEMPLATES\s*=/.test(templateScript)) errors.push("development-templates.js 缺少母版镜像。");
if (!/GAME_STORY_DEV_TEMPLATE\s*=/.test(storyTemplateScript)) errors.push("story-development-template.js 缺少剧情母版镜像。");
if (templateCatalog.meta?.systemCount !== 64 || templateCatalog.systems?.length !== 64) errors.push("开发母版必须包含 S01-S64 共 64 个系统。");
if (templateCatalog.meta?.gameTypeCount !== 32 || templateCatalog.gameTypes?.length !== 32) errors.push("开发母版必须包含 G01-G32 共 32 类游戏。");
const v3Docx = path.join(root, "assets/game-system-development-template-library-v3.0.docx");
const v3Markdown = path.join(root, "assets/game-system-development-template-library-v3.0.md");
const v3Manifest = path.join(root, "references/development-templates-v3/manifest.json");
if (!fs.existsSync(v3Docx) || !fs.existsSync(v3Markdown)) errors.push("缺少 v3.0 DOCX/Markdown 母版资产。");
else {
  if (crypto.createHash("sha256").update(fs.readFileSync(v3Docx)).digest("hex") !== templateCatalog.meta?.sourceSha256) errors.push("v3.0 DOCX 与母版校验值不一致。");
  if (crypto.createHash("sha256").update(fs.readFileSync(v3Markdown)).digest("hex") !== templateCatalog.meta?.sourceMarkdownSha256) errors.push("v3.0 Markdown 与母版校验值不一致。");
}
if (!fs.existsSync(v3Manifest)) errors.push("缺少 v3.0 系统拆分清单。");
else {
  const manifest = readJson(v3Manifest);
  if (manifest.systems?.length !== 64) errors.push("v3.0 系统拆分清单必须包含 64 个文档。");
  for (const system of manifest.systems || []) if (!fs.existsSync(path.join(root, "references/development-templates-v3", system.document))) errors.push(`缺少系统模板文档：${system.document}`);
}
const storyWorkbookPath = path.join(root, "assets/story-interaction-development-template-v1.0.xlsx");
if (!fs.existsSync(storyWorkbookPath)) errors.push("缺少剧情互动原始 XLSX 母版资产。");
else if (crypto.createHash("sha256").update(fs.readFileSync(storyWorkbookPath)).digest("hex") !== storyTemplate.meta?.sourceSha256) errors.push("剧情互动原始 XLSX 与母版校验值不一致。");
if (storyTemplate.meta?.sourceSha256 !== "6086c430d5d810e989b48b3cda844fae4d51acd6b6651c77c3c0f86ac76be376") errors.push("剧情互动母版来源校验值不正确。");
for (const feature of ["overview-signal-grid", "operatingDuration", "stageRevenue", "dailyActiveUsers", "targetAudience", "marketMetrics", "market-signal-table", "compare-grid", "compare-metric-cell", "comparisonMode", "comparison-only-view", "compare-product-head", "renderCompareV14"]) {
  if (!html.includes(feature)) errors.push(`入口缺少 v1.3 功能标记：${feature}`);
}
for (const feature of ["templateSystemId", "templateSelection", "MASTER-ADAPTED", "developmentTemplatePayload"]) if (!html.includes(feature)) errors.push(`入口缺少母版适配功能标记：${feature}`);
for (const feature of ["storyTemplateSelection", "剧情互动系统条件母版", "download-art-csv", "artResourceCsv", "UI界面与元素", "doc-preview", "markdownToHtml", "导出 MD", "导出 PDF", "导出 AI JSON", "导出美术资源 List", "file-button{display:inline-flex", "compare.includes(nextId)", "id=\"game-search\"", "game-search-results", "searchKnowledgeGames", "selectGameFromToolbar", "data-new-research", "startResearchDialog", "collectGameFromPage", "type:\"web_search\"", "researchRequest", "researchResponseText", "parseResearchJson"]) if (!html.includes(feature)) errors.push(`入口缺少本次交互/导出功能标记：${feature}`);
for (const feature of ["RESEARCH_PROVIDERS", "research-model-family", "researchModelVersionOptions", "热门模型厂商", "模型版本", "gpt-5.6-sol", "claude-sonnet-5", "gemini-3.7-flash", "grok-4.6", "sonar-deep-research", "glm-4.5", "research-key-label"]) if (!html.includes(feature)) errors.push(`页面调研弹窗缺少多厂商热门模型/版本选择：${feature}`);
for (const feature of ["game-picker-button", "game-picker-menu", "game-picker-option", "--game-picker-row:40px", "max-height:calc(var(--game-picker-row) * 10 + 8px)", "overflow-y:auto", "data-game-option", "toggleGamePicker"]) if (!html.includes(feature)) errors.push(`游戏选择器缺少十项滚动限制：${feature}`);
for (const feature of ["visualPresentation", "空间表现", "场景美术", "主界面构图", "视觉验收", "visual-presentation-panel", "stripDevelopmentReferenceHeader", "竞品视觉/世界空间资源"]) if (!html.includes(feature)) errors.push(`入口缺少视觉表现功能标记：${feature}`);
for (const feature of ["production-ready", "visual-vertical-slice", "logic-prototype", "完整性状态", "统一数据模型", "美术来源", "PACKAGE V2"]) if (!`${html}\n${productionScript}`.includes(feature)) errors.push(`入口缺少生产开发包功能标记：${feature}`);
for (const feature of ["模型提示词", "aiArtPrompt", "必须原创", "空间与镜头"]) if (!productionScript.includes(feature)) errors.push(`AI美术资源缺少逐项模型提示词：${feature}`);
for (const feature of ["PRODUCTION_SELECTS", "build-game", "build-profile", "build-engine", "build-platform", "build-topology", "build-save-mode", "art-source-mode"]) if (!html.includes(feature)) errors.push(`生产包设置缺少受控下拉框：${feature}`);
for (const id of ["build-engine", "build-platform", "build-topology", "build-save-mode"]) if (html.includes(`<input id="${id}"`)) errors.push(`生产包设置仍使用自由输入框：${id}`);
for (const feature of ["GameCompetitiveReport", "singleReport", "comparisonReport"]) if (!competitiveReportScript.includes(feature)) errors.push(`竞品报告构建器缺少功能标记：${feature}`);
for (const feature of ["systemRows", "目标与规则", "输入、输出与依赖", "• **", "视觉模块", "验收关注"]) if (!competitiveReportScript.includes(feature)) errors.push(`竞品报告缺少结构化系统展示：${feature}`);
for (const feature of ["report-game-a", "report-game-b", "download-report-md", "print-report", "report-document", "HTML PREVIEW", "最多两款"]) if (!html.includes(feature) && !competitiveReportScript.includes(feature)) errors.push(`入口缺少竞品报告功能标记：${feature}`);
for (const feature of ["report-cover", "report-cover-kicker", "report-cover-meta", "reportCoverHtml", "reportBodyHtml", "page-break-after:always", "GAME COMPETITIVE INTELLIGENCE"]) if (!html.includes(feature)) errors.push(`竞品报告缺少正式打印封面：${feature}`);
if (!html.includes(".report-preview h3+table")) errors.push("单产品报告缺少卡片式表单预览样式。");
if (!html.includes(".dev-grid{align-items:stretch}") || !html.includes(".document{min-height:900px")) errors.push("开发文档预览没有与左侧设置栏等高并扩大最小高度。");
for (const removed of ["SIDE-BY-SIDE COMPARISON", "左右对比", "compare-card"]) if (html.includes(removed)) errors.push(`入口仍含已移除的旧对比标记：${removed}`);

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\ssrc=/.test(match[0]))
  .map((match) => match[1]);
if (inlineScripts.length !== 1) errors.push(`入口应只有一个内联应用脚本，实际 ${inlineScripts.length} 个。`);
else {
  try { new Function(inlineScripts[0]); }
  catch (error) { errors.push(`入口脚本语法错误：${error.message}`); }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  entry: "index.html",
  modules: expectedModules,
  knowledgeGames: knowledge.games.length,
  visualizationNetworkDependencies: 0,
  explicitResearchApiTargets: approvedResearchTargets,
  developmentTemplateSystems: templateCatalog.systems.length,
  status: "ok"
}, null, 2));
