#!/usr/bin/env python3
"""Split the v3 Markdown master into per-system documents and browser catalogs."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path


SYSTEM_HEADING = re.compile(r"^## (S\d{2})[｜|](.+?)\s*$", re.MULTILINE)
INDEX_HEADING = "# 6. 系统模板索引"
GAME_TYPE_HEADING = "# 5. 游戏类型P0/P1选型矩阵"
SECTION_LABELS = {
    "A": "功能开启、前置、操作与后置",
    "B": "UI界面、按钮、布局与交互状态",
    "C": "脚本、Prefab挂载与权威归属",
    "D": "表结构：新增表与原表新增字段/值",
    "E": "资源需求：规格、源文件与运行路径",
    "F": "本系统埋点事件清单",
    "G": "性能指标",
    "H": "QA用例",
}


def clean(value: str) -> str:
    return " ".join(value.replace("\u00a0", " ").split())


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def split_terms(name: str) -> list[str]:
    base = re.sub(r"系统$", "", name)
    values = [base, *re.split(r"[、，,/与和]", base)]
    return list(dict.fromkeys(clean(value) for value in values if len(clean(value)) >= 2))


def expand_system_range(value: str) -> list[str]:
    value = re.split(r"[；;]", value)[0]
    result: list[str] = []
    for token in re.split(r"[，,、\s]+", value):
        token = token.strip()
        if not token:
            continue
        slash = re.fullmatch(r"(S\d{2})(?:/(S\d{2}))?", token)
        if slash:
            result.extend(item for item in slash.groups() if item)
            continue
        span = re.fullmatch(r"S(\d{2})[-–—]S?(\d{2})", token)
        if span:
            result.extend(f"S{number:02d}" for number in range(int(span.group(1)), int(span.group(2)) + 1))
            continue
        if re.fullmatch(r"S\d{2}", token):
            result.append(token)
    return list(dict.fromkeys(result))


def table_after(text: str, heading: str, stop_pattern: str = r"\n(?:#|###) ") -> tuple[list[str], list[dict[str, str]]]:
    start = text.find(heading)
    if start < 0:
        return [], []
    block = text[start + len(heading):]
    stop = re.search(stop_pattern, block)
    if stop:
        block = block[:stop.start()]
    lines = block.splitlines()
    table_lines: list[str] = []
    collecting = False
    for line in lines:
        if line.strip().startswith("|"):
            collecting = True
            table_lines.append(line.strip())
        elif collecting:
            break
    if len(table_lines) < 2:
        return [], []
    parsed = [[clean(cell) for cell in line.strip("|").split("|")] for line in table_lines]
    columns = parsed[0]
    rows = []
    for row in parsed[2:]:
        row = (row + [""] * len(columns))[:len(columns)]
        rows.append(dict(zip(columns, row)))
    return columns, rows


def chapter(text: str, heading: str, next_heading: str | None = None) -> str:
    start = text.find(heading)
    if start < 0:
        return ""
    end = text.find(next_heading, start + len(heading)) if next_heading else -1
    return text[start:end if end >= 0 else None].strip()


def flatten_rows(section_rows: dict[str, list[dict[str, str]]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for code in ["A", "C", "D", "F", "G", "H"]:
        for row in section_rows.get(code, []):
            values = [f"{key}：{value}" for key, value in row.items() if value]
            rows.append({
                "部分": f"{code}｜{SECTION_LABELS[code]}",
                "项目": next(iter(row.values()), ""),
                "规格": "；".join(values[1:]) if len(values) > 1 else "",
                "归属": row.get("归属") or row.get("来源") or row.get("端/对象") or row.get("类型") or "项目适配",
            })
    return rows


def parse_template(markdown_source: Path, docx_source: Path, systems_dir: Path, shared_path: Path) -> dict:
    text = markdown_source.read_text(encoding="utf-8")
    matches = list(SYSTEM_HEADING.finditer(text))
    if len(matches) != 64:
        raise ValueError(f"v3 母版应包含 64 个系统，实际找到 {len(matches)} 个")

    _, index_rows = table_after(text, INDEX_HEADING, r"\n# 7\.")
    index_by_id = {row.get("系统ID"): row for row in index_rows if re.fullmatch(r"S\d{2}", row.get("系统ID", ""))}
    if len(index_by_id) != 64:
        raise ValueError(f"系统索引应包含 64 行，实际找到 {len(index_by_id)} 行")

    _, game_rows = table_after(text, GAME_TYPE_HEADING, r"\n# 6\.")
    game_types = []
    for row in game_rows:
        game_id = row.get("类型", "")
        if not re.fullmatch(r"G\d{2}", game_id):
            continue
        p0 = expand_system_range(row.get("P0核心/基础", ""))
        p1 = expand_system_range(row.get("P1候选（须有证据）", ""))
        game_types.append({
            "id": game_id,
            "name": row.get("游戏类型", ""),
            "corePrototype": row.get("核心原型", ""),
            "p0SystemIds": p0,
            "p1SystemIds": p1,
            "recommendedSystemIds": list(dict.fromkeys([*p0, *p1])),
        })

    source_md_hash = sha256(markdown_source)
    source_docx_hash = sha256(docx_source)
    systems_dir.mkdir(parents=True, exist_ok=True)
    systems = []
    manifest_systems = []
    for index, match in enumerate(matches):
        system_id, heading_name = match.group(1), clean(match.group(2))
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.start():end].strip()
        next_chapter = re.search(r"\n# 8\.", block)
        if next_chapter:
            block = block[:next_chapter.start()].rstrip()
        system_path = systems_dir / f"{system_id}.md"
        system_path.write_text(
            f"---\ntemplate_version: 3.0.0\nsystem_id: {system_id}\nsystem_name: {heading_name}\nsource_markdown_sha256: {source_md_hash}\n---\n\n{block}\n",
            encoding="utf-8",
        )
        index_row = index_by_id[system_id]
        section_rows: dict[str, list[dict[str, str]]] = {}
        section_columns: dict[str, list[str]] = {}
        for code in SECTION_LABELS:
            heading_match = re.search(rf"^### {code}[.｜].*$", block, re.MULTILINE)
            if not heading_match:
                section_columns[code], section_rows[code] = [], []
                continue
            section_columns[code], section_rows[code] = table_after(block, heading_match.group(0))

        judgment_match = re.search(r"^\| 策划判断[　 ]+(.+?) \|$", block, re.MULTILINE)
        target_match = re.search(r"^目标：(.+?)｜层级：(.+?)｜适用：(.+?)(?:｜优先级：(.+))?$", block, re.MULTILINE)
        state_match = re.search(r"^标准状态：(.+)$", block, re.MULTILINE)
        acceptance_match = re.search(r"^(?:模板验收|验收基线)：(.+)$", block, re.MULTILINE)
        scope_columns, scope_rows = table_after(block, "| 范围 |")
        ui_columns, ui_rows = section_columns["B"], section_rows["B"]
        art_columns, art_rows = section_columns["E"], section_rows["E"]
        systems.append({
            "id": system_id,
            "name": index_row.get("系统", heading_name),
            "defaultPriority": index_row.get("默认级别", ""),
            "matchTerms": split_terms(index_row.get("系统", heading_name)),
            "layer": target_match.group(2) if target_match else index_row.get("层级", ""),
            "indexLayer": index_row.get("层级", ""),
            "applicableGames": [item for item in re.split(r"[、，,]", target_match.group(3) if target_match else index_row.get("适用游戏", "")) if item],
            "planningJudgment": judgment_match.group(1) if judgment_match else "",
            "scopeColumns": scope_columns,
            "scopeRows": scope_rows,
            "feature": target_match.group(1) if target_match else "",
            "priority": (target_match.group(4) if target_match and target_match.group(4) else index_row.get("默认级别", "")),
            "stateFlow": state_match.group(1) if state_match else "",
            "sections": {code: {"title": SECTION_LABELS[code], "columns": section_columns[code], "rows": section_rows[code]} for code in SECTION_LABELS},
            "developmentColumns": ["部分", "项目", "规格", "归属"],
            "developmentRows": flatten_rows(section_rows),
            "uiColumns": ui_columns,
            "uiRows": ui_rows,
            "schemaColumns": section_columns["D"],
            "schemaRows": section_rows["D"],
            "artColumns": art_columns,
            "artRows": art_rows,
            "analyticsColumns": section_columns["F"],
            "analyticsRows": section_rows["F"],
            "performanceColumns": section_columns["G"],
            "performanceRows": section_rows["G"],
            "qaColumns": section_columns["H"],
            "qaRows": section_rows["H"],
            "acceptance": acceptance_match.group(1) if acceptance_match else "按本系统 A–H 规格、项目发布闸门和证据约束验收。",
            "templateDocument": f"references/development-templates-v3/systems/{system_id}.md",
        })
        manifest_systems.append({"id": system_id, "name": index_row.get("系统", heading_name), "document": f"systems/{system_id}.md", "sha256": sha256(system_path)})

    shared_parts = [chapter(text, "# 0.", "# 7."), chapter(text, "# 8.", None)]
    shared_path.parent.mkdir(parents=True, exist_ok=True)
    shared_path.write_text(
        f"---\ntemplate_version: 3.0.0\nsource_markdown_sha256: {source_md_hash}\n---\n\n# v3.0 共享策划与交付规则\n\n" + "\n\n".join(part for part in shared_parts if part) + "\n",
        encoding="utf-8",
    )
    manifest = {
        "version": "3.0.0",
        "sourceMarkdownSha256": source_md_hash,
        "sourceDocxSha256": source_docx_hash,
        "sharedDocument": "shared/global.md",
        "systems": manifest_systems,
    }
    (shared_path.parent.parent / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return {
        "meta": {
            "catalogVersion": "3.0.0",
            "sourceFile": "game-system-development-template-library-v3.0.docx",
            "sourceMarkdownFile": "game-system-development-template-library-v3.0.md",
            "sourceSha256": source_docx_hash,
            "sourceMarkdownSha256": source_md_hash,
            "gameTypeCount": len(game_types),
            "systemCount": len(systems),
            "splitManifest": "references/development-templates-v3/manifest.json",
            "sharedDocument": "references/development-templates-v3/shared/global.md",
            "selectionRule": "Load only the per-system v3 documents matched to evidenced competitor systems; merge selected systems into one output document.",
        },
        "projectMetadataFields": table_after(text, "# 0. 项目元数据模板")[1],
        "gameTypes": game_types,
        "systems": systems,
        "globalRules": [
            "只加载竞品证据确认且明确匹配的系统文档；类型推荐仅作调研清单，不得作为竞品事实。",
            "生成时将所有命中的独立系统模板整合为一份开发文档，并保持竞品事实、策划判断与母版建议分离。",
            "美术清单必须合并 UI 界面/元素与其他资源需求，并标注所属系统、来源部分和生产规格。",
            "不复制竞品专有名称、数值、剧情、美术、音频或受保护资产；缺失事实必须标记假设或证据缺口。",
        ],
        "definitionOfDone": [
            "每个生成系统均有证据 ID、版本日期、目标、状态、规则、端归属、数据、UI、资源、埋点、性能和 QA 口径。",
            "输出为单一整合 MD 文档、浏览器 PDF、AI JSON，以及一份同时包含 UI 与资源的美术资源 List。",
            "所有模板引用可追溯到系统独立文档、v3.0 源文件及 SHA-256。",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("markdown_source", type=Path)
    parser.add_argument("--docx-source", required=True, type=Path)
    parser.add_argument("--json", required=True, type=Path)
    parser.add_argument("--js", required=True, type=Path)
    parser.add_argument("--docx-asset", required=True, type=Path)
    parser.add_argument("--markdown-asset", required=True, type=Path)
    parser.add_argument("--systems-dir", required=True, type=Path)
    parser.add_argument("--shared", required=True, type=Path)
    args = parser.parse_args()

    catalog = parse_template(args.markdown_source, args.docx_source, args.systems_dir, args.shared)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.js.parent.mkdir(parents=True, exist_ok=True)
    args.docx_asset.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_asset.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.js.write_text("window.GAME_DEV_TEMPLATES = " + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    shutil.copy2(args.docx_source, args.docx_asset)
    shutil.copy2(args.markdown_source, args.markdown_asset)
    print(json.dumps(catalog["meta"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
