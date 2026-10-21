# 知识结构 v1.4

## 根结构与游戏身份

```json
{"meta":{"skillVersion":"1.3.0","schemaVersion":"1.4.0","updatedAt":null},"games":[]}
```

发行包的 `games` 必须为空。游戏身份为：

```json
{"id":"stable-slug","canonicalName":"名称","aliases":[],"versions":[]}
```

旧版本永不改写；每个版本都是完整快照，不只是差异。

## 版本快照

必需元数据：`versionId`（游戏内唯一）、`collectedAt`、`collectionMode`（`full`/`incremental`）、`coverage:{from,to}`（`YYYY-MM-DD`，全量时 `from:null`）、`versionNotes`、`sources[]`。

### basic

字段：`name`、`englishName`、`developer`、`publisher`、`genres[]`、`platforms[]`、`regions[]`、`releaseDate`、`status`、`businessModel`、`currentVersion`、`officialSites[]`、`storeIdentifiers[]`、`summary`、`operatingDuration`、`stageRevenue[]`、`dailyActiveUsers[]`、`targetAudience`、`marketMetrics[]`、`basicMetrics[]`、`evidenceGaps[]`。

- `operatingDuration`：`{launchDate,asOf,days,display,scope,evidenceIds[]}`，由已验证上线日计算。
- `storeIdentifiers[]`：`{platform,id,url,region,evidenceIds[]}`，保存 App Store ID、Google Play 包名、Steam AppID 等稳定 ID。
- `stageRevenue[]`：`{period,value,unit,currency,scope,metric,sourceProvider,sourceType,estimateType,confidence,evidenceIds[]}`，区分报告值、模型估算和推断。
- `dailyActiveUsers[]`：`{value,unit,asOf,scope,sourceProvider,sourceType,estimateType,confidence,evidenceIds[]}`。
- `targetAudience`：`{summary,segments[],ageRanges[],genderTendency,regions[],motivations[],behaviors[],spendingProfiles[],confidence,evidenceIds[]}`。
- `marketMetrics[]`：`{metric,label,platform,value,unit,rank,chart,period,asOf,region,scope,sourceProvider,sourceType,automation,estimateType,confidence,evidenceIds[]}`。未使用值应省略，不能造占位值。常用 `metric`：`chartRank`、`rating`、`reviewCount`、`downloadRange`、`currentPlayers`、`peak24h`、`allTimePeak`、`averagePlayers30d`、`ownerEstimate`、`price`、`discount`、`version`、`revenueEstimate`、`dau`、`mau`、`liveOpsEventCount`、`featureScore`。
- 兼容基础指标：`{name,value,unit,asOf,scope,sourceProvider,sourceType,estimateType,confidence,evidenceIds[]}`。

### systemGameplay

- `taxonomy`：`{marketGenres[],mainCorePrototype,secondaryCorePrototypes[]}`；另有 `playerMotivation[]`。
- `coreGameplay`：`{fantasy,primaryActions[],primaryDecisions[],skillDimensions[],sessionStructure,evidenceIds[]}`。
- `coreLoop`：`{steps[],reset,success,failure,evidenceIds[]}`；`metaLoop`：`{steps[],cadence,evidenceIds[]}`。
- `visualPresentation` 包含：
  - `spatialPresentation`：`{dimensionality,camera,projection,coordinateRules[],depthOrdering,occlusion,evidenceIds[]}`；
  - `sceneArt`：`{artDirection,assetFamilies[],perspectiveAndScale,lightingAndShadow,materialsAndPalette,animationStates[],environmentComposition,evidenceIds[]}`；
  - `mainInterfaceComposition`：`{sceneScreenRatio,hudSafeZones[],entryPlacement[],worldSpaceElements[],screenSpaceElements[],navigationPattern,negativeConstraints[],evidenceIds[]}`；
  - `visualAcceptance`：`{styleFrameRequirements[],blockoutRequirements[],similarityTargets[],rejectionCriteria[],reviewMethod,evidenceIds[]}`。
- 视觉字段必须由官方截图/视频、商店媒体、可信实机或其他证据支持；只描述可观察表现，不从像素推断引擎。
- `systemLayers` 使用 `core/progression/content/economy/social/liveOps/monetization`，每层为 `{status,summary,systems[]}`。
- `systems[]`：`{name,templateSystemId,templateMatch,layer,purpose,actors[],entryConditions[],inputs[],rules[],states[],outputs[],dependencies[],uiFeedback[],dataEntities[],analyticsEvents[],contentCadence,edgeCases[],risks[],acceptanceCriteria[],evidenceIds[]}`。
- `templateSystemId` 仅在系统事实已有证据后填写准确 S01-S64 ID。`templateMatch` 可为 `{status,matchedBy,confidence,reason}`；`confirmed` 不替代事实证据。
- 类型推荐只保留在工作记录 `_researchChecklist.developmentTemplate.recommendedSystemIds`，不得复制进 `systems[]`。
- 另有 `features[]`、`keyMetrics[]`、`designObservations[]`、`evidenceGaps[]`。

### commercialization

- `paymentPoints[]`：`{name,category,value,priceTiers[],currency,availability,cadence,payToWinRisk,evidenceIds[]}`。
- `updateCadence`：`{minorDays,majorDays,seasonDays,observedWindow,evidenceIds[]}`。
- `regularActivities[]`：`{name,type,cadence,mechanism,reward,commercialGoal,evidenceIds[]}`。
- `priceTierSummary`：`{count,min,max,currency,notes,evidenceIds[]}`。
- `themedActivities[]`：`{name,type,period,mechanism,commercialHook,evidenceIds[]}`。
- `observations[]`、`evidenceGaps[]`。

### community

- `channels[]`：`{name,url,role,audience,contentTypes[],frequency,evidenceIds[]}`。
- `regularActivities[]`：`{name,type,cadence,mechanism,evidenceIds[]}`。
- `specialActivities[]`：`{name,type,period,mechanism,evidenceIds[]}`。
- `observations[]`、`evidenceGaps[]`。

### sources

`{id,title,url,publisher,publishedAt,accessedAt,sourceProvider,sourceType,accessMode,scope}`。`sourceType` 可为 `official-api`、`official-page`、`third-party-observed`、`modeled-estimate`、`public-report`、`licensed-export`；`accessMode` 可为 `api`、`page`、`manual`、`import`。使用 `S001` 等稳定 ID，所有事实中的证据 ID 必须能在此找到。

## 调研记录输入

`upsert-research.mjs` 接受：

```json
{"game":{"id":"slug","canonicalName":"名称","aliases":[]},"snapshot":{"...":"完整快照"}}
```

工作记录可含 `_researchChecklist`，写入时会删除。其 `{developmentTemplate:{gameTypeId,gameType,corePrototype,recommendedSystemIds},rule}` 只是调研清单，不是快照事实。
