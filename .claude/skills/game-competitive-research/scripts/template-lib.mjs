const NORMALIZE_PATTERN = /[\s\-—–_·:：,，、/（）()]+/g;

export function normalizeSystemName(value) {
  return String(value || "").replace(/系统$/u, "").replace(NORMALIZE_PATTERN, "").toLowerCase();
}

export function findTemplateForSystem(system, catalog) {
  const templates = Array.isArray(catalog?.systems) ? catalog.systems : [];
  const explicitId = String(system?.templateSystemId || "").toUpperCase();
  if (explicitId) {
    const explicit = templates.find((item) => item.id === explicitId);
    return explicit
      ? { status: "matched", template: explicit, matchedBy: "templateSystemId" }
      : { status: "unmatched", reason: `未知母版系统 ID：${explicitId}` };
  }

  const candidate = normalizeSystemName(system?.name);
  if (!candidate) return { status: "unmatched", reason: "系统名称为空" };
  const matches = templates.filter((template) => {
    const terms = [template.name, ...(template.matchTerms || [])];
    return terms.some((term) => normalizeSystemName(term) === candidate);
  });
  if (matches.length === 1) return { status: "matched", template: matches[0], matchedBy: "unambiguous-name" };
  if (matches.length > 1) return { status: "unmatched", reason: `系统名命中多个母版：${matches.map((item) => item.id).join("、")}` };
  return { status: "unmatched", reason: "母版中没有无歧义同名系统；请人工填写 templateSystemId" };
}

export function selectDevelopmentTemplates(snapshot, catalog, options = {}) {
  const includeUnverified = Boolean(options.includeUnverified);
  const matched = [];
  const unmatched = [];
  const excluded = [];
  for (const system of snapshot?.systemGameplay?.systems || []) {
    const confirmed = system?.templateMatch?.status === "confirmed" || (system?.evidenceIds || []).length > 0;
    if (!confirmed && !includeUnverified) {
      excluded.push({ system, reason: "没有证据 ID，也未标记 templateMatch.status=confirmed" });
      continue;
    }
    const result = findTemplateForSystem(system, catalog);
    if (result.status === "matched") matched.push({ system, template: result.template, matchedBy: result.matchedBy });
    else unmatched.push({ system, reason: result.reason });
  }
  return { matched, unmatched, excluded };
}

