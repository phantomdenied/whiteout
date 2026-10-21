# 游戏系统开发母版库 v3.0

## 权威来源

- DOCX：`assets/game-system-development-template-library-v3.0.docx`
- Markdown：`assets/game-system-development-template-library-v3.0.md`
- DOCX SHA-256：`28f829b36754be17533f0148d88374e540ad5243fe560a82733d7ccf1ce24dab`
- Markdown SHA-256：`bc46d21d77e56fdfaacf91f702b5d2dddabca18879f04cd9df6f1789fad212f7`
- 拆分清单：`references/development-templates-v3/manifest.json`
- 公共规则：`references/development-templates-v3/shared/global.md`
- 系统文档：`references/development-templates-v3/systems/S01.md` 至 `S64.md`
- 机器目录：`references/development-template-catalog.json`
- 浏览器镜像：`data/development-templates.js`

DOCX 与 Markdown 是审计母版，导入器按系统 ID 确定性拆分。生成时只读公共规则和与已确认竞品系统匹配的系统文档，不得每次加载 64 份文档。母版资产为保证哈希与可审计性保留原文，中文运行说明与拆分系统文档作为实际调用入口。

## 单系统文档结构

S01-S64 保留 v3 的策划判断、P0/P1 范围、目标/层级/适用性、状态流和 A-H：

- A：开启、前置、操作、后续与恢复；
- B：UI 页面、元素、布局、交互与状态；
- C：脚本、Prefab 与权威归属；
- D：字段级结构和迁移；
- E：美术、音频、技术资源与路径；
- F：分析事件；G：性能预算；H：测试和发布门槛。

## 事实隔离与选择

1. 从 `systemGameplay.systems[]` 开始，不从类型矩阵开始。
2. 无证据 ID 且未明确确认的系统排除。
3. 优先准确 `templateSystemId`；规范化名称只有唯一命中时才接受。
4. 只读取命中文档并合并为一份开发文档。
5. 竞品事实、策划判断和母版基线必须清楚分层。
6. 不得暗示竞品使用母版脚本、状态、数据结构、资源路径或生产规则。

类型矩阵只帮助检查调研覆盖，不会自动生成竞品系统。

## 美术资源清单

输出一份 UTF-8 清单，合并命中系统 Part B 的 UI 行和 Part E 的美术/音频/技术资源行，并保留 `来源类型` 便于筛选。互动剧情模板只有在条件合法触发时才加入。

## 更新命令与验收

```bash
python scripts/import-development-template.py /path/to/v3-master.md \
  --docx-source /path/to/v3-master.docx \
  --json references/development-template-catalog.json \
  --js data/development-templates.js \
  --docx-asset assets/game-system-development-template-library-v3.0.docx \
  --markdown-asset assets/game-system-development-template-library-v3.0.md \
  --systems-dir references/development-templates-v3/systems \
  --shared references/development-templates-v3/shared/global.md
```

导入后核验两项哈希、32 种游戏类型、64 份系统文件、UI/资源清单、HTML 预览和四项用户导出。
