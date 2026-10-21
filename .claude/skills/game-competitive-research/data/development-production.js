(function (root) {
  "use strict";
  const arr = (value) => Array.isArray(value) ? value : [];
  const val = (value, fallback = "待确认") => value === null || value === undefined || value === "" ? fallback : String(value);
  const mdCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const PROFILES = {
    "logic-prototype": { label: "逻辑原型", objective: "验证核心循环、状态、规则与数据闭环。", placeholderAllowed: true, artScope: "原型最小交付", artRule: "核心操作所需UI线框、交互反馈、空间灰盒和可辨识占位必须交付；非核心正式资源只登记、不要求本档完成。", artCompletion: "可辨识、可交互、状态齐全，并醒目标注PLACEHOLDER；每个占位资源必须绑定后续替换任务。", artAcceptance: "不验收最终风格精度；验收信息层级、点击反馈、状态覆盖、镜头与空间关系是否支持玩法验证。", foundations: ["运行时配置与版本", "账号/档案/存档", "背包/货币/奖励/资产流水", "导航与应用生命周期", "埋点/日志/错误上报"] },
    "visual-vertical-slice": { label: "视觉切片", objective: "用代表性正式资源验证核心玩法、空间语法、镜头、场景构图和HUD边界。", placeholderAllowed: false, artScope: "代表性视觉切片", artRule: "核心场景、主角/核心对象、核心交互UI、关键动画/VFX/SFX和Style Frame必须达到目标质量；外围资源可登记为后续制作。", artCompletion: "核心路径使用最终质量或可作为最终质量基准的代表性资源，包含源文件、运行时文件、导入参数和状态变体。", artAcceptance: "按Style Frame、空间灰盒、构图、光影、材质、动效节奏和参考图并排验收；核心画面禁止卡片化占位。", foundations: ["运行时配置与版本", "账号/档案/存档", "背包/货币/奖励/资产流水", "导航与应用生命周期", "新手引导与功能解锁", "设置/本地化/音频", "埋点/日志/错误上报"] },
    "production-ready": { label: "生产开发", objective: "形成可进入完整开发的系统、数据、接口、美术、测试和任务规格包。", placeholderAllowed: false, artScope: "完整量产交付", artRule: "清单内UI、场景、角色、建筑、地块、道具、动画、特效、音频和技术资源全部进入正式生产与版本管理。", artCompletion: "全部资源具备批准的参考、负责人、排期、分层源文件、运行时格式、命名路径、状态变体、性能预算、版权记录和回退方案。", artAcceptance: "逐项通过视觉、功能、性能、兼容、版权和回归验收；任何核心资源缺失或仍为程序占位均阻塞发布。", foundations: ["运行时配置与版本", "账号/档案/存档", "背包/货币/奖励/资产流水", "导航与应用生命周期", "新手引导与功能解锁", "设置/本地化/音频", "埋点/日志/错误上报", "网络/幂等/异常恢复", "LiveOps/内容发布", "商业化/权益/支付安全"] },
  };
  const ART_SOURCES = {
    "supplied-or-commissioned": { label: "提供或委托制作", workflow: "由项目方提供或按已批准Style Frame委托制作；执行需求单→草图/白模→评审→精修→切图/绑定→引擎验收。", sourceDeliverable: "分层Figma/PSD、Blender/Maya工程、WAV工程及可追溯导出文件", license: "登记原创声明、委托合同、著作权归属和外包交付验收记录" },
    "ai-generated-bitmap": { label: "AI生成位图", workflow: "先锁定Style Frame，再生成候选图；记录模型/版本/提示词/seed，经过人工构图修正、拆层、补绘、状态扩展和引擎适配后方可使用。", sourceDeliverable: "生成记录、原始候选、人工修整分层源文件、最终导出与差异说明", license: "核验模型与训练服务商用条款，登记生成工具、人工修改责任人与内容风险审核" },
    "licensed": { label: "授权素材", workflow: "从批准素材库采购或取得授权，完成风格筛选、二次编辑、规格统一、性能适配和替换追踪。", sourceDeliverable: "原始授权包、购买凭证、修改工程、运行时文件和素材台账", license: "登记授权主体、项目/平台/地区/期限/席位/可修改与再分发范围" },
    "placeholder": { label: "占位资源", workflow: "仅用于逻辑原型；统一使用醒目占位标识和稳定asset_id，不得伪装成正式资源，必须建立替换任务。", sourceDeliverable: "低成本占位文件、用途说明、替换责任人与截止档位", license: "仅使用自制或可安全占位的资源；不得把来源不明素材带入项目" },
  };
  const REQUIRED = [["purpose", "系统目标"], ["entryConditions", "进入条件"], ["inputs", "输入"], ["rules", "规则"], ["states", "状态机"], ["outputs", "输出"], ["dependencies", "依赖"], ["uiFeedback", "UI反馈"], ["dataEntities", "数据实体"], ["analyticsEvents", "埋点"], ["edgeCases", "异常恢复"], ["acceptanceCriteria", "验收标准"]];
  const has = (system, key) => Array.isArray(system?.[key]) ? system[key].length > 0 : Boolean(system?.[key]);
  const normalize = (value) => String(value || "").replace(/系统$/u, "").replace(/[\s\-—–_·:：,，、/（）()]+/g, "").toLowerCase();
  function findTemplate(system, templates) {
    const explicit = String(system?.templateSystemId || "").toUpperCase();
    if (explicit) return arr(templates.systems).find((item) => item.id === explicit) || null;
    const hits = arr(templates.systems).filter((item) => [item.name, ...arr(item.matchTerms)].some((term) => normalize(term) === normalize(system?.name)));
    return hits.length === 1 ? hits[0] : null;
  }
  function field(fields, names, fallback = "") { for (const name of names) if (fields?.[name] !== undefined && fields[name] !== "") return String(fields[name]); return fallback; }
  function deliveryFor(row, profileId) {
    const type = String(row.sourceType || ""), isUi = /UI|HUD|界面/.test(type), isVisualCore = /世界空间|动画|特效|验收基准/.test(type);
    if (profileId === "logic-prototype") return isUi ? "本档必交｜线框/可辨识占位" : isVisualCore ? "本档必交｜灰盒/参考占位" : "后续档位｜本档仅登记需求";
    if (profileId === "visual-vertical-slice") return isUi || isVisualCore ? "本档必交｜代表性最终质量" : "本档选取P0代表资源｜其余后续量产";
    return "本档必交｜最终可发布资源";
  }
  function aiArtPrompt(row, resourceName, specification, visual) {
    const spatial = visual.spatialPresentation || {}, scene = visual.sceneArt || {}, composition = visual.mainInterfaceComposition || {};
    const output = /UI|HUD|界面/.test(String(row.sourceType || "")) ? "输出可拆分、可适配多分辨率的游戏UI资产，文字与数值使用可编辑占位，不生成品牌标识。" : /世界空间|场景|角色|建筑|地块/.test(`${row.sourceType} ${resourceName}`) ? "输出具备清晰前中后景、统一透视比例与可分层制作结构的场景/对象资产。" : "输出轮廓清晰、状态可扩展、便于游戏引擎导入和后续人工精修的资产。";
    return [`原创游戏美术资源生成任务。资源：${resourceName}。`, `所属系统：${row.systemName}；资源类型：${row.sourceType}。`, `功能与规格：${specification}。`, `美术方向：${val(scene.artDirection)}；材质与色彩：${val(scene.materialsAndPalette)}；光影：${val(scene.lightingAndShadow)}。`, `空间与镜头：${val(spatial.dimensionality)}，${val(spatial.camera)}，${val(spatial.projection)}；主界面构图：场景屏占比 ${val(composition.sceneScreenRatio)}，导航 ${val(composition.navigationPattern)}。`, output, "必须原创，不复制任何竞品角色、Logo、文字、专有建筑、地图或受保护素材；无水印、无签名、无乱码；生成后仍需人工拆层、补绘、状态扩展和版权审核。"].join(" ");
  }
  function artRows(systems, templates, visual, profileId, project) {
    const rows = [];
    systems.forEach((system) => {
      const template = findTemplate(system, templates);
      arr(template?.uiRows).forEach((row, index) => rows.push({ systemTemplateId: template.id, systemName: system.name, resourceIndex: index + 1, sourceType: "UI界面与元素", fields: { ...row } }));
      arr(template?.artRows).forEach((row, index) => rows.push({ systemTemplateId: template.id, systemName: system.name, resourceIndex: index + 1, sourceType: "美术/音频/技术资源", fields: { ...row } }));
    });
    const add = (sourceType, family, items, requirement) => arr(items).filter(Boolean).forEach((item, index) => rows.push({ systemTemplateId: "VISUAL", systemName: "核心玩法视觉表现", resourceIndex: index + 1, sourceType, fields: { "资源族/交付物": family, "内容": item, "制作与验收要求": requirement || "", "参考图ID": "待绑定" } }));
    const scene = visual.sceneArt || {}, composition = visual.mainInterfaceComposition || {}, acceptance = visual.visualAcceptance || {};
    add("世界空间资源", "场景资源族", scene.assetFamilies, [scene.perspectiveAndScale, scene.lightingAndShadow, scene.materialsAndPalette].filter(Boolean).join("；"));
    add("动画与特效", "动画状态", scene.animationStates, scene.environmentComposition);
    add("HUD与UI", "世界空间元素", composition.worldSpaceElements, composition.navigationPattern);
    add("HUD与UI", "屏幕空间元素", composition.screenSpaceElements, composition.sceneScreenRatio);
    add("验收基准", "Style Frame", acceptance.styleFrameRequirements, acceptance.reviewMethod);
    add("验收基准", "场景灰盒", acceptance.blockoutRequirements, acceptance.reviewMethod);
    const profile = PROFILES[profileId], policy = ART_SOURCES[project.artSourceMode] || ART_SOURCES["supplied-or-commissioned"];
    return rows.map((row, index) => {
      const originalSource = row.fields?.["资源来源"] || "";
      const resourceName = field(row.fields, ["资源", "界面/元素", "资源族/交付物", "内容", "asset_id"], `${row.sourceType}-${index + 1}`);
      const specification = field(row.fields, ["规格", "布局与元素", "制作与验收要求", "内容"], "需按系统用途补充尺寸、状态、动画和性能规格");
      return { ...row, resourceIndex: index + 1, fields: { ...row.fields, "资源名称": resourceName, "规格/用途": specification, "本档交付": deliveryFor(row, profileId), "制作来源策略": policy.label, "模型提示词": project.artSourceMode === "ai-generated-bitmap" ? aiArtPrompt(row, resourceName, specification, visual) : "", "来源执行要求": policy.workflow, "来源交付物": policy.sourceDeliverable, "资源来源": policy.label, "母版来源提示": originalSource, "程序生成许可": profile.placeholderAllowed ? "仅原型占位允许，必须标识并绑定替换任务" : "核心场景/UI/角色禁止程序占位", "制作状态": row.fields?.["制作状态"] || "未制作", "负责人": row.fields?.["负责人"] || "待分配", "版权/授权": policy.license, "参考图ID": row.fields?.["参考图ID"] || "待绑定", "源文件格式": row.fields?.["源文件格式"] || policy.sourceDeliverable, "运行时格式": row.fields?.["运行时格式"] || `由${project.engine}导入规范和${project.platform}性能预算确定`, "完成定义": profile.artCompletion, "验收标准": field(row.fields, ["制作与验收要求", "规格", "必备状态"], profile.artAcceptance) } };
    });
  }
  function resourceMarkdown(resources, profile, policy) {
    const includePrompt = policy.label === "AI生成位图", rows = resources.map((row) => ({ id: `${row.systemTemplateId}-${row.resourceIndex}`, system: row.systemName, type: row.sourceType, name: row.fields["资源名称"], spec: row.fields["规格/用途"], delivery: row.fields["本档交付"], source: row.fields["制作来源策略"], prompt: row.fields["模型提示词"], acceptance: row.fields["验收标准"] })), columns = includePrompt ? ["ID", "系统", "类型", "资源/界面", "规格与用途", "本档交付", "制作来源", "模型提示词", "验收"] : ["ID", "系统", "类型", "资源/界面", "规格与用途", "本档交付", "制作来源", "验收"], keys = includePrompt ? ["id", "system", "type", "name", "spec", "delivery", "source", "prompt", "acceptance"] : ["id", "system", "type", "name", "spec", "delivery", "source", "acceptance"];
    return [`- 本档美术范围：${profile.artScope}`, `- 交付规则：${profile.artRule}`, `- 完成定义：${profile.artCompletion}`, `- 档位验收：${profile.artAcceptance}`, `- 制作来源：${policy.label}`, `- 来源流程：${policy.workflow}`, `- 来源交付：${policy.sourceDeliverable}`, `- 版权要求：${policy.license}`, `- 资源总数：${rows.length}（完整总表；“本档交付”列决定当前档位实际制作范围）`, "", `| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${keys.map((key) => mdCell(row[key])).join(" | ")} |`)].join("\n");
  }
  function build(game, snapshot, templates, options) {
    const profileId = PROFILES[options?.profile] ? options.profile : "production-ready", profile = PROFILES[profileId];
    const systems = arr(snapshot?.systemGameplay?.systems).filter((system) => system?.templateMatch?.status === "confirmed" || arr(system?.evidenceIds).length > 0);
    const visual = snapshot?.systemGameplay?.visualPresentation || {};
    const project = { engine: options?.engine || "待确认", platform: options?.platform || "待确认", topology: options?.topology || "待确认", saveMode: options?.saveMode || "待确认", artSourceMode: options?.artSourceMode || (profile.placeholderAllowed ? "placeholder" : "supplied-or-commissioned"), assetReferencesApproved: options?.assetReferencesApproved === true, schemaReviewed: options?.schemaReviewed === true };
    const policy = ART_SOURCES[project.artSourceMode] || ART_SOURCES["supplied-or-commissioned"];
    const checks = systems.map((system) => { const missing = REQUIRED.filter(([key]) => !has(system, key)).map(([, label]) => label); return { scope: system.name, type: "竞品系统", status: missing.length ? "blocked" : "pass", missing, source: "competitor-confirmed" }; });
    profile.foundations.forEach((name) => checks.push({ scope: name, type: "项目基础设施", status: "target-added", missing: [], source: "project-baseline" }));
    const configMissing = ["engine", "platform", "topology", "saveMode"].filter((key) => !project[key] || project[key] === "待确认");
    checks.push({ scope: "目标项目配置", type: "架构闸门", status: configMissing.length ? "blocked" : "pass", missing: configMissing, source: "target-decision" });
    const visualMissing = [];
    if (!visual.spatialPresentation?.dimensionality) visualMissing.push("空间维度");
    if (!visual.spatialPresentation?.camera) visualMissing.push("镜头语法");
    if (!visual.sceneArt?.artDirection) visualMissing.push("场景美术方向");
    if (!arr(visual.visualAcceptance?.styleFrameRequirements).length) visualMissing.push("Style Frame");
    if (!arr(visual.visualAcceptance?.blockoutRequirements).length) visualMissing.push("场景灰盒");
    if (!profile.placeholderAllowed && project.artSourceMode === "placeholder") visualMissing.push("当前档位禁止占位资源");
    if (!profile.placeholderAllowed && !project.assetReferencesApproved) visualMissing.push("正式资源参考图尚未绑定或批准");
    checks.push({ scope: "核心玩法视觉合同", type: "美术闸门", status: visualMissing.length ? "blocked" : "pass", missing: visualMissing, source: "competitor-adapted" });
    const tables = [];
    systems.forEach((system) => { const template = findTemplate(system, templates); arr(template?.sections?.D?.rows || template?.schemaRows).forEach((row) => tables.push({ source: template?.id || "UNMATCHED", table: row["表"], field: row["字段"], type: row["类型"], constraint: row["校验/外键"], authority: row["归属"] })); });
    const resources = artRows(systems, templates, visual, profileId, project);
    checks.push({ scope: "美术资源清单", type: "美术交付", status: resources.length ? "target-added" : "blocked", missing: resources.length ? [] : ["没有生成UI、场景、动画、音频或技术资源需求"], source: "profile-adapted" });
    checks.push({ scope: "统一数据模型", type: "数据闸门", status: project.schemaReviewed ? "pass" : "blocked", missing: project.schemaReviewed ? [] : ["主外键/索引/复合字段/迁移方案尚未完成技术评审"], source: "generated-draft" });
    const blocked = checks.filter((check) => check.status === "blocked");
    const lines = [`# ${game.canonicalName} · 目标游戏生产开发文档`, "", "## 1. 输出档位与实施状态", "", `- 档位：${profile.label}`, `- 档位目标：${profile.objective}`, `- 状态：${blocked.length ? "BLOCKED（缺口关闭前不得宣称可直接实施）" : "READY"}`, `- 引擎：${project.engine}`, `- 平台：${project.platform}`, `- 网络拓扑：${project.topology}`, `- 存档模式：${project.saveMode}`, `- 美术来源：${policy.label}`, "", "## 2. 完整性闸门", "", "| 范围 | 类型 | 状态 | 缺口 | 来源状态 |", "| --- | --- | --- | --- | --- |", ...checks.map((check) => `| ${check.scope} | ${check.type} | ${check.status} | ${check.missing.join("、") || "无"} | ${check.source} |`), "", "## 3. 本档交付边界", "", `- 美术范围：${profile.artScope}`, `- 美术规则：${profile.artRule}`, `- 完成定义：${profile.artCompletion}`, `- 验收要求：${profile.artAcceptance}`, "", "## 4. 系统架构", "", ...profile.foundations.map((name) => `- [项目基础设施] ${name}`), ...systems.map((system) => `- [竞品证实] ${system.name}：${val(system.purpose)}`), "", "## 5. 统一数据模型", "", `已汇总 ${new Set(tables.map((row) => row.table).filter(Boolean)).size} 张表、${tables.length} 条字段规格。AI JSON包含完整字段清单；CLI开发包另含 schema.sql、JSON Schema、TypeScript类型和种子数据。`, "", "| 来源 | 表 | 字段 | 类型 | 约束 | 权威端 |", "| --- | --- | --- | --- | --- | --- |", ...tables.slice(0, 160).map((row) => `| ${val(row.source)} | ${val(row.table)} | ${val(row.field)} | ${val(row.type)} | ${val(row.constraint)} | ${val(row.authority)} |`), "", "## 6. 核心玩法视觉与美术生产闸门", "", `- 空间：${val(visual.spatialPresentation?.dimensionality)}；${val(visual.spatialPresentation?.camera)}；${val(visual.spatialPresentation?.projection)}`, `- 场景：${val(visual.sceneArt?.artDirection)}；${arr(visual.sceneArt?.assetFamilies).join("、") || "待确认"}`, `- 构图：场景屏占比 ${val(visual.mainInterfaceComposition?.sceneScreenRatio)}；HUD ${arr(visual.mainInterfaceComposition?.hudSafeZones).join("、") || "待确认"}`, `- 一票否决：${arr(visual.visualAcceptance?.rejectionCriteria).join("；") || "待确认"}`, `- ${profile.placeholderAllowed ? "原型占位必须明显标识并绑定正式资源替换任务。" : "禁止用CSS、Canvas或代码几何体替代核心场景、角色、建筑、地块和关键UI。"}`, "- Style Frame和场景灰盒未通过前，不得进入正式UI和批量资源制作。", "", "## 7. 系统详细规格", ""];
    systems.forEach((system, index) => { const template = findTemplate(system, templates); lines.push(`### 8.${index + 1} ${system.name}`, `- 来源：竞品证实；证据ID ${arr(system.evidenceIds).join("、") || "未记录"}`, `- 目标：${val(system.purpose)}`, `- 进入：${arr(system.entryConditions).join("；") || "待确认"}`, `- 输入：${arr(system.inputs).join("；") || "待确认"}`, `- 规则：${arr(system.rules).join("；") || "待确认"}`, `- 状态：${arr(system.states).join("；") || template?.stateFlow || "待确认"}`, `- 输出：${arr(system.outputs).join("；") || "待确认"}`, `- 依赖：${arr(system.dependencies).join("；") || "待确认"}`, `- 数据实体：${arr(system.dataEntities).join("；") || "待确认"}`, `- 异常恢复：${[...arr(system.edgeCases), ...arr(system.risks)].join("；") || "待确认"}`, `- 验收：${arr(system.acceptanceCriteria).join("；") || template?.acceptance || "待确认"}`, ""); });
    lines.push("## 8. 分阶段实施", "", "1. M0：项目架构、Schema与Style Frame", "2. M1：空间灰盒与代表性正式资源", "3. M2：核心循环纵向打通", "4. M3：外围系统集成", "5. M4：商业化、存档与恢复", "6. M5：功能、视觉、性能和回归验收", "", "不得一次性让AI实现全部系统；每阶段通过退出条件后再进入下一阶段。", "", "## 9. 美术资源需求总表", "", resourceMarkdown(resources, profile, policy), "", "## 10. 实施约束", "", "- 不得把母版基线描述为竞品事实。", "- 不得复制竞品名称、角色、剧情、美术、地图、音频、专有数值或活动内容。", "- 所有BLOCKED项关闭前，不得将本开发包标记为可直接生产。", "- 不得一次性让AI实现全部系统；必须按M0-M5逐阶段验收。");
    return { markdown: lines.join("\n"), manifest: { packageVersion: "2.1.0", gameId: game.id, sourceVersionId: snapshot.versionId, profile: { id: profileId, ...profile }, projectConfig: { ...project, artSourcePolicy: policy }, implementationGate: { status: blocked.length ? "blocked" : "ready", blockers: blocked }, competitorSystems: systems, projectFoundations: profile.foundations, schemaRows: tables, artResourceList: resources, milestones: ["M0", "M1", "M2", "M3", "M4", "M5"] }, artRows: resources, checks, tables };
  }
  root.GameDevelopmentPackage = { PROFILES, ART_SOURCES, build };
})(typeof window !== "undefined" ? window : globalThis);
