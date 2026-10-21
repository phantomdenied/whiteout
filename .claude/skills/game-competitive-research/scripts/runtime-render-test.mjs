#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildDevelopmentPackage } from "./development-package-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const knowledgePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "data/knowledge.json");
const kb = JSON.parse(fs.readFileSync(knowledgePath, "utf8"));
const templateCatalog = JSON.parse(fs.readFileSync(path.join(root, "references/development-template-catalog.json"), "utf8"));
const storyTemplate = JSON.parse(fs.readFileSync(path.join(root, "references/story-development-template.json"), "utf8"));
const productionScript = fs.readFileSync(path.join(root, "data/development-production.js"), "utf8");
const competitiveReportScript = fs.readFileSync(path.join(root, "data/competitive-report.js"), "utf8");
if ((kb.games || []).length < 2) {
  console.error("运行时对比测试至少需要两款游戏；可传入已安装知识库路径。");
  process.exit(2);
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\ssrc=/.test(match[0]))[0]?.[1];
if (!inline) throw new Error("没有找到入口应用脚本。");

function element() {
  return { innerHTML: "", textContent: "", value: "", files: [], hidden: false, classList: { toggle() {} }, setAttribute() {}, querySelectorAll() { return []; } };
}
function runApp(view, compareCount = 0, data = kb) {
  const elements = Object.fromEntries(["nav", "game-search", "game-search-results", "game-picker-button", "game-picker-label", "game-picker-menu", "game-select", "version-select", "compare-count", "root", "crumb", "compare-open", "export-kb", "import-file"].map((id) => [id, element()]));
  const document = {
    querySelector(selector) { return selector.startsWith("#") ? elements[selector.slice(1)] || null : null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return element(); },
    body: { appendChild() {} }
  };
  const source = inline
    .replace('view="overview",selectedGameId=', `view=${JSON.stringify(view)},selectedGameId=`)
    .replace('selectedVersionId="",compare=[],reportGameIds=[],reportContextKey="";', `selectedVersionId="",compare=kb.games.slice(0,${compareCount}).map(game=>game.id),reportGameIds=[],reportContextKey="";`);
  const context = { window: { GAME_RESEARCH_KB: data, GAME_DEV_TEMPLATES: templateCatalog, GAME_STORY_DEV_TEMPLATE: storyTemplate }, document, structuredClone, URL, Blob, FileReader: class {}, setTimeout() {}, console };
  vm.runInNewContext(productionScript, context, { filename: "development-production.js" });
  vm.runInNewContext(competitiveReportScript, context, { filename: "competitive-report.js" });
  vm.runInNewContext(source, context, { filename: "index.html" });
  return { elements, context };
}
function render(view, compareCount = 0, data = kb) { return runApp(view, compareCount, data).elements.root.innerHTML; }

const moduleTests = {
  overview: { singleMarkers: ['class="hero"', 'class="overview-signal-grid"'], hiddenMarkers: ['class="hero"', 'class="overview-signal-grid"'] },
  "system-gameplay": { singleMarkers: ["CORE GAMEPLAY", 'class="system-list"', "核心玩法视觉表现", "visual-presentation-panel"], hiddenMarkers: ["CORE GAMEPLAY", 'class="system-list"', "visual-presentation-panel"] },
  commercial: { singleMarkers: ['class="cadence"', 'class="cards"'], hiddenMarkers: ['class="cadence"', 'class="cards"'] },
  community: { singleMarkers: ['class="channels"', 'class="activity-table"'], hiddenMarkers: ['class="channels"', 'class="activity-table"'] }
};
const developmentOutput = render("development");
const singleReportOutput = render("report", 0);
const comparisonReportOutput = render("report", 2);
const count = (source, marker) => source.split(marker).length - 1;
const errors = [];
const packageGame = [...kb.games].sort((a, b) => Math.max(...(b.versions || []).map((item) => item.systemGameplay?.systems?.length || 0)) - Math.max(...(a.versions || []).map((item) => item.systemGameplay?.systems?.length || 0)))[0];
const packageSnapshot = [...(packageGame?.versions || [])].sort((a, b) => String(b.collectedAt).localeCompare(String(a.collectedAt)))[0];
if (packageGame && packageSnapshot) {
  const browserBuilder = runApp("development").context.window.GameDevelopmentPackage;
  const baseOptions = { engine: "Unity", platform: "iOS / Android", topology: "客户端—服务端", saveMode: "云存档", artSourceMode: "supplied-or-commissioned" };
  const browserProfiles = Object.fromEntries(["logic-prototype", "visual-vertical-slice", "production-ready"].map((profile) => [profile, browserBuilder.build(packageGame, packageSnapshot, templateCatalog, { ...baseOptions, profile })]));
  for (const [profile, built] of Object.entries(browserProfiles)) {
    if (!built.artRows.length) errors.push(`${profile} 没有生成美术资源清单。`);
    if (!built.markdown.includes("美术资源需求总表") || !built.markdown.includes("本档交付") || !built.markdown.includes("规格与用途")) errors.push(`${profile} 开发文档正文没有完整美术资源需求表。`);
    for (const row of built.artRows.slice(0, 20)) if (!built.markdown.includes(String(row.fields["资源名称"]).replaceAll("|", "\\|"))) errors.push(`${profile} 正文缺少资源：${row.fields["资源名称"]}`);
  }
  if (!browserProfiles["logic-prototype"].artRows.some((row) => row.fields["本档交付"].includes("后续档位"))) errors.push("逻辑原型没有区分本档占位与后续正式资源。");
  if (!browserProfiles["visual-vertical-slice"].artRows.some((row) => row.fields["本档交付"].includes("代表性"))) errors.push("视觉切片没有标记代表性正式资源范围。");
  if (!browserProfiles["production-ready"].artRows.every((row) => row.fields["本档交付"].includes("最终可发布"))) errors.push("生产开发没有要求全部资源最终可发布。");
  if (new Set(Object.values(browserProfiles).map((built) => built.markdown)).size !== 3) errors.push("三个生成档位的开发文档没有实质差异。");
  for (const source of ["supplied-or-commissioned", "ai-generated-bitmap", "licensed", "placeholder"]) {
    const built = browserBuilder.build(packageGame, packageSnapshot, templateCatalog, { ...baseOptions, profile: source === "placeholder" ? "logic-prototype" : "production-ready", artSourceMode: source });
    const policy = browserBuilder.ART_SOURCES[source];
    if (!built.artRows.every((row) => row.fields["制作来源策略"] === policy.label)) errors.push(`${source} 没有覆盖全部资源的制作来源策略。`);
    if (!built.markdown.includes(policy.workflow) || !built.markdown.includes(policy.license)) errors.push(`${source} 的流程或版权要求没有进入开发文档。`);
    if (source === "ai-generated-bitmap") {
      if (!built.artRows.every((row) => row.fields["模型提示词"]?.includes("必须原创"))) errors.push("AI生成位图没有为每项美术资源生成原创约束提示词。");
      if (!built.markdown.includes("| 模型提示词 |") || !built.markdown.includes("空间与镜头")) errors.push("AI生成位图的模型提示词没有进入开发文档表单。");
    } else if (built.markdown.includes("| 模型提示词 |")) errors.push(`${source} 非AI美术来源错误显示模型提示词列。`);
  }
  const cliPackage = buildDevelopmentPackage({ game: packageGame, snapshot: packageSnapshot, catalog: templateCatalog, storyTemplate, options: { ...baseOptions, profile: "visual-vertical-slice", artSourceMode: "ai-generated-bitmap" } });
  if (cliPackage.manifest.packageVersion !== "2.1.0" || !cliPackage.mainMarkdown.includes("美术资源需求总表") || !cliPackage.artRows.length) errors.push("CLI生产包没有同步到带美术资源正文的2.1结构。");
  if (!cliPackage.artRows.every((row) => row.fields["制作来源策略"] === "AI生成位图")) errors.push("CLI生产包没有把AI生成位图策略应用到全部资源。");
  if (!cliPackage.artRows.every((row) => row.fields["模型提示词"]?.includes("必须原创")) || !cliPackage.mainMarkdown.includes("| 模型提示词 |")) errors.push("CLI生产包没有把逐项AI模型提示词写入资源表与主文档。");
  for (const [label, source] of [["浏览器", browserProfiles["visual-vertical-slice"].markdown], ["CLI", cliPackage.mainMarkdown]]) {
    const systemIndex = source.indexOf(label === "浏览器" ? "## 7. 系统详细规格" : "## 7. 系统规格");
    const sequenceIndex = source.indexOf(label === "浏览器" ? "## 8. 分阶段实施" : "## 8. 开发顺序");
    const artIndex = source.indexOf("## 9. 美术资源需求总表");
    const constraintIndex = source.indexOf("## 10. 实施约束");
    if (!(systemIndex >= 0 && systemIndex < sequenceIndex && sequenceIndex < artIndex && artIndex < constraintIndex)) errors.push(`${label}开发文档没有把美术资源总表放在倒数第二章。`);
  }
}
for (const [view, markers] of Object.entries(moduleTests)) {
  const singleOutput = render(view, 1);
  const comparisonOutput = render(view, 2);
  for (const marker of markers.singleMarkers) if (!singleOutput.includes(marker)) errors.push(`${view} 单产品模式缺少详情标记：${marker}`);
  if (singleOutput.includes("comparison-only-view") || singleOutput.includes('class="compare-grid"')) errors.push(`${view} 仅选择一款时错误进入对比模式。`);
  if (!comparisonOutput.includes("comparison-only-view")) errors.push(`${view} 两款产品时没有进入纯对比模式。`);
  if (count(comparisonOutput, 'class="compare-grid"') !== 1) errors.push(`${view} 对比没有渲染为单一表格。`);
  if (count(comparisonOutput, 'class="compare-product-head"') !== 2) errors.push(`${view} 深色产品表头没有与两款产品列一一对应。`);
  if (count(comparisonOutput, 'class="compare-metric-cell"') < 4) errors.push(`${view} 对比表缺少完整指标行。`);
  for (const marker of markers.hiddenMarkers) if (comparisonOutput.includes(marker)) errors.push(`${view} 对比模式仍渲染单产品详情：${marker}`);
  if (comparisonOutput.includes("左右对比") || comparisonOutput.includes("SIDE-BY-SIDE") || comparisonOutput.includes("compare-card")) errors.push(`${view} 仍渲染旧对比标题或逐项卡片。`);
}
const overviewSingleOutput = render("overview", 1);
const overviewComparisonOutput = render("overview", 2);
if (!overviewSingleOutput.includes("平台与市场信号") || !overviewSingleOutput.includes("market-signal-table")) errors.push("总览单产品模式缺少平台与市场信号区。");
if (!overviewComparisonOutput.includes("平台与市场信号") || !overviewComparisonOutput.includes("目标人群")) errors.push("总览对比表缺少市场信号或目标人群指标。");
const emptyMetricKb = structuredClone(kb);
emptyMetricKb.games.slice(0, 2).forEach((game) => { const current = [...game.versions].sort((a, b) => String(b.collectedAt).localeCompare(String(a.collectedAt)))[0]; current.basic.stageRevenue = []; current.basic.dailyActiveUsers = []; current.basic.basicMetrics = (current.basic.basicMetrics || []).filter((metric) => !/日活|DAU/i.test(String(metric?.name || ""))); });
const emptyMetricComparison = render("overview", 2, emptyMetricKb);
if (emptyMetricComparison.includes("阶段流水") || emptyMetricComparison.includes("日活用户")) errors.push("所有对比产品均无流水/日活时仍显示空指标行。");
const systemComparisonOutput = render("system-gameplay", 2);
for (const label of ["空间表现", "场景美术", "主界面构图", "视觉验收"]) if (!systemComparisonOutput.includes(label)) errors.push(`系统与玩法对比缺少视觉指标：${label}`);
if (!developmentOutput.includes("HTML PREVIEW") || !developmentOutput.includes("PACKAGE V2")) errors.push("开发文档没有加载生产开发包预览。");
if (!developmentOutput.includes("完整性闸门") || !developmentOutput.includes("项目基础设施")) errors.push("开发文档缺少完整性闸门或目标项目补全层。");
if (!developmentOutput.includes("download-art-csv") || !developmentOutput.includes("美术清单")) errors.push("开发文档缺少独立美术资源清单导出。");
for (const label of ["导出 MD", "导出 PDF", "导出 AI JSON", "导出美术资源 List"]) if (!developmentOutput.includes(label)) errors.push(`开发文档缺少导出项：${label}`);
if (developmentOutput.includes("download-html") || developmentOutput.includes("下载 HTML")) errors.push("开发文档仍显示已移除的 HTML 文件导出。");
if (!developmentOutput.includes('class="doc-preview"') || developmentOutput.includes('<pre id="doc-text"')) errors.push("开发文档右侧没有使用 HTML 格式预览。");
for (const label of ["核心玩法视觉与美术生产闸门", "空间", "场景", "构图", "一票否决"]) if (!developmentOutput.includes(label)) errors.push(`开发文档缺少视觉生产闸门：${label}`);
for (const removed of ["知识版本：", "采集时间：", "开发母版：", "目标：将有证据支持的竞品系统", "边界：竞品事实与母版工程基线"]) if (developmentOutput.includes(removed)) errors.push(`开发文档预览仍展示参考说明：${removed}`);
if (!developmentOutput.includes("统一数据模型") || !developmentOutput.includes("张表")) errors.push("开发文档没有汇总项目级数据模型。");
for (const id of ["build-game", "build-profile", "build-engine", "build-platform", "build-topology", "build-save-mode", "art-source-mode"]) if (!developmentOutput.includes(`<select id="${id}"`)) errors.push(`生产包设置没有渲染为下拉框：${id}`);
for (const id of ["build-engine", "build-platform", "build-topology", "build-save-mode"]) if (developmentOutput.includes(`<input id="${id}"`)) errors.push(`生产包设置仍渲染自由输入框：${id}`);
for (const option of ["Unity", "Unreal Engine", "微信小游戏", "PC / Steam", "客户端—服务端", "服务端权威", "云存档", "混合存档", "AI生成位图", "授权素材"]) if (!developmentOutput.includes(option)) errors.push(`生产包设置缺少选项：${option}`);
if (!singleReportOutput.includes("REPORT BUILDER") || !singleReportOutput.includes("HTML PREVIEW · SINGLE") || !singleReportOutput.includes("download-report-md") || !singleReportOutput.includes("print-report")) errors.push("单产品竞品报告缺少选择、预览或 MD/PDF 导出。");
if (!singleReportOutput.includes('class="report-cover"') || !singleReportOutput.includes("SINGLE-PRODUCT RESEARCH") || !singleReportOutput.includes('class="report-body"')) errors.push("单产品竞品报告缺少正式封面或独立正文。");
if (!singleReportOutput.includes(kb.games[0].canonicalName) || count(singleReportOutput, 'id="report-game-a"') !== 1 || count(singleReportOutput, 'id="report-game-b"') !== 1) errors.push("单产品竞品报告没有默认跟随主选择或缺少双槽选择器。");
if (count(singleReportOutput, "<table>") < 4 || !singleReportOutput.includes("目标与规则") || !singleReportOutput.includes("输入、输出与依赖") || !singleReportOutput.includes("验收关注")) errors.push("单产品报告的系统与玩法没有使用分组表单结构。");
if (!comparisonReportOutput.includes("HTML PREVIEW · COMPARISON") || !comparisonReportOutput.includes(kb.games[0].canonicalName) || !comparisonReportOutput.includes(kb.games[1].canonicalName)) errors.push("对比状态竞品报告没有默认带入前两款游戏。");
if (!comparisonReportOutput.includes("TWO-PRODUCT COMPARATIVE STUDY") || !comparisonReportOutput.includes("数据覆盖") || !comparisonReportOutput.includes("证据来源")) errors.push("双产品竞品报告封面缺少报告类型、覆盖期或证据信息。");
if (!comparisonReportOutput.includes("产品总览对比") || !comparisonReportOutput.includes("系统与玩法对比") || !comparisonReportOutput.includes("商业化活动对比") || !comparisonReportOutput.includes("社区运营对比")) errors.push("双产品竞品报告缺少完整对比章节。");
if (!comparisonReportOutput.includes("• <strong>") || !comparisonReportOutput.includes("目标：") || !comparisonReportOutput.includes("规则：") || !comparisonReportOutput.includes("依赖：")) errors.push("双产品报告的主要系统没有按系统、目标、规则和依赖分点展示。");
const emptyOutput = render("overview", 0, { meta: kb.meta, games: [] });
if (!emptyOutput.includes("data-new-research") || !emptyOutput.includes("输入游戏名并开始分析")) errors.push("空知识库页面缺少直接新增游戏调研入口。");
const researchApp = runApp("overview", 0, { meta: kb.meta, games: [] });
const expectedProviders = ["openai", "anthropic", "google", "xai", "perplexity", "zhipu"];
const providerAdapter = researchApp.context.window.GameResearchProviders;
if (JSON.stringify(Object.keys(providerAdapter?.providers || {})) !== JSON.stringify(expectedProviders)) errors.push("空知识库联网采集没有提供六家受控模型厂商。");
for (const provider of expectedProviders) {
  const model = providerAdapter?.providers?.[provider]?.models?.[0]?.id;
  const request = providerAdapter.request(provider, model, "test-key-not-persisted", "test prompt");
  if (!request?.url?.startsWith("https://") || request.url.includes("test-key-not-persisted")) errors.push(`${provider} 的请求地址无效或泄露 API Key。`);
  if (!(request?.url?.includes(model) || request?.init?.body?.includes(model)) || !request?.init?.body?.includes("test prompt")) errors.push(`${provider} 的请求没有携带所选模型或研究提示词。`);
}
for (const [provider, payload] of [["openai", { output_text: "{\"ok\":true}" }], ["anthropic", { content: [{ type: "text", text: "{\"ok\":true}" }] }], ["google", { candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }] }], ["perplexity", { choices: [{ message: { content: "```json\n{\"ok\":true}\n```" } }] }]]) {
  const raw = providerAdapter.responseText(provider, payload);
  if (!providerAdapter.parseJson(raw).ok) errors.push(`${provider} 的研究响应无法归一为知识库 JSON。`);
}
const storyGame = kb.games.find((game) => (game.versions || []).some((snapshot) => storyTemplate.activation.genreKeywords.some((keyword) => (snapshot.basic?.genres || []).join("|").toLowerCase().includes(keyword.toLowerCase()))));
if (storyGame) {
  const storyKb = { ...kb, games: [storyGame, ...kb.games.filter((game) => game.id !== storyGame.id)] };
  const storyOutput = render("development", 0, storyKb);
  if (!storyOutput.includes('class="doc-preview"') || !storyOutput.includes("<table>")) errors.push("剧情产品开发文档 HTML 预览没有渲染标题/表格结构。");
}
const comparisonApp = runApp("overview", 2);
const firstId = kb.games[0].id;
if (!comparisonApp.elements["game-select"].innerHTML.includes(`value="${firstId}" selected`)) errors.push("对比状态下首个选择框没有显示第一款对比产品。");
if (comparisonApp.elements["game-picker-label"].textContent !== kb.games[0].canonicalName) errors.push("自定义游戏选择框没有显示当前第一款产品。");
if (count(comparisonApp.elements["game-picker-menu"].innerHTML, "data-game-option=") !== kb.games.length) errors.push("自定义游戏选择菜单没有完整保留知识库游戏。");
if (!comparisonApp.elements["version-select"].disabled) errors.push("对比状态下版本选择器没有锁定到各产品最新版本。");
const comparisonReorderApp = runApp("overview", 2);
comparisonReorderApp.elements["game-picker-menu"].onclick({ target: { closest() { return { dataset: { gameOption: kb.games[1].id } }; } } });
if (!comparisonReorderApp.elements.root.innerHTML.includes("comparison-only-view")) errors.push("选择对比集合内产品时错误退出对比状态。");
if (!comparisonReorderApp.elements["game-select"].innerHTML.includes(`value="${kb.games[1].id}" selected`)) errors.push("选择对比集合内产品后没有将其设为第一款产品。");
if (kb.games[2]) {
  comparisonApp.elements["game-select"].onchange({ target: { value: kb.games[2].id } });
  if (comparisonApp.elements.root.innerHTML.includes("comparison-only-view")) errors.push("选择非对比产品后没有切回单产品状态。");
  if (comparisonApp.elements["compare-count"].textContent !== 0) errors.push("选择非对比产品后没有清空对比状态。");
  if (!comparisonApp.elements["game-select"].innerHTML.includes(`value="${kb.games[2].id}" selected`)) errors.push("切回单产品状态后没有显示新选择的产品。");
}
const searchTarget = kb.games.at(-1);
const searchApp = runApp("system-gameplay", 0);
const searchQuery = searchTarget.canonicalName.slice(0, Math.max(1, Math.min(3, searchTarget.canonicalName.length)));
searchApp.elements["game-search"].value = searchQuery;
searchApp.elements["game-search"].oninput({ target: { value: searchQuery } });
if (!searchApp.elements["game-search-results"].innerHTML.includes(searchTarget.canonicalName)) errors.push("顶部搜索没有按游戏名称筛选本地知识库。");
searchApp.elements["game-search-results"].onclick({ target: { closest() { return { dataset: { searchGame: searchTarget.id } }; } } });
if (!searchApp.elements.root.innerHTML.includes('class="hero"')) errors.push("搜索选择游戏后没有直接进入单产品总览分析。");
if (!searchApp.elements["game-select"].innerHTML.includes(`value="${searchTarget.id}" selected`)) errors.push("搜索选择结果没有同步顶部产品选择框。");
const missingSearchApp = runApp("overview", 0);
missingSearchApp.elements["game-search"].value = "__not_in_local_knowledge__";
missingSearchApp.elements["game-search"].oninput({ target: { value: "__not_in_local_knowledge__" } });
if (!missingSearchApp.elements["game-search-results"].innerHTML.includes("data-new-research") || !missingSearchApp.elements["game-search-results"].innerHTML.includes("直接联网收集并分析")) errors.push("搜索无本地结果时缺少直接联网分析确认入口。");
if (kb.games[2]) {
  const compareSearchApp = runApp("system-gameplay", 2);
  const outside = kb.games[2];
  compareSearchApp.elements["game-search"].value = outside.canonicalName;
  compareSearchApp.elements["game-search"].oninput({ target: { value: outside.canonicalName } });
  compareSearchApp.elements["game-search-results"].onclick({ target: { closest() { return { dataset: { searchGame: outside.id } }; } } });
  if (compareSearchApp.elements.root.innerHTML.includes("comparison-only-view")) errors.push("对比状态搜索非对比产品后没有切回单产品状态。");
  if (compareSearchApp.elements["compare-count"].textContent !== 0) errors.push("对比状态搜索非对比产品后没有清空对比篮。");
}
if (errors.length) { console.error(errors.map((error) => `- ${error}`).join("\n")); process.exit(1); }
console.log(JSON.stringify({ games: 2, modulesTested: Object.keys(moduleTests), comparisonTablesPerModule: 1, toolbarStateTransition: true, localKnowledgeSearch: true, emptyKnowledgeResearchEntry: true, remoteResearchConfirmation: true, standaloneArtExport: true, storyTemplateApplied: Boolean(storyGame), layout: "dark-product-header-plus-metric-table", overviewMarketSignals: true, developmentTemplateSystems: templateCatalog.systems.length, status: "ok" }, null, 2));
