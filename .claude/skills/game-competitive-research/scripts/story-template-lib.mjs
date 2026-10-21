const list = (value) => Array.isArray(value) ? value : [];

function confirmedSystems(snapshot) {
  return list(snapshot?.systemGameplay?.systems).filter((system) =>
    system?.templateMatch?.status === "confirmed" || list(system?.evidenceIds).length > 0
  );
}

export function selectStoryDevelopmentTemplate(snapshot, template) {
  const activation = template?.activation || {};
  const haystack = [
    ...list(snapshot?.basic?.genres),
    ...list(snapshot?.systemGameplay?.taxonomy?.marketGenres),
    snapshot?.systemGameplay?.taxonomy?.mainCorePrototype,
    ...list(snapshot?.systemGameplay?.taxonomy?.secondaryCorePrototypes),
    snapshot?.basic?.summary,
  ].filter(Boolean).join("｜").toLowerCase();
  const matchedKeywords = list(activation.genreKeywords).filter((keyword) => haystack.includes(String(keyword).toLowerCase()));
  const allowedIds = new Set(list(activation.systemTemplateIds));
  const matchedSystems = confirmedSystems(snapshot).filter((system) => allowedIds.has(String(system.templateSystemId || "").toUpperCase()));
  const applied = matchedKeywords.length > 0 || matchedSystems.length >= 2;
  return {
    applied,
    matchedKeywords,
    matchedSystems,
    reason: applied
      ? matchedKeywords.length ? `类型关键词：${matchedKeywords.join("、")}` : `已证实剧情系统：${matchedSystems.map((system) => system.name).join("、")}`
      : "未命中剧情互动类型，且已证实剧情母版系统少于两个",
  };
}

export function buildArtResourceRows(selection, storySelection, storyTemplate) {
  const rows = [];
  for (const item of selection.matched || []) {
    const uiColumns = list(item.template?.uiColumns);
    list(item.template?.uiRows).forEach((row, index) => {
      rows.push({
        systemTemplateId: item.template.id,
        systemName: item.system.name,
        resourceIndex: index + 1,
        sourceType: "UI界面与元素",
        fields: Object.fromEntries(uiColumns.map((column) => [column, row?.[column] ?? ""])),
      });
    });
    const columns = list(item.template?.artColumns);
    list(item.template?.artRows).forEach((row, index) => {
      rows.push({
        systemTemplateId: item.template.id,
        systemName: item.system.name,
        resourceIndex: index + 1,
        sourceType: "美术/音频/技术资源",
        fields: Object.fromEntries(columns.map((column) => [column, row?.[column] ?? ""])),
      });
    });
  }
  if (storySelection.applied) {
    list(storyTemplate?.artResourceRows).forEach((row, index) => {
      rows.push({
        systemTemplateId: "STORY",
        systemName: "剧情互动制作",
        resourceIndex: index + 1,
        sourceType: "剧情互动条件母版",
        fields: { ...row },
      });
    });
  }
  return rows;
}

const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export function artResourceCsv(rows) {
  const fieldNames = [...new Set(rows.flatMap((row) => Object.keys(row.fields || {})))];
  const header = ["系统ID", "系统名称", "资源序号", "来源类型", ...fieldNames];
  const lines = rows.map((row) => [row.systemTemplateId, row.systemName, row.resourceIndex, row.sourceType, ...fieldNames.map((field) => row.fields?.[field] ?? "")]);
  return `\uFEFF${[header, ...lines].map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
}
