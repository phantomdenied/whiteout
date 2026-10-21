import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { writeJson, writeText } from "./lib.mjs";
import { artResourceCsv, buildArtResourceRows, selectStoryDevelopmentTemplate } from "./story-template-lib.mjs";
import { selectDevelopmentTemplates } from "./template-lib.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const text = (value, fallback = "待确认") => value === null || value === undefined || value === "" ? fallback : String(value);
const mdCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const mdTable = (columns, rows) => `| ${columns.map(mdCell).join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |${rows.length ? `\n${rows.map((row) => `| ${columns.map((column) => mdCell(row[column])).join(" | ")} |`).join("\n")}` : ""}`;
const csv = (columns, rows) => `\uFEFF${[columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;

export const BUILD_PROFILES = {
  "logic-prototype": {
    label: "逻辑原型",
    objective: "验证核心循环、状态、规则与数据闭环；允许带明显标识的临时占位资源。",
    placeholderAllowed: true,
    artScope: "原型最小交付",
    artRule: "核心操作所需UI线框、交互反馈、空间灰盒和可辨识占位必须交付；非核心正式资源只登记、不要求本档完成。",
    artCompletion: "可辨识、可交互、状态齐全，并醒目标注PLACEHOLDER；每个占位资源必须绑定后续替换任务。",
    artAcceptance: "验收信息层级、点击反馈、状态覆盖、镜头与空间关系，不验收最终风格精度。",
    requiredFoundations: ["F01", "F02", "F03", "F04", "F07"],
  },
  "visual-vertical-slice": {
    label: "视觉切片",
    objective: "用代表性正式资源验证核心玩法、空间语法、镜头、场景构图和HUD边界。",
    placeholderAllowed: false,
    artScope: "代表性视觉切片",
    artRule: "核心场景、主角/核心对象、核心交互UI、关键动画/VFX/SFX和Style Frame必须达到目标质量；外围资源可登记为后续制作。",
    artCompletion: "核心路径使用最终质量或可作为最终质量基准的代表性资源，包含源文件、运行时文件、导入参数和状态变体。",
    artAcceptance: "按Style Frame、空间灰盒、构图、光影、材质、动效节奏和参考图并排验收；核心画面禁止卡片化占位。",
    requiredFoundations: ["F01", "F02", "F03", "F04", "F05", "F06", "F07"],
  },
  "production-ready": {
    label: "生产开发",
    objective: "形成可进入完整开发的系统、数据、接口、美术、测试和任务规格包。",
    placeholderAllowed: false,
    artScope: "完整量产交付",
    artRule: "清单内UI、场景、角色、建筑、地块、道具、动画、特效、音频和技术资源全部进入正式生产与版本管理。",
    artCompletion: "全部资源具备批准的参考、负责人、排期、分层源文件、运行时格式、命名路径、状态变体、性能预算、版权记录和回退方案。",
    artAcceptance: "逐项通过视觉、功能、性能、兼容、版权和回归验收；任何核心资源缺失或仍为程序占位均阻塞发布。",
    requiredFoundations: ["F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10"],
  },
};

export const ART_SOURCE_POLICIES = {
  "supplied-or-commissioned": { label: "提供或委托制作", workflow: "需求单→草图/白模→评审→精修→切图/绑定→引擎验收", sourceDeliverable: "分层Figma/PSD、Blender/Maya工程、WAV工程及可追溯导出文件", license: "原创声明、委托合同、著作权归属和外包验收记录" },
  "ai-generated-bitmap": { label: "AI生成位图", workflow: "Style Frame锁定→候选生成→记录模型/版本/提示词/seed→人工构图修正/拆层/补绘→状态扩展→引擎适配", sourceDeliverable: "生成记录、原始候选、人工修整分层源文件、最终导出与差异说明", license: "模型与服务商用条款、生成工具、人工修改责任人与内容风险审核记录" },
  licensed: { label: "授权素材", workflow: "授权采购→风格筛选→二次编辑→规格统一→性能适配→替换追踪", sourceDeliverable: "原始授权包、购买凭证、修改工程、运行时文件和素材台账", license: "授权主体、项目/平台/地区/期限/席位/可修改与再分发范围" },
  placeholder: { label: "占位资源", workflow: "仅逻辑原型使用→醒目标识→稳定asset_id→建立正式资源替换任务", sourceDeliverable: "占位文件、用途说明、替换责任人与截止档位", license: "仅使用自制或可安全占位资源，禁止来源不明素材" },
};

const FOUNDATIONS = [
  { id: "F01", name: "运行时配置与版本系统", purpose: "加载、校验、灰度和回滚配置与资源清单。", dependsOn: [], tables: [
    ["cfg_feature_switch", "feature_key", "varchar(96)", "PK", "功能开关键"],
    ["cfg_feature_switch", "enabled", "boolean", "NOT NULL DEFAULT false", "开关状态"],
    ["cfg_schema_version", "schema_name", "varchar(96)", "PK", "Schema名称"],
    ["cfg_schema_version", "version", "integer", "NOT NULL", "当前版本"],
  ]},
  { id: "F02", name: "账号、档案与存档系统", purpose: "提供玩家身份、档案、存档槽、版本迁移与恢复。", dependsOn: ["F01"], tables: [
    ["player_profile", "uid", "varchar(64)", "PK", "玩家唯一ID"],
    ["player_profile", "display_name", "varchar(96)", "NOT NULL", "展示名"],
    ["player_save", "uid", "varchar(64)", "PK/FK player_profile.uid", "玩家ID"],
    ["player_save", "schema_version", "integer", "NOT NULL", "存档结构版本"],
    ["player_save", "payload", "json", "NOT NULL", "版本化存档载荷"],
    ["player_save", "updated_at", "timestamp", "NOT NULL", "更新时间"],
  ]},
  { id: "F03", name: "背包、货币、奖励与资产流水", purpose: "统一处理物品、货币、奖励、扣除、幂等和审计。", dependsOn: ["F02"], tables: [
    ["cfg_item", "item_id", "varchar(96)", "PK", "物品配置ID"],
    ["player_inventory", "uid", "varchar(64)", "PK/FK player_profile.uid", "玩家ID"],
    ["player_inventory", "item_id", "varchar(96)", "PK/FK cfg_item.item_id", "物品ID"],
    ["player_inventory", "quantity", "bigint", "NOT NULL DEFAULT 0 CHECK >= 0", "数量"],
    ["asset_ledger", "transaction_id", "varchar(64)", "PK", "幂等事务ID"],
    ["asset_ledger", "uid", "varchar(64)", "INDEX", "玩家ID"],
    ["asset_ledger", "delta", "bigint", "NOT NULL", "资产变化"],
    ["asset_ledger", "reason_code", "varchar(96)", "NOT NULL", "原因码"],
  ]},
  { id: "F04", name: "导航、页面栈与应用生命周期", purpose: "统一入口、加载、返回、前后台切换和场景生命周期。", dependsOn: ["F01"], tables: [] },
  { id: "F05", name: "新手引导与功能解锁", purpose: "提供引导步骤、解锁条件、跳过与恢复。", dependsOn: ["F02", "F04"], tables: [
    ["cfg_tutorial_step", "step_id", "varchar(96)", "PK", "引导步骤"],
    ["player_tutorial", "uid", "varchar(64)", "PK", "玩家ID"],
    ["player_tutorial", "step_id", "varchar(96)", "NOT NULL", "当前步骤"],
    ["player_tutorial", "state", "varchar(24)", "NOT NULL", "状态"],
  ]},
  { id: "F06", name: "设置、本地化与音频", purpose: "统一语言、音量、性能档位、无障碍和设备偏好。", dependsOn: ["F02"], tables: [
    ["player_setting", "uid", "varchar(64)", "PK", "玩家ID"],
    ["player_setting", "settings", "json", "NOT NULL", "版本化设置"],
  ]},
  { id: "F07", name: "埋点、日志与错误上报", purpose: "形成可追踪的漏斗、性能、异常和验收证据。", dependsOn: ["F01"], tables: [
    ["analytics_event", "event_id", "varchar(64)", "PK", "事件ID"],
    ["analytics_event", "uid", "varchar(64)", "INDEX", "玩家ID"],
    ["analytics_event", "event_name", "varchar(96)", "INDEX", "事件名"],
    ["analytics_event", "payload", "json", "NOT NULL", "事件参数"],
  ]},
  { id: "F08", name: "网络、幂等与异常恢复", purpose: "处理超时、重试、断线重连、重复请求和状态对账。", dependsOn: ["F02", "F03"], tables: [
    ["request_dedup", "request_id", "varchar(64)", "PK", "幂等请求ID"],
    ["request_dedup", "uid", "varchar(64)", "INDEX", "玩家ID"],
    ["request_dedup", "result", "json", "NOT NULL", "首次执行结果"],
    ["request_dedup", "expires_at", "timestamp", "INDEX", "过期时间"],
  ]},
  { id: "F09", name: "LiveOps、内容发布与运营配置", purpose: "支持活动排期、版本快照、灰度、回滚和内容审计。", dependsOn: ["F01", "F07"], tables: [
    ["liveops_schedule", "schedule_id", "varchar(64)", "PK", "活动排期ID"],
    ["liveops_schedule", "starts_at", "timestamp", "INDEX", "开始时间"],
    ["liveops_schedule", "ends_at", "timestamp", "INDEX", "结束时间"],
    ["liveops_schedule", "config_snapshot", "json", "NOT NULL", "不可变配置快照"],
  ]},
  { id: "F10", name: "商业化、权益与支付安全", purpose: "统一商品、收据校验、权益发放、补单和审计。", dependsOn: ["F03", "F08"], tables: [
    ["commerce_order", "order_id", "varchar(64)", "PK", "订单ID"],
    ["commerce_order", "uid", "varchar(64)", "INDEX", "玩家ID"],
    ["commerce_order", "product_id", "varchar(96)", "NOT NULL", "商品ID"],
    ["commerce_order", "state", "varchar(24)", "INDEX", "订单状态"],
    ["commerce_order", "receipt_hash", "varchar(128)", "UNIQUE", "收据摘要"],
  ]},
];

const REQUIRED_SYSTEM_FIELDS = [
  ["purpose", "系统目标"], ["entryConditions", "进入条件"], ["inputs", "输入"], ["rules", "规则"],
  ["states", "状态机"], ["outputs", "输出"], ["dependencies", "依赖"], ["uiFeedback", "UI反馈"],
  ["dataEntities", "数据实体"], ["analyticsEvents", "埋点"], ["edgeCases", "异常恢复"], ["acceptanceCriteria", "验收标准"],
];

const fieldPresent = (system, key) => Array.isArray(system?.[key]) ? system[key].length > 0 : Boolean(system?.[key]);
const sqlType = (type) => {
  const normalized = String(type || "").toLowerCase();
  if (/bool/.test(normalized)) return "BOOLEAN";
  if (/uint64|int64|bigint/.test(normalized)) return "BIGINT";
  if (/uint|int/.test(normalized)) return "INTEGER";
  if (/float|double|decimal/.test(normalized)) return "NUMERIC";
  if (/time|date/.test(normalized)) return "TIMESTAMP";
  if (/json|map|list|array|composite/.test(normalized)) return "JSON";
  return "VARCHAR(255)";
};
const sqlDefault = (value, type) => {
  if (value === null || value === undefined || value === "" || value === "-") return "";
  if (/^(true|false)$/i.test(String(value))) return ` DEFAULT ${String(value).toUpperCase()}`;
  if (/^-?\d+(\.\d+)?$/.test(String(value))) return ` DEFAULT ${value}`;
  if (String(value) === "''") return " DEFAULT ''";
  return "";
};

function visualResourceRows(visualPresentation = {}, profile) {
  const rows = [];
  const scene = visualPresentation.sceneArt || {};
  const composition = visualPresentation.mainInterfaceComposition || {};
  const acceptance = visualPresentation.visualAcceptance || {};
  const add = (sourceType, family, items, requirement = "") => list(items).filter(Boolean).forEach((item, index) => rows.push({
    systemTemplateId: "VISUAL", systemName: "核心玩法视觉表现", resourceIndex: index + 1, sourceType,
    fields: {
      "资源族/交付物": family, "内容": item, "制作与验收要求": requirement,
      "资源来源": profile.placeholderAllowed ? "项目配置决定；占位必须标识" : "正式位图/模型/动画资源；禁止核心场景程序占位",
      "程序生成许可": profile.placeholderAllowed ? "仅逻辑原型允许" : "否（非核心装饰性特效需单独批准）",
      "制作状态": "未制作", "负责人": "待分配", "版权/授权": "必须记录", "参考图ID": "待绑定",
    },
  }));
  add("世界空间资源", "场景资源族", scene.assetFamilies, [scene.perspectiveAndScale, scene.lightingAndShadow, scene.materialsAndPalette].filter(Boolean).join("；"));
  add("动画与特效", "动画状态", scene.animationStates, scene.environmentComposition);
  add("HUD与UI", "世界空间元素", composition.worldSpaceElements, composition.navigationPattern);
  add("HUD与UI", "屏幕空间元素", composition.screenSpaceElements, composition.sceneScreenRatio);
  add("验收基准", "Style Frame", acceptance.styleFrameRequirements, acceptance.reviewMethod);
  add("验收基准", "场景灰盒", acceptance.blockoutRequirements, acceptance.reviewMethod);
  return rows;
}

function artField(fields, names, fallback = "") {
  for (const name of names) if (fields?.[name] !== undefined && fields[name] !== "") return String(fields[name]);
  return fallback;
}

function artDelivery(row, profileKey) {
  const type = String(row.sourceType || ""), isUi = /UI|HUD|界面/.test(type), isVisualCore = /世界空间|动画|特效|验收基准/.test(type);
  if (profileKey === "logic-prototype") return isUi ? "本档必交｜线框/可辨识占位" : isVisualCore ? "本档必交｜灰盒/参考占位" : "后续档位｜本档仅登记需求";
  if (profileKey === "visual-vertical-slice") return isUi || isVisualCore ? "本档必交｜代表性最终质量" : "本档选取P0代表资源｜其余后续量产";
  return "本档必交｜最终可发布资源";
}

function aiArtPrompt(row, resourceName, specification, visual) {
  const spatial = visual.spatialPresentation || {}, scene = visual.sceneArt || {}, composition = visual.mainInterfaceComposition || {};
  const output = /UI|HUD|界面/.test(String(row.sourceType || "")) ? "输出可拆分、可适配多分辨率的游戏UI资产，文字与数值使用可编辑占位，不生成品牌标识。" : /世界空间|场景|角色|建筑|地块/.test(`${row.sourceType} ${resourceName}`) ? "输出具备清晰前中后景、统一透视比例与可分层制作结构的场景/对象资产。" : "输出轮廓清晰、状态可扩展、便于游戏引擎导入和后续人工精修的资产。";
  return [`原创游戏美术资源生成任务。资源：${resourceName}。`, `所属系统：${row.systemName}；资源类型：${row.sourceType}。`, `功能与规格：${specification}。`, `美术方向：${text(scene.artDirection)}；材质与色彩：${text(scene.materialsAndPalette)}；光影：${text(scene.lightingAndShadow)}。`, `空间与镜头：${text(spatial.dimensionality)}，${text(spatial.camera)}，${text(spatial.projection)}；主界面构图：场景屏占比 ${text(composition.sceneScreenRatio)}，导航 ${text(composition.navigationPattern)}。`, output, "必须原创，不复制任何竞品角色、Logo、文字、专有建筑、地图或受保护素材；无水印、无签名、无乱码；生成后仍需人工拆层、补绘、状态扩展和版权审核。"].join(" ");
}

function enrichArtRows(rows, profile, options, visual) {
  const policy = ART_SOURCE_POLICIES[options.artSourceMode] || ART_SOURCE_POLICIES["supplied-or-commissioned"];
  return rows.map((row, index) => {
    const originalSource = row.fields?.["资源来源"] || "";
    const resourceName = artField(row.fields, ["资源", "界面/元素", "资源族/交付物", "内容", "asset_id"], `${row.sourceType}-${index + 1}`);
    const specification = artField(row.fields, ["规格", "布局与元素", "制作与验收要求", "内容"], "需按系统用途补充尺寸、状态、动画和性能规格");
    return { ...row, resourceIndex: index + 1, fields: {
      ...row.fields,
      "资源名称": resourceName,
      "规格/用途": specification,
      "本档交付": artDelivery(row, options.profile),
      "制作来源策略": policy.label,
      "模型提示词": options.artSourceMode === "ai-generated-bitmap" ? aiArtPrompt(row, resourceName, specification, visual) : "",
      "来源执行要求": policy.workflow,
      "来源交付物": policy.sourceDeliverable,
      "资源来源": policy.label,
      "母版来源提示": originalSource,
      "程序生成许可": profile.placeholderAllowed ? "仅原型占位允许，必须标识并绑定替换任务" : "核心场景/UI/角色禁止程序占位",
      "制作状态": row.fields?.["制作状态"] || "未制作",
      "负责人": row.fields?.["负责人"] || "待分配",
      "版权/授权": policy.license,
      "参考图ID": row.fields?.["参考图ID"] || "待绑定",
      "源文件格式": row.fields?.["源文件格式"] || policy.sourceDeliverable,
      "运行时格式": row.fields?.["运行时格式"] || `由${options.engine}导入规范和${options.platform}性能预算确定`,
      "完成定义": profile.artCompletion,
      "验收标准": artField(row.fields, ["制作与验收要求", "规格", "必备状态"], profile.artAcceptance),
    }};
  });
}

function collectSchemaRows(selection, foundations) {
  const rows = [];
  for (const item of selection.matched) {
    for (const row of list(item.template?.sections?.D?.rows || item.template?.schemaRows)) rows.push({
      source: item.template.id, table: row["表"] || "unresolved_table", field: row["字段"] || "unresolved_field",
      type: row["类型"] || "string", range: row["范围"] || "", default: row["默认"] || "",
      constraint: row["校验/外键"] || "", authority: row["归属"] || "", change: row["变更"] || "新增表",
    });
  }
  for (const foundation of foundations) for (const row of foundation.tables) rows.push({
    source: foundation.id, table: row[0], field: row[1], type: row[2], range: "", default: "", constraint: row[3], authority: "目标项目基础设施", change: "目标项目新增表", description: row[4],
  });
  return rows;
}

function buildDataModel(schemaRows) {
  const tables = new Map();
  for (const row of schemaRows) {
    if (!tables.has(row.table)) tables.set(row.table, []);
    const fields = String(row.field).split("/").map((field) => field.trim()).filter(Boolean);
    if (fields.length > 1) {
      for (const field of fields) tables.get(row.table).push({ ...row, field, type: "string", constraint: `${row.constraint}; 复合字段由目标项目确认精确类型` });
    } else tables.get(row.table).push(row);
  }
  const sql = ["-- Draft schema generated from confirmed system templates and target-project foundations.", "-- Review all TODO comments before implementation."];
  const types = ["// Draft types generated from the development package. Validate before use."];
  const jsonDefs = {};
  for (const [table, fields] of tables) {
    const dedup = [...new Map(fields.map((field) => [field.field, field])).values()];
    const primaryFields = dedup.filter((field) => /主键|\bPK\b/i.test(`${field.range} ${field.constraint}`)).map((field) => field.field);
    sql.push(`\nCREATE TABLE IF NOT EXISTS ${table} (`);
    const columnLines = dedup.map((field) => {
      const constraints = [];
      if (/唯一|\bUNIQUE\b/i.test(field.constraint)) constraints.push("UNIQUE");
      if (/NOT NULL/i.test(field.constraint)) constraints.push("NOT NULL");
      const note = `${field.source}; ${field.constraint || "TODO: constraint"}`.replaceAll("*/", "* /");
      return `  ${field.field} ${sqlType(field.type)}${sqlDefault(field.default, field.type)}${constraints.length ? ` ${constraints.join(" ")}` : ""} /* ${note} */`;
    });
    if (primaryFields.length) columnLines.push(`  PRIMARY KEY (${primaryFields.join(", ")})`);
    sql.push(columnLines.join(",\n"));
    sql.push(");");
    const interfaceName = table.split(/[_\-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
    types.push(`\nexport interface ${interfaceName} {`);
    types.push(...dedup.map((field) => `  ${field.field}: ${/bool/i.test(field.type) ? "boolean" : /int|float|double|decimal|numeric/i.test(field.type) ? "number" : /json|map|list|array|composite/i.test(field.type) ? "unknown" : "string"};`));
    types.push("}");
    jsonDefs[table] = { type: "object", additionalProperties: false, properties: Object.fromEntries(dedup.map((field) => [field.field, { type: /bool/i.test(field.type) ? "boolean" : /int|float|double|decimal|numeric/i.test(field.type) ? "number" : "string", description: field.description || field.constraint || field.range || "" }])), required: dedup.filter((field) => /主键|PK|NOT NULL/i.test(`${field.range} ${field.constraint}`)).map((field) => field.field) };
  }
  return { tables, sql: `${sql.join("\n")}\n`, types: `${types.join("\n")}\n`, jsonSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", title: "Game development configuration schemas", $defs: jsonDefs } };
}

function completenessAudit(systems, visual, profile, options, selection, foundations, artRows, schemaRows) {
  const checks = [];
  for (const system of systems) {
    const missing = REQUIRED_SYSTEM_FIELDS.filter(([key]) => !fieldPresent(system, key)).map(([, label]) => label);
    checks.push({ scope: system.name, type: "竞品系统", status: missing.length ? "blocked" : "pass", missing, sourceStatus: "competitor-confirmed" });
  }
  for (const foundation of foundations) checks.push({ scope: foundation.name, type: "项目基础设施", status: "target-added", missing: [], sourceStatus: "project-baseline" });
  const configMissing = ["engine", "platform", "topology", "saveMode"].filter((key) => !options[key] || options[key] === "待确认");
  checks.push({ scope: "目标项目配置", type: "架构闸门", status: configMissing.length ? "blocked" : "pass", missing: configMissing, sourceStatus: "target-decision" });
  const visualMissing = [];
  if (!visual?.spatialPresentation?.dimensionality) visualMissing.push("空间维度");
  if (!visual?.spatialPresentation?.camera) visualMissing.push("镜头语法");
  if (!visual?.sceneArt?.artDirection) visualMissing.push("场景美术方向");
  if (!list(visual?.visualAcceptance?.styleFrameRequirements).length) visualMissing.push("Style Frame要求");
  if (!list(visual?.visualAcceptance?.blockoutRequirements).length) visualMissing.push("场景灰盒要求");
  if (!profile.placeholderAllowed && options.artSourceMode === "placeholder") visualMissing.push("当前档位禁止占位资源");
  if (!profile.placeholderAllowed && !options.assetReferencesApproved) visualMissing.push("正式资源参考图尚未绑定或批准");
  checks.push({ scope: "核心玩法视觉合同", type: "美术闸门", status: visualMissing.length ? "blocked" : "pass", missing: visualMissing, sourceStatus: "competitor-adapted" });
  checks.push({ scope: "美术资源清单", type: "美术交付", status: artRows.length ? "target-added" : "blocked", missing: artRows.length ? [] : ["没有生成UI、场景、动画、音频或技术资源需求"], sourceStatus: "profile-adapted" });
  const schemaReviewMissing = options.schemaReviewed ? [] : ["主外键/索引/复合字段/迁移方案尚未完成技术评审"];
  if (list(schemaRows).some((row) => /composite|按字段Schema/i.test(`${row.type} ${row.range}`)) && !options.schemaReviewed) schemaReviewMissing.push("存在需要展开的复合字段");
  checks.push({ scope: "统一数据模型", type: "数据闸门", status: schemaReviewMissing.length ? "blocked" : "pass", missing: schemaReviewMissing, sourceStatus: "generated-draft" });
  if (selection.unmatched.length) checks.push({ scope: "母版匹配", type: "模板闸门", status: "blocked", missing: selection.unmatched.map((item) => item.system.name), sourceStatus: "mapping-required" });
  const blockers = checks.filter((check) => check.status === "blocked");
  return { status: blockers.length ? "blocked" : "ready", readyForImplementation: blockers.length === 0, checks, blockers: blockers.map((item) => ({ scope: item.scope, missing: item.missing })) };
}

function buildSystemMap(systems, foundations) {
  const rows = [
    ...foundations.map((item) => ({ id: item.id, name: item.name, source: "目标项目基础设施", status: "target-added", dependencies: item.dependsOn.join("、") || "无" })),
    ...systems.map((item, index) => ({ id: item.templateMatch?.templateSystemId || `R${String(index + 1).padStart(2, "0")}`, name: item.name, source: "竞品证据", status: "competitor-confirmed", dependencies: list(item.dependencies).join("、") || "待确认" })),
  ];
  return mdTable(["id", "name", "source", "status", "dependencies"], rows);
}

function artResourceMarkdown(artRows, profile, policy) {
  const rows = artRows.map((row) => ({
    ID: `${row.systemTemplateId}-${row.resourceIndex}`,
    系统: row.systemName,
    类型: row.sourceType,
    "资源/界面": row.fields["资源名称"],
    "规格与用途": row.fields["规格/用途"],
    本档交付: row.fields["本档交付"],
    制作来源: row.fields["制作来源策略"],
    模型提示词: row.fields["模型提示词"],
    验收: row.fields["验收标准"],
  }));
  const columns = policy.label === "AI生成位图" ? ["ID", "系统", "类型", "资源/界面", "规格与用途", "本档交付", "制作来源", "模型提示词", "验收"] : ["ID", "系统", "类型", "资源/界面", "规格与用途", "本档交付", "制作来源", "验收"];
  return [`- 本档美术范围：${profile.artScope}`, `- 交付规则：${profile.artRule}`, `- 完成定义：${profile.artCompletion}`, `- 档位验收：${profile.artAcceptance}`, `- 制作来源：${policy.label}`, `- 来源流程：${policy.workflow}`, `- 来源交付：${policy.sourceDeliverable}`, `- 版权要求：${policy.license}`, `- 资源总数：${rows.length}（完整总表；“本档交付”列决定当前档位实际制作范围）`, "", mdTable(columns, rows)].join("\n");
}

function apiYaml(systems) {
  const lines = ["openapi: 3.1.0", "info:", "  title: Target Game Domain API", "  version: 0.1.0", "paths:"];
  for (const system of systems) {
    const key = String(system.templateMatch?.templateSystemId || system.name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    lines.push(`  /systems/${key}/command:`, "    post:", `      summary: Submit ${system.name} intent`, `      operationId: ${key.replaceAll("-", "_")}_command`, "      responses:", "        '200':", "          description: Idempotent domain result", "        '409':", "          description: State or version conflict");
  }
  return `${lines.join("\n")}\n`;
}

function systemMarkdown(system, master, index) {
  const missing = REQUIRED_SYSTEM_FIELDS.filter(([key]) => !fieldPresent(system, key)).map(([, label]) => label);
  const parts = [`# ${index + 1}. ${system.name}`, "", "## 来源状态", "", "- 竞品证据：已确认", `- 证据ID：${list(system.evidenceIds).join("、") || "未记录"}`, `- 母版：${master ? `${master.id}｜${master.name}` : "未匹配"}`, `- 完整性：${missing.length ? `阻塞：${missing.join("、")}` : "通过"}`, "", "## 系统规格", "", `- 目标：${text(system.purpose)}`, `- 进入条件：${list(system.entryConditions).join("；") || "待确认"}`, `- 输入：${list(system.inputs).join("；") || "待确认"}`, `- 规则：${list(system.rules).join("；") || "待确认"}`, `- 状态：${list(system.states).join("；") || master?.stateFlow || "待确认"}`, `- 输出：${list(system.outputs).join("；") || "待确认"}`, `- 依赖：${list(system.dependencies).join("；") || "待确认"}`, `- UI/反馈：${list(system.uiFeedback).join("；") || "待确认"}`, `- 数据实体：${list(system.dataEntities).join("；") || "待确认"}`, `- 埋点：${list(system.analyticsEvents).join("；") || "待确认"}`, `- 异常恢复：${[...list(system.edgeCases), ...list(system.risks)].join("；") || "待确认"}`, `- 验收：${list(system.acceptanceCriteria).join("；") || "待确认"}`];
  if (master) parts.push("", "## 目标项目工程基线", "", `- 功能边界：${master.feature}`, `- 状态流：${master.stateFlow || "待确认"}`, `- 母版验收：${master.acceptance || "待确认"}`, "", "### 功能、端职责、Schema、埋点、性能与QA", "", mdTable(master.developmentColumns, master.developmentRows));
  return `${parts.join("\n")}\n`;
}

export function buildDevelopmentPackage({ game, snapshot, catalog, storyTemplate, options = {} }) {
  const profileKey = BUILD_PROFILES[options.profile] ? options.profile : "production-ready";
  const profile = BUILD_PROFILES[profileKey];
  const resolved = { profile: profileKey, engine: options.engine || "待确认", platform: options.platform || "待确认", topology: options.topology || "待确认", saveMode: options.saveMode || "待确认", artSourceMode: options.artSourceMode || (profile.placeholderAllowed ? "placeholder" : "supplied-or-commissioned"), assetReferencesApproved: options.assetReferencesApproved === true || options.assetReferencesApproved === "true", schemaReviewed: options.schemaReviewed === true || options.schemaReviewed === "true" };
  const selection = selectDevelopmentTemplates(snapshot, catalog, { includeUnverified: options.includeUnverified });
  const storySelection = selectStoryDevelopmentTemplate(snapshot, storyTemplate);
  const foundations = FOUNDATIONS.filter((item) => profile.requiredFoundations.includes(item.id));
  const systems = [...selection.matched, ...selection.unmatched].map(({ system }) => {
    const matched = selection.matched.find((item) => item.system === system);
    return { ...system, sourceStatus: "competitor-confirmed", templateMatch: matched ? { status: "matched", templateSystemId: matched.template.id, templateName: matched.template.name, matchedBy: matched.matchedBy } : { status: "unmatched" } };
  });
  const rawArt = [...buildArtResourceRows(selection, storySelection, storyTemplate), ...visualResourceRows(snapshot.systemGameplay?.visualPresentation, profile)];
  const artRows = enrichArtRows(rawArt, profile, resolved, snapshot.systemGameplay?.visualPresentation || {});
  const artPolicy = ART_SOURCE_POLICIES[resolved.artSourceMode] || ART_SOURCE_POLICIES["supplied-or-commissioned"];
  const schemaRows = collectSchemaRows(selection, foundations);
  const dataModel = buildDataModel(schemaRows);
  const audit = completenessAudit(systems, snapshot.systemGameplay?.visualPresentation || {}, profile, resolved, selection, foundations, artRows, schemaRows);
  const eventCatalog = systems.flatMap((system) => list(system.analyticsEvents).map((name) => ({ name, system: system.name, trigger: "待确认", requiredProperties: ["uid", "timestamp", "source_version"], sourceStatus: "competitor-confirmed" }))).concat([{ name: "client_error", system: "F07", trigger: "未捕获异常或稳定错误码", requiredProperties: ["uid", "error_code", "context", "timestamp"], sourceStatus: "project-baseline" }]);
  const visual = snapshot.systemGameplay?.visualPresentation || {};
  const visualMd = ["# 美术方向与核心玩法视觉合同", "", `- 生成档位：${profile.label}`, `- 本档美术范围：${profile.artScope}`, `- 美术来源策略：${artPolicy.label}`, `- 来源执行流程：${artPolicy.workflow}`, `- 核心资源程序占位：${profile.placeholderAllowed ? "仅原型允许且必须标识" : "禁止"}`, "", "## 空间表现", "", `- 维度：${text(visual.spatialPresentation?.dimensionality)}`, `- 镜头：${text(visual.spatialPresentation?.camera)}`, `- 投影：${text(visual.spatialPresentation?.projection)}`, `- 深度与遮挡：${text(visual.spatialPresentation?.depthOrdering)}；${text(visual.spatialPresentation?.occlusion)}`, "", "## 场景与主界面", "", `- 美术方向：${text(visual.sceneArt?.artDirection)}`, `- 资源族：${list(visual.sceneArt?.assetFamilies).join("；") || "待确认"}`, `- 场景屏占比：${text(visual.mainInterfaceComposition?.sceneScreenRatio)}`, `- HUD安全区：${list(visual.mainInterfaceComposition?.hudSafeZones).join("；") || "待确认"}`, `- 负面约束：${list(visual.mainInterfaceComposition?.negativeConstraints).join("；") || "待确认"}`, "", "## 强制验收", "", ...list(visual.visualAcceptance?.styleFrameRequirements).map((item) => `- Style Frame：${item}`), ...list(visual.visualAcceptance?.blockoutRequirements).map((item) => `- 灰盒：${item}`), ...list(visual.visualAcceptance?.rejectionCriteria).map((item) => `- 一票否决：${item}`), `- 评审：${text(visual.visualAcceptance?.reviewMethod)}`, "- 未通过Style Frame和核心场景灰盒验收，不得进入正式UI与批量资产制作。", profile.placeholderAllowed ? "- 逻辑原型的占位资源必须醒目标识并绑定正式资源替换任务。" : "- 不得用CSS、Canvas几何体或代码生成图形替代核心场景、角色、建筑、地块和关键UI。"].join("\n");
  const gapRows = audit.checks.map((check) => ({ scope: check.scope, type: check.type, status: check.status, missing: check.missing.join("、") || "无", source: check.sourceStatus }));
  const gapMarkdown = `# 开发范围与完整性闸门\n\n- 档位：${profile.label}\n- 目标：${profile.objective}\n- 美术范围：${profile.artScope}\n- 当前状态：${audit.readyForImplementation ? "可进入实施" : "阻塞，不得宣称可直接实施"}\n\n${mdTable(["scope", "type", "status", "missing", "source"], gapRows)}\n\n## 未决项目配置\n\n- 引擎：${resolved.engine}\n- 平台：${resolved.platform}\n- 网络拓扑：${resolved.topology}\n- 存档模式：${resolved.saveMode}\n- 美术来源：${artPolicy.label}\n- 来源流程：${artPolicy.workflow}\n`;
  const systemMap = `# 目标项目系统图\n\n> 竞品证实系统与目标项目基础设施分开标注。\n\n${buildSystemMap(systems, foundations)}\n`;
  const dataRows = schemaRows.map((row) => ({ "来源": row.source, "表": row.table, "字段": row.field, "类型": row.type, "约束": row.constraint, "权威端": row.authority }));
  const dataMarkdown = `# 项目统一数据模型\n\n> 这是从母版片段和目标项目基础设施汇总出的初稿。所有TODO、复合字段、外键、索引、分片与迁移必须在实施前评审。\n\n${mdTable(["来源", "表", "字段", "类型", "约束", "权威端"], dataRows)}\n`;
  const uiRows = systems.flatMap((system) => {
    const master = selection.matched.find((item) => item.system.name === system.name)?.template;
    return list(master?.uiRows).map((row) => [system.name, row["界面/元素"] || "待确认", row["必备状态"] || "Loading/Empty/Normal/Disabled/Error/Offline", row["操作规则"] || "待确认"]);
  });
  const artCsv = artResourceCsv(artRows);
  const milestones = [
    { id: "M0", name: "架构、Schema与Style Frame", exitCriteria: ["项目配置已确认", "Schema评审通过", "Style Frame通过"] },
    { id: "M1", name: "空间灰盒与代表性正式资源", exitCriteria: ["镜头/投影/遮挡成立", "核心场景不得卡片化", "代表性资源已导入"] },
    { id: "M2", name: "核心循环纵向打通", exitCriteria: ["状态/数据/异常闭环", "资产流水可审计", "核心循环验收通过"] },
    { id: "M3", name: "外围系统集成", exitCriteria: ["依赖闭合", "页面状态齐全", "埋点可验证"] },
    { id: "M4", name: "商业化、存档与恢复", exitCriteria: ["幂等/补单/迁移通过", "离线和断线恢复通过"] },
    { id: "M5", name: "生产验收", exitCriteria: ["功能/视觉/性能/兼容/回归全部通过", "无阻塞缺口"] },
  ];
  const systemFiles = Object.fromEntries(systems.map((system, index) => {
    const master = selection.matched.find((item) => item.system.name === system.name)?.template;
    const id = system.templateMatch?.templateSystemId || `R${String(index + 1).padStart(2, "0")}`;
    return [`systems/${id}-${system.name.replace(/[\\/:*?"<>|\s]+/g, "-")}.md`, systemMarkdown(system, master, index)];
  }));
  const mainMarkdown = `# ${game.canonicalName} · 目标游戏生产开发文档\n\n## 1. 输出档位与实施状态\n\n- 档位：${profile.label}\n- 目标：${profile.objective}\n- 美术交付范围：${profile.artScope}\n- 实施状态：${audit.readyForImplementation ? "READY" : "BLOCKED"}\n- 说明：竞品事实仅作为证据；目标项目基础设施与适配结论均独立标注。\n\n## 2. 产品与核心体验\n\n- 参考产品：${game.canonicalName}\n- 类型：${list(snapshot.basic?.genres).join("、") || "待确认"}\n- 核心原型：${text(snapshot.systemGameplay?.taxonomy?.mainCorePrototype)}\n- 体验支柱：${list(snapshot.systemGameplay?.playerMotivation).join("、") || "待确认"}\n\n## 3. 完整性闸门\n\n${mdTable(["scope", "type", "status", "missing", "source"], gapRows)}\n\n## 4. 目标项目系统架构\n\n${buildSystemMap(systems, foundations)}\n\n## 5. 数据与接口交付\n\n- 统一数据模型：data/data-model.md\n- 可执行Schema初稿：data/schema.sql\n- JSON Schema：data/config.schema.json\n- 类型定义：data/types.ts\n- API合同：contracts/api-contract.yaml\n- 事件目录：contracts/event-catalog.json\n\n## 6. 视觉与美术生产闸门\n\n${visualMd.replace(/^# .*\n/, "")}\n\n## 7. 系统规格\n\n${Object.values(systemFiles).join("\n\n")}\n\n## 8. 开发顺序\n\n${milestones.map((item) => `### ${item.id} ${item.name}\n${item.exitCriteria.map((criterion) => `- ${criterion}`).join("\n")}`).join("\n\n")}\n\n## 9. 美术资源需求总表\n\n${artResourceMarkdown(artRows, profile, artPolicy)}\n\n## 10. 实施约束\n\n- 不得把母版基线描述为竞品事实。\n- 不得复制竞品名称、角色、剧情、美术、地图、音频、专有数值或活动内容。\n- 所有BLOCKED项关闭前，不得将本开发包标记为可直接生产。\n- 不得一次性让AI实现全部系统；必须按M0-M5逐阶段验收。\n`;
  const manifest = {
    packageVersion: "2.1.0", generatedAt: new Date().toISOString(), gameId: game.id, gameName: game.canonicalName,
    sourceVersionId: snapshot.versionId, sourceCollectedAt: snapshot.collectedAt, buildProfile: { id: profileKey, ...profile }, projectConfig: { ...resolved, artSourcePolicy: artPolicy },
    implementationGate: audit, competitorSystems: systems, projectFoundations: foundations, templateSelection: { matched: selection.matched.map((item) => ({ system: item.system.name, id: item.template.id, matchedBy: item.matchedBy })), unmatched: selection.unmatched.map((item) => ({ system: item.system.name, reason: item.reason })), excluded: selection.excluded.map((item) => ({ system: item.system.name, reason: item.reason })) },
    dataModel: { tables: [...dataModel.tables.keys()], schemaRows }, api: { format: "OpenAPI 3.1 draft" }, eventCatalog, artResourceList: artRows, milestones,
    storyTemplate: { applied: storySelection.applied, reason: storySelection.reason }, evidence: snapshot.sources || [], evidenceGaps: [...list(snapshot.systemGameplay?.evidenceGaps), ...list(snapshot.commercialization?.evidenceGaps), ...list(snapshot.community?.evidenceGaps)],
  };
  const files = {
    "00-scope-and-gap-report.md": gapMarkdown,
    "01-product-spec.md": mainMarkdown,
    "02-system-map.md": systemMap,
    ...systemFiles,
    "data/data-model.md": dataMarkdown,
    "data/schema.sql": dataModel.sql,
    "data/config.schema.json": `${JSON.stringify(dataModel.jsonSchema, null, 2)}\n`,
    "data/types.ts": dataModel.types,
    "data/seed/seed-example.csv": csv(["table", "field", "example", "status"], schemaRows.slice(0, 120).map((row) => [row.table, row.field, row.default || "", "example-only"])),
    "contracts/api-contract.yaml": apiYaml(systems),
    "contracts/event-catalog.json": `${JSON.stringify(eventCatalog, null, 2)}\n`,
    "ui/page-flow.md": `# 页面与场景流程\n\n${systems.map((system) => `- ${system.name}：入口 → Loading → Normal/Empty → 操作提交 → Success/Error → 返回/恢复`).join("\n")}\n`,
    "ui/ui-state-matrix.csv": csv(["system", "screen_or_element", "required_states", "interaction_rule"], uiRows),
    "art/art-direction.md": `${visualMd}\n`,
    "art/art-production-plan.csv": artCsv,
    "art/acceptance-checklist.md": `# 美术验收清单\n\n- [ ] Style Frame已经批准并绑定参考图ID\n- [ ] 核心场景镜头、投影、屏占比、遮挡和深度排序通过\n- [ ] 核心资源不是CSS/Canvas/代码几何体占位\n- [ ] UI与世界空间层级边界明确\n- [ ] 源文件、运行时文件、命名、Pivot、Atlas/材质与动画状态齐全\n- [ ] 版权、授权和负责人已登记\n`,
    "tests/acceptance-test-plan.md": `# 验收测试计划\n\n${audit.checks.map((check) => `- [${check.status === "pass" || check.status === "target-added" ? "x" : " "}] ${check.scope}：${check.missing.join("、") || "通过/已纳入目标项目"}`).join("\n")}\n\n## 通用场景\n\n- 首次进入、回流、未解锁、空状态、加载、断网、超时、重复请求、版本迁移、资源缺失、低性能设备。\n`,
    "ai/implementation-manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "ai/milestone-task-graph.json": `${JSON.stringify(milestones, null, 2)}\n`,
  };
  return { profileKey, profile, options: resolved, selection, storySelection, systems, foundations, artRows, dataModel, audit, mainMarkdown, manifest, files };
}

export function writeDevelopmentPackage(pkg, outputDir, baseName) {
  const packageDir = path.resolve(outputDir, `${baseName}-package`);
  fs.mkdirSync(packageDir, { recursive: true });
  for (const [relative, content] of Object.entries(pkg.files)) writeText(path.join(packageDir, relative), content);
  writeText(path.join(outputDir, `${baseName}.md`), pkg.mainMarkdown);
  writeJson(path.join(outputDir, `${baseName}.json`), pkg.manifest);
  writeText(path.join(outputDir, `${baseName}-art-assets.csv`), artResourceCsv(pkg.artRows));
  let zipPath = null;
  try {
    zipPath = path.resolve(outputDir, `${baseName}-package.zip`);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execFileSync("zip", ["-qr", zipPath, path.basename(packageDir)], { cwd: path.dirname(packageDir), stdio: "ignore" });
  } catch { zipPath = null; }
  return { packageDir, zipPath, outputs: [path.join(outputDir, `${baseName}.md`), path.join(outputDir, `${baseName}.json`), path.join(outputDir, `${baseName}-art-assets.csv`)] };
}
