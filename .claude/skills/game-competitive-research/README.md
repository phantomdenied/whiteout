# 游戏竞品研究库：通用 Agent Skills 安装与兼容说明

## 包的定位

这是不包含 Codex Plugin 清单的中文核心技能包。它以 `SKILL.md` 为唯一技能入口，附带离线 HTML、执行脚本、参考规范、开发母版和空白知识库，可安装到支持 Agent Skills 或自定义技能目录的平台。

发行包不包含任何已采集游戏；`data/knowledge.json` 中的 `games` 必须为 `[]`。

## 推荐安装位置

解压后保持目录名为 `game-competitive-research`，并将整个目录放入目标平台可写的技能根目录。

- 通用项目级 Agent Skills：`<项目>/.agents/skills/game-competitive-research/`
- OpenClaw 工作区：`<工作区>/skills/game-competitive-research/` 或 `<工作区>/.agents/skills/game-competitive-research/`
- Cursor 项目级技能：`<项目>/.agents/skills/game-competitive-research/` 或 `<项目>/.cursor/skills/game-competitive-research/`
- 其他平台：放入该平台配置的技能根目录，并确认平台能够发现目录中的 `SKILL.md`

安装完成后重新开启 Agent 会话，让平台重新扫描技能元数据。可直接提出“调研某款游戏并更新竞品知识库”，也可显式调用 `game-competitive-research`。

## 运行条件

- Node.js 18 或更高版本
- 现代浏览器，用于直接打开 `index.html`
- 技能目录、`data/` 和 `outputs/` 的读写权限
- 网络采集时需要平台具备网页搜索/浏览能力，或者由用户在 HTML 页面中显式选择 OpenAI、Anthropic、Google Gemini、xAI、Perplexity、智谱 GLM 之一并提供单次 API Key
- Python 3 为可选项，仅在重新导入 DOCX/XLSX 开发母版时需要

脚本不依赖第三方 Node.js 包，无需运行 `npm install`。

## 首次验证

在技能根目录执行：

```bash
node scripts/validate-knowledge.mjs data/knowledge.json
node scripts/smoke-test-html.mjs
```

验证通过后直接打开 `index.html`。

空白状态下可以通过页面加号输入游戏名；如果平台没有联网研究工具，仍可导入已有知识库并使用查看、比较、竞品报告和开发文档功能。

## 数据保存与升级

本包采用自包含目录，研究数据默认写入：

```text
data/knowledge.json
data/knowledge.js
outputs/
```

升级技能之前必须备份以上文件或目录。新版解压后，先保留新版程序、模板与规范，再恢复本地知识库和输出；恢复后执行：

```bash
node scripts/sync-html-data.mjs data/knowledge.json
node scripts/validate-knowledge.mjs data/knowledge.json
```

不要把包含本地游戏数据的副本作为公开发行包。

## 平台能力降级

- 没有网页搜索：不能自动完成新游戏网络调研，但可以使用全部本地知识功能。
- 没有终端执行：可以打开 HTML、导入和导出浏览器数据，但不能运行知识校验或开发包 CLI。
- 技能目录只读：先复制到工作区可写目录，否则知识库与输出无法持久保存。
- 不支持 Agent Skills：仍可将 `SKILL.md` 作为系统指令导入，并把整个目录作为附件或工作区资源提供给 Agent；具体自动发现和命令执行能力取决于该平台。

## 不包含的专用内容

本核心包不包含 `.codex-plugin/plugin.json`、`agents/openai.yaml`、Codex 插件缓存、平台市场清单或任何平台专用安装器。目标平台如需专用插件清单，应在核心包外另建适配层，不要修改核心工作流和数据规范。
