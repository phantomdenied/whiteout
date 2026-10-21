---
name: game-competitive-research
description: 从当前网络来源调研指定游戏，保存有证据、按日期版本化的知识；避免同日重复采集，增量更新过期游戏；通过七模块离线 HTML 应用查看与比较；导出单游戏或双游戏竞品报告；并仅加载与已确认系统匹配的模板，生成包含完整系统基础、统一数据结构、API/事件/UI 契约、里程碑任务和非程序化美术资源要求的目标游戏生产开发包。适用于游戏竞品调研、系统与玩法拆解、商业化活动、社区运营、知识库、竞品报告、版本追踪、同类比较、互动影游/剧情互动解谜、开发包、数据库设计、AI 实现清单和美术资源清单。发行包知识库必须为空，内置规范与模板不得当作已采集的游戏事实。
---

# 游戏竞品研究库 v1.3（通用 Agent Skills 中文核心版）

以 `data/knowledge.json` 为唯一事实源，以 `index.html` 为离线可视化入口。所有路径均相对此文件解析；可视化不得依赖站点、数据库、框架、构建步骤或联网服务。

## 通用运行约定

- 本技能遵循以 `SKILL.md` 为入口、同目录附带 `scripts/`、`references/`、`assets/` 和 `data/` 的通用 Agent Skills 结构，不依赖 Codex Plugin 清单或特定平台缓存。
- 目标 Agent 必须能够读取本技能目录、执行本地命令并写入 `data/` 与 `outputs/`。将技能安装在可写的工作区技能目录；若平台只提供只读托管目录，先复制到可写工作区再运行。
- 命令行脚本需要 Node.js 18 或更高版本；`scripts/import-development-template.py` 仅在重新导入开发母版时需要 Python 3。其他脚本只使用 Node.js 内置模块。
- 调研阶段需要目标平台提供联网搜索或浏览能力。工具名称不限：选择能获取当前网页、打开来源并保留链接的等价工具；没有联网工具时，只执行本地查看、比较、导入、报告和开发包功能，不得假装完成网络采集。
- 所有相对路径均以本 `SKILL.md` 所在目录为根目录。运行命令前先切换到该目录，避免把知识库或输出写入错误位置。
- `data/knowledge.json` 与 `data/knowledge.js` 是用户本地数据。更新技能文件前先备份这两个文件及 `outputs/`，更新完成后再恢复；不得用空白发行包覆盖已有研究。

## 采集或更新游戏

1. 阅读 `references/collection-workflow.md`、`data-sources.md`、`schema.md`、`system-gameplay-framework.md`、`visual-presentation.md` 和 `development-template-library.md`。
2. 执行：

```bash
node scripts/plan-collection.mjs data/knowledge.json --game "游戏名"
```

3. 按结果处理：`skip` 复用今日最新版；`full` 全量调研；`incremental` 从 `from` 到 `to` 调研变化，并生成完整新快照。用户明确要求全量刷新时才忽略同日规则。
4. 采集时联网，按 `data-sources.md` 的平台顺序与访问边界执行。优先官方 API/页面，其次允许访问的第三方信号、公开报告和用户授权导出；最终答复列出来源。
5. `development-template-catalog.json` 仅作调研清单。确定市场类型后创建空记录：

```bash
node scripts/create-research-record.mjs --game "游戏名" --type "类型ID" --mode full --out outputs/research.json
```

增量模式追加 `--mode incremental --from YYYY-MM-DD`。

6. 只填入已验证事实，声明关联证据 ID；未知项写入 `evidenceGaps`，不得猜测。确认系统后才写入 `systemGameplay.systems[]`；匹配明确时填写 S01-S64 `templateSystemId`，否则留空并记录问题。
7. 验证并追加版本：

```bash
node scripts/validate-knowledge.mjs outputs/research.json --research-record
node scripts/upsert-research.mjs data/knowledge.json outputs/research.json --in-place
node scripts/sync-html-data.mjs data/knowledge.json
node scripts/validate-knowledge.mjs data/knowledge.json
```

旧于 v1.4 的本地知识库先迁移视觉字段：

```bash
node scripts/migrate-knowledge-v1.4.mjs data/knowledge.json --in-place
node scripts/sync-html-data.mjs data/knowledge.json
```

全量刷新时，规划与写入命令均传入 `--full`。

## 调研范围

- 总览：身份、商店 ID、开发/发行商、类型、平台、地区、上线/运营/商业模式/当前版本、官方入口、上线时长、阶段流水、日活、目标人群，以及榜单、评分、评论、下载区间、在线人数、玩家数估算、价格、版本和授权估算等市场信号。
- 系统与玩法：主/副核心原型、玩家动机、主要操作与决策、核心循环、Meta Loop、空间表现、场景美术、主界面构图、美术验收、七层系统、主要系统、依赖、功能、指标和证据缺口。
- 商业化活动：付费点、档位、更新节奏、常规活动和版本、周年、节日、联动、回流等主题运营。
- 社区运营：媒体/社区渠道、角色、受众、内容与频率，常规及特殊社区活动和策略观察。

事实、历史事实、观察、推断和建议必须分开。

## 离线查看与对比

直接打开 `index.html`。页面固定七个模块：总览、系统与玩法、商业化活动、社区运营、竞品报告、知识库、开发文档。

顶部搜索先按名称、别名、英文名、开发/发行商、类型和平台查询本地知识库。无本地结果时，用户可确认名称并显式选择 OpenAI、Anthropic、Google Gemini、xAI、Perplexity 或智谱 GLM 的联网模型采集；空状态加号使用同一表单。表单先选择模型厂商和具体版本，再输入对应 API Key。Key 仅用于单次请求，严禁写入知识库、存储、URL 或安装文件。成功结果只合并到页面内存并下载新版知识 JSON，浏览器不得静默改写安装文件。厂商若限制浏览器直连，应明确提示 CORS 或账户策略，不得降级为无联网证据的猜测。

对比模式中，选择篮子外游戏会清空对比并切回单产品；选择篮子内游戏则保留对比并将其移到第一列。零或一个有效对比对象显示紧凑卡片式单产品页；两个至四个游戏只显示一张可横向滚动的“指标 × 游戏”表，深色产品头与数据列严格对齐，不再重复单产品卡片。对齐相同字段与采集日期，覆盖期不一致时提示。

## 导出竞品报告

阅读 `references/competitive-report.md`。单产品默认主选择游戏；对比状态默认前两个游戏。左侧可独立选择一至两个本地游戏，不改变全局研究视图。右侧预览安全 HTML，只提供 MD 和浏览器打印/PDF。所有结论来自所选知识快照，未知项与证据缺口不得用模板补齐。

## 生成生产开发包

完整阅读 `references/development-production-package.md` 与 `development-template-library.md`。通过 `development-templates-v3/manifest.json` 解析系统，只读取 `shared/global.md` 和已确认系统对应的 `systems/Sxx.md`，不得默认加载 64 份文档。互动影游、视觉小说、剧情互动或叙事解谜产品再读取 `story-interaction-development.md` 和 `story-development-template.json`。

可先审计模板选择：

```bash
node scripts/select-development-templates.mjs data/knowledge.json --game "游戏名"
```

生成示例：

```bash
node scripts/generate-development-doc.mjs data/knowledge.json --game "游戏名" --out-dir outputs --profile production-ready --engine "Unity" --platform "iOS/Android" --topology "客户端-服务端" --save-mode "云存档" --art-source-mode supplied-or-commissioned
```

档位为 `logic-prototype`、`visual-vertical-slice` 或 `production-ready`，默认生产就绪。引擎、平台、网络、存档和美术来源缺失时标为待确认，不得从竞品截图推断。只有正式审核完成后才能传入 `--asset-references-approved true` 或 `--schema-reviewed true`。

开发文档先写竞品证据层，再写独立的目标项目补全层；不得把项目假设回写到知识库。必须合并数据模型、草案 SQL、JSON Schema、TypeScript 类型、种子数据、API/事件契约、UI 状态、验收测试和 M0-M5 任务。存在未决配置、未匹配系统、视觉证据不足或资源门槛未通过时，状态必须为 `blocked`。

美术清单合并 UI、美术、音频、技术资源和视觉契约资源；每行包含来源模式、程序生成权限、负责人、状态、引用 ID、源/运行格式、许可、`本档交付`、规格、用途和验收。档位必须改变逐行交付级别，美术来源必须改变逐行流程、源文件和授权要求。选择 `ai-generated-bitmap` 时，每行增加结合用途和视觉契约的原创模型提示词，并在 MD/PDF、AI JSON 与美术 List 中展示；不得包含受保护标识或要求复制竞品资产。视觉切片与生产就绪档不得用 CSS、Canvas 图元或代码几何替代核心场景、角色、建筑、地块和关键 UI，最终制作前必须通过 Style Frame 与空间灰盒验收。

离线页面只保留 MD、PDF、AI JSON、美术资源 List 四个导出；右侧 HTML 仅为预览。命令行可额外输出结构化目录和 ZIP。

## 强制规则

- 发行包知识库必须保持 `games: []`，不得附带示例游戏。
- 不覆盖或删除历史版本；同一上海日期不重复采集，除非用户明确全量刷新。
- 类型惯例、推荐系统和模板内容都不是竞品事实；无证据不得生成系统。
- 母版中的代码、Prefab、状态、数据结构和资源路径不得描述为竞品实现。
- 项目基础和目标项目假设不得回写竞品知识快照。
- 有阻塞项不得宣称可直接实施；占位资源必须标明，视觉/生产档禁止关键视觉程序替代。
- 实现必须按里程碑与退出条件推进，不得要求 AI 一次构建全部系统。
- 不复制名称、剧情、角色、美术、地图、专有数值或活动内容。
- 原地写入前备份，写入后验证。

## 参考文件路由

- `competitive-report.md`：单/双游戏竞品报告。
- `schema.md`：知识字段与版本结构。
- `collection-workflow.md`：新鲜度、证据与完成门槛。
- `data-sources.md`：总览数据源、访问边界和指标归一。
- `system-gameplay-framework.md`：系统与玩法模型。
- `visual-presentation.md`：视觉调研、生成与验收。
- `development-production-package.md`：AI 就绪开发文档、档位、完整性、数据、美术门槛与交付包。
- `development-template-library.md`：按需模板匹配与事实隔离。
- `development-templates-v3/manifest.json`：S01-S64 路由；只加载确认匹配项。
- `development-template-catalog.json`：G01-G32 调研清单及机器索引。
- `story-interaction-development.md` 与 `story-development-template.json`：仅在互动剧情条件触发时读取。
