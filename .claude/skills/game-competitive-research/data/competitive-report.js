(function (root) {
  "use strict";
  const arr = (value) => Array.isArray(value) ? value : [];
  const value = (input, fallback = "待收集") => input === null || input === undefined || input === "" ? fallback : String(input);
  const cell = (input) => String(input ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const table = (columns, rows) => `| ${columns.map(cell).join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |${rows.length ? `\n${rows.map((row) => `| ${columns.map((column) => cell(row[column])).join(" | ")} |`).join("\n")}` : ""}`;
  const named = (items) => arr(items).map((item) => typeof item === "string" ? item : item?.name || item?.type || item?.metric || "").filter(Boolean).join("、") || "待收集";
  const lines = (items, fallback = "暂无记录") => arr(items).map((item) => typeof item === "string" ? item : item?.name ? `${item.name}${item.type ? `（${item.type}）` : ""}${item.mechanism ? `：${item.mechanism}` : ""}` : JSON.stringify(item)).join("；") || fallback;
  const loop = (input) => arr(input?.steps).map((step, index) => `${index + 1}. ${typeof step === "string" ? step : JSON.stringify(step)}`).join("\n") || "待收集";
  const metric = (item) => item ? `${value(item.value)}${item.unit || item.currency ? ` ${item.unit || item.currency}` : ""}` : "待收集";
  const latestBy = (items, key) => [...arr(items)].sort((a, b) => String(b?.[key] || "").localeCompare(String(a?.[key] || "")))[0] || null;
  const listValue = (items, fallback = "待收集") => arr(items).map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean).join("、") || fallback;
  const layerLabels = { core: "核心玩法", progression: "成长", content: "内容", economy: "经济", social: "社交", liveOps: "长线运营", monetization: "商业化", unknown: "待确认" };
  const systemRows = (snapshot) => arr(snapshot?.systemGameplay?.systems).map((system) => ({
    "系统": `**${value(system.name)}**\n层级：${layerLabels[system.layer] || value(system.layer)}`,
    "目标与规则": `目标：${value(system.purpose)}\n规则：${listValue(system.rules)}`,
    "输入、输出与依赖": `输入：${listValue(system.inputs)}\n输出：${listValue(system.outputs)}\n依赖：${listValue(system.dependencies)}\n反馈：${listValue(system.uiFeedback)}`,
  }));
  const systemSummary = (snapshot) => {
    const systems = arr(snapshot?.systemGameplay?.systems);
    return systems.length ? systems.map((system) => [
      `• **${value(system.name)}**`,
      `　目标：${value(system.purpose)}`,
      `　规则：${listValue(system.rules)}`,
      `　依赖：${listValue(system.dependencies)}`,
    ].join("\n")).join("\n") : "待收集";
  };
  const visualRows = (snapshot) => {
    const visual = snapshot?.systemGameplay?.visualPresentation || {};
    return [
      { "视觉模块": "空间表现", "竞品表现": `维度：${value(visual.spatialPresentation?.dimensionality)}\n镜头：${value(visual.spatialPresentation?.camera)}\n投影：${value(visual.spatialPresentation?.projection)}`, "验收关注": `深度排序：${value(visual.spatialPresentation?.depthOrdering)}\n遮挡：${value(visual.spatialPresentation?.occlusion)}` },
      { "视觉模块": "场景美术", "竞品表现": `方向：${value(visual.sceneArt?.artDirection)}\n资源族：${listValue(visual.sceneArt?.assetFamilies)}\n材质色彩：${value(visual.sceneArt?.materialsAndPalette)}`, "验收关注": `比例透视：${value(visual.sceneArt?.perspectiveAndScale)}\n光影：${value(visual.sceneArt?.lightingAndShadow)}` },
      { "视觉模块": "主界面构图", "竞品表现": `场景屏占比：${value(visual.mainInterfaceComposition?.sceneScreenRatio)}\n导航：${value(visual.mainInterfaceComposition?.navigationPattern)}`, "验收关注": `HUD安全区：${listValue(visual.mainInterfaceComposition?.hudSafeZones)}\n负面约束：${listValue(visual.mainInterfaceComposition?.negativeConstraints)}` },
      { "视觉模块": "视觉验收", "竞品表现": `相似度目标：${listValue(visual.visualAcceptance?.similarityTargets)}`, "验收关注": `否决项：${listValue(visual.visualAcceptance?.rejectionCriteria)}\n评审：${value(visual.visualAcceptance?.reviewMethod)}` },
    ];
  };
  const visualSummary = (snapshot) => {
    const visual = snapshot?.systemGameplay?.visualPresentation || {};
    return [
      `• **空间表现**\n　维度：${value(visual.spatialPresentation?.dimensionality)}\n　镜头/投影：${value(visual.spatialPresentation?.camera)}；${value(visual.spatialPresentation?.projection)}`,
      `• **场景美术**\n　方向：${value(visual.sceneArt?.artDirection)}\n　资源族：${listValue(visual.sceneArt?.assetFamilies)}`,
      `• **主界面构图**\n　场景屏占比：${value(visual.mainInterfaceComposition?.sceneScreenRatio)}\n　导航：${value(visual.mainInterfaceComposition?.navigationPattern)}`,
      `• **视觉验收**\n　目标：${listValue(visual.visualAcceptance?.similarityTargets)}\n　否决项：${listValue(visual.visualAcceptance?.rejectionCriteria)}`,
    ].join("\n");
  };
  const audience = (snapshot) => {
    const target = snapshot?.basic?.targetAudience || {};
    return [target.summary, arr(target.segments).join("、"), arr(target.ageRanges).length ? `年龄 ${target.ageRanges.join("、")}` : "", target.genderTendency ? `性别 ${target.genderTendency}` : "", arr(target.motivations).length ? `动机 ${target.motivations.join("、")}` : "", arr(target.spendingProfiles).length ? `付费 ${target.spendingProfiles.join("、")}` : ""].filter(Boolean).join("；") || "待收集";
  };
  const sourceLines = (item) => arr(item.snapshot?.sources).map((source) => `- [${source.title}](${source.url}) · ${source.publisher || source.sourceType || "来源未标"} · 访问 ${source.accessedAt || "时间未标"}`).join("\n") || "- 暂无来源";
  const overviewValue = (snapshot, kind) => {
    const basic = snapshot?.basic || {};
    if (kind === "identity") return `开发商：${value(basic.developer)}\n发行商：${value(basic.publisher)}`;
    if (kind === "genre") return `类型：${arr(basic.genres).join("、") || "待收集"}\n平台：${arr(basic.platforms).join("、") || "待收集"}\n地区：${arr(basic.regions).join("、") || "待收集"}`;
    if (kind === "status") return `上线：${value(basic.releaseDate)}\n状态：${value(basic.status)}\n模式：${value(basic.businessModel)}\n版本：${value(basic.currentVersion)}`;
    if (kind === "revenue") { const item = latestBy(basic.stageRevenue, "period"); return item ? `${metric(item)}\n${value(item.period)} · ${value(item.scope)}` : "未获得可靠公开数据"; }
    if (kind === "dau") { const item = latestBy(basic.dailyActiveUsers, "asOf") || arr(basic.basicMetrics).find((entry) => /日活|DAU/i.test(String(entry?.name || ""))); return item ? `${metric(item)}\n${value(item.asOf)} · ${value(item.scope)}` : "未获得可靠公开数据"; }
    return "待收集";
  };
  function singleReport(item) {
    const { game, snapshot } = item, basic = snapshot.basic || {}, sg = snapshot.systemGameplay || {}, commercial = snapshot.commercialization || {}, community = snapshot.community || {};
    const revenue = latestBy(basic.stageRevenue, "period"), dau = latestBy(basic.dailyActiveUsers, "asOf") || arr(basic.basicMetrics).find((entry) => /日活|DAU/i.test(String(entry?.name || "")));
    const overviewRows = [
      { "项目": "产品定位", "内容": value(basic.summary) },
      { "项目": "开发与发行", "内容": overviewValue(snapshot, "identity") },
      { "项目": "品类与市场", "内容": overviewValue(snapshot, "genre") },
      { "项目": "发行与运营", "内容": overviewValue(snapshot, "status") },
      { "项目": "目标人群", "内容": audience(snapshot) },
    ];
    if (revenue) overviewRows.push({ "项目": "阶段流水", "内容": overviewValue(snapshot, "revenue") });
    if (dau) overviewRows.push({ "项目": "日活用户", "内容": overviewValue(snapshot, "dau") });
    const coreRows = [
      { "模块": "核心玩法原型", "内容": `主核心：${value(sg.taxonomy?.mainCorePrototype)}\n副核心：${listValue(sg.taxonomy?.secondaryCorePrototypes)}` },
      { "模块": "玩家驱动力", "内容": `动机：${listValue(sg.playerMotivation)}\n主要操作：${listValue(sg.coreGameplay?.primaryActions)}\n主要决策：${listValue(sg.coreGameplay?.primaryDecisions)}` },
      { "模块": "核心循环", "内容": loop(sg.coreLoop) },
      { "模块": "Meta Loop", "内容": loop(sg.metaLoop) },
    ];
    const systems = systemRows(snapshot);
    return `# ${game.canonicalName} · 竞品分析报告\n\n> 数据版本：${snapshot.coverage?.to || snapshot.collectedAt || "未标时间"} · ${snapshot.collectionMode === "incremental" ? "增量采集" : "全量采集"}\n\n## 执行摘要\n\n${value(basic.summary)}\n\n- 核心玩法：${value(sg.taxonomy?.mainCorePrototype)}\n- 核心人群：${audience(snapshot)}\n- 商业模式：${value(basic.businessModel)}\n- 证据来源：${arr(snapshot.sources).length} 条\n\n## 1. 产品总览\n\n${table(["项目", "内容"], overviewRows)}\n\n## 2. 系统与玩法\n\n### 2.1 核心原型与循环\n\n${table(["模块", "内容"], coreRows)}\n\n### 2.2 主要系统\n\n${systems.length ? table(["系统", "目标与规则", "输入、输出与依赖"], systems) : "待收集"}\n\n### 2.3 空间与视觉表现\n\n${table(["视觉模块", "竞品表现", "验收关注"], visualRows(snapshot))}\n\n## 3. 商业化与运营活动\n\n- 付费点：${named(commercial.paymentPoints)}\n- 价格档位：${commercial.priceTierSummary?.count ?? "待收集"} 档；${commercial.priceTierSummary?.min ?? "—"}–${commercial.priceTierSummary?.max ?? "—"} ${commercial.priceTierSummary?.currency || ""}\n- 更新节奏：小更新 ${commercial.updateCadence?.minorDays ?? "—"} 天；大版本 ${commercial.updateCadence?.majorDays ?? "—"} 天；赛季 ${commercial.updateCadence?.seasonDays ?? "—"} 天\n- 常规活动：${lines(commercial.regularActivities)}\n- 主题活动：${lines(commercial.themedActivities)}\n- 观察：${lines(commercial.observations)}\n\n## 4. 社区运营\n\n- 渠道：${arr(community.channels).map((channel) => `${channel.name}（${channel.role || "角色待收集"}）`).join("、") || "待收集"}\n- 常规活动：${lines(community.regularActivities)}\n- 特殊活动：${lines(community.specialActivities)}\n- 观察：${lines(community.observations)}\n\n## 5. 关键观察与证据缺口\n\n### 关键观察\n\n${[...arr(sg.designObservations), ...arr(commercial.observations), ...arr(community.observations)].map((entry) => `- ${typeof entry === "string" ? entry : JSON.stringify(entry)}`).join("\n") || "- 暂无记录"}\n\n### 证据缺口\n\n${[...arr(basic.evidenceGaps), ...arr(sg.evidenceGaps), ...arr(commercial.evidenceGaps), ...arr(community.evidenceGaps)].map((entry) => `- ${entry}`).join("\n") || "- 暂无记录"}\n\n## 6. 证据来源\n\n${sourceLines(item)}\n`;
  }
  function comparisonReport(items) {
    const [left, right] = items, columns = ["对比项", left.game.canonicalName, right.game.canonicalName];
    const row = (label, getter) => ({ "对比项": label, [left.game.canonicalName]: getter(left), [right.game.canonicalName]: getter(right) });
    const overview = [
      row("产品定位", (item) => value(item.snapshot.basic?.summary)), row("开发与发行", (item) => overviewValue(item.snapshot, "identity")), row("类型、平台与地区", (item) => overviewValue(item.snapshot, "genre")), row("上线、版本与商业模式", (item) => overviewValue(item.snapshot, "status")), row("目标人群", (item) => audience(item.snapshot)),
    ];
    if (items.some((item) => arr(item.snapshot.basic?.stageRevenue).length)) overview.push(row("阶段流水", (item) => overviewValue(item.snapshot, "revenue")));
    if (items.some((item) => arr(item.snapshot.basic?.dailyActiveUsers).length || arr(item.snapshot.basic?.basicMetrics).some((entry) => /日活|DAU/i.test(String(entry?.name || ""))))) overview.push(row("日活用户", (item) => overviewValue(item.snapshot, "dau")));
    const gameplay = [row("核心玩法原型", (item) => `${value(item.snapshot.systemGameplay?.taxonomy?.mainCorePrototype)}\n副核心：${arr(item.snapshot.systemGameplay?.taxonomy?.secondaryCorePrototypes).join("、") || "待收集"}`), row("玩家动机", (item) => arr(item.snapshot.systemGameplay?.playerMotivation).join("、") || "待收集"), row("核心循环", (item) => loop(item.snapshot.systemGameplay?.coreLoop)), row("Meta Loop", (item) => loop(item.snapshot.systemGameplay?.metaLoop)), row("主要系统", (item) => systemSummary(item.snapshot)), row("空间与视觉表现", (item) => visualSummary(item.snapshot))];
    const commercial = [row("商业模式", (item) => value(item.snapshot.basic?.businessModel)), row("付费点", (item) => named(item.snapshot.commercialization?.paymentPoints)), row("更新与赛季节奏", (item) => { const cadence = item.snapshot.commercialization?.updateCadence || {}; return `小更新 ${cadence.minorDays ?? "—"} 天\n大版本 ${cadence.majorDays ?? "—"} 天\n赛季 ${cadence.seasonDays ?? "—"} 天`; }), row("常规商业化活动", (item) => lines(item.snapshot.commercialization?.regularActivities)), row("主题活动", (item) => lines(item.snapshot.commercialization?.themedActivities))];
    const community = [row("社区渠道", (item) => arr(item.snapshot.community?.channels).map((channel) => `${channel.name}：${channel.role || "待收集"}`).join("\n") || "待收集"), row("常规社区活动", (item) => lines(item.snapshot.community?.regularActivities)), row("特殊社区活动", (item) => lines(item.snapshot.community?.specialActivities)), row("社区观察", (item) => lines(item.snapshot.community?.observations))];
    const gaps = [row("证据缺口", (item) => [...arr(item.snapshot.basic?.evidenceGaps), ...arr(item.snapshot.systemGameplay?.evidenceGaps), ...arr(item.snapshot.commercialization?.evidenceGaps), ...arr(item.snapshot.community?.evidenceGaps)].join("\n") || "暂无记录")];
    const dates = items.map((item) => item.snapshot.coverage?.to || item.snapshot.collectedAt || "未标时间");
    return `# ${left.game.canonicalName} × ${right.game.canonicalName} · 竞品对比分析报告\n\n> 对比版本：${left.game.canonicalName} ${dates[0]}；${right.game.canonicalName} ${dates[1]}。${dates[0] === dates[1] ? "覆盖日期一致，仍需核对指标口径。" : "覆盖日期不同，时点指标不可直接视为同期数据。"}\n\n## 执行摘要\n\n- ${left.game.canonicalName}：${value(left.snapshot.basic?.summary)}\n- ${right.game.canonicalName}：${value(right.snapshot.basic?.summary)}\n- 本报告严格按已采集证据横向排版；缺失数据保留为“待收集”或“未获得可靠公开数据”。\n\n## 1. 产品总览对比\n\n${table(columns, overview)}\n\n## 2. 系统与玩法对比\n\n${table(columns, gameplay)}\n\n## 3. 商业化活动对比\n\n${table(columns, commercial)}\n\n## 4. 社区运营对比\n\n${table(columns, community)}\n\n## 5. 证据缺口\n\n${table(columns, gaps)}\n\n## 6. 证据来源\n\n### ${left.game.canonicalName}\n\n${sourceLines(left)}\n\n### ${right.game.canonicalName}\n\n${sourceLines(right)}\n`;
  }
  function build(items) {
    const selected = arr(items).filter((item) => item?.game && item?.snapshot).slice(0, 2);
    if (!selected.length) return { title: "竞品分析报告", markdown: "# 竞品分析报告\n\n暂无可导出的游戏。", mode: "empty" };
    return selected.length === 1 ? { title: `${selected[0].game.canonicalName} · 竞品分析报告`, markdown: singleReport(selected[0]), mode: "single" } : { title: `${selected[0].game.canonicalName} × ${selected[1].game.canonicalName} · 竞品对比分析报告`, markdown: comparisonReport(selected), mode: "comparison" };
  }
  root.GameCompetitiveReport = { build };
})(typeof window !== "undefined" ? window : globalThis);
