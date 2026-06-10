const { listAllAssets } = require('./asset.service');
const { searchSlices } = require('./asset-slice.service');
const { getProject } = require('./project.service');
const { generateJsonWithSeed2 } = require('../providers/volcengine/seed2.client');
const { resolveDialogueLanguage, languageInstruction } = require('./language-policy.service');

function shortText(value, max = 700) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function sceneId(scene, index = 0) {
  return scene.id || scene.sceneId || `scene_${index + 1}`;
}

function idList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

function compactScene(scene = {}, index = 0) {
  return {
    sceneId: sceneId(scene, index),
    order: scene.order || scene.sceneOrder || index + 1,
    sceneRole: scene.sceneRole || 'selling_point',
    duration: scene.duration || scene.durationSeconds || 3,
    sellingPoint: scene.sellingPoint || '',
    narrativeGoal: scene.narrativeGoal || '',
    visualDescription: scene.visualDescription || '',
    cameraMovement: scene.cameraMovement || scene.cameraMotion || '',
    voiceover: scene.voiceover || scene.narration || scene.scriptText || '',
    subtitle: scene.subtitle || scene.subtitleText || '',
    dialogueLanguage: scene.dialogueLanguage || '',
    bgm: scene.bgm || scene.bgmHint || '',
    constraints: scene.constraints || {},
    assetRequirements: scene.assetRequirements || {},
    selectedAssetIds: idList(scene.selectedAssetIds),
    selectedAssetSliceIds: idList(scene.selectedAssetSliceIds),
  };
}

function compactAsset(asset = {}) {
  const tags = [...new Set([...(asset.tags || []), ...(asset.systemTags || []), ...(asset.userTags || []), ...(asset.analysis?.tags || [])])].slice(0, 16);
  return {
    assetId: asset.id || asset.assetId || asset.materialId,
    title: asset.title || asset.name || asset.originalName || '',
    mediaType: asset.mediaType || asset.type || '',
    assetType: asset.assetType || asset.type || '',
    source: asset.source || '',
    tags,
    isProductIdentityCandidate: isImageAsset(asset) && isProductLikeAsset(asset),
    summary: shortText(asset.analysis?.summary || asset.description || asset.title || '', 500),
    product: asset.analysis?.product || null,
    sellingPoints: asset.analysis?.sellingPoints || asset.analysis?.product?.sellingPoints || [],
    usageScenarios: asset.analysis?.usageScenarios || [],
    visualStyle: asset.analysis?.visualStyle || asset.analysis?.visual?.style || '',
    thumbnailUrl: asset.thumbnailUrl || asset.fileUrl || asset.url || '',
  };
}

function isImageAsset(asset = {}) {
  return asset.mediaType === 'image' || asset.type === 'image' || String(asset.mimeType || '').startsWith('image/');
}

function isProductLikeAsset(asset = {}) {
  const text = JSON.stringify([
    asset.title,
    asset.name,
    asset.assetType,
    asset.type,
    asset.tags,
    asset.systemTags,
    asset.userTags,
    asset.analysis?.tags,
    asset.analysis?.summary,
    asset.analysis?.product,
  ]).toLowerCase();
  return ['product', 'bottle', 'pack', 'package', 'label', 'close_up', '商品', '产品', '瓶', '包装'].some((token) => text.includes(token));
}

function sceneRequiresProduct(scene = {}, index = 0) {
  const role = String(scene.sceneRole || scene.role || '').toLowerCase();
  if (['transition'].includes(role)) return false;
  if (index < 4) return true;
  return ['hook', 'product_closeup', 'usage_demo', 'selling_point', 'comparison', 'cta'].includes(role);
}

function pickDefaultProductAssetId(assets = []) {
  const imageAssets = assets.filter(isImageAsset);
  const productImage = imageAssets.find(isProductLikeAsset);
  return (productImage || imageAssets[0] || null)?.id || null;
}

function compactSlice(slice = {}) {
  return {
    sliceId: slice.id,
    assetId: slice.assetId,
    startTime: slice.startTime,
    endTime: slice.endTime,
    duration: slice.duration,
    visualDescription: shortText(slice.visualDescription || slice.transcript || '', 450),
    tags: slice.tags || [],
    usageSuggestion: slice.metadata?.analysis?.usageSuggestion || slice.usageSuggestion || '',
    thumbnailUrl: slice.thumbnailUrl || '',
  };
}

function productAnchorPrompt(primaryProductAssetId) {
  if (!primaryProductAssetId) return '';
  return [
    `The selected product reference image (${primaryProductAssetId}) is the product identity reference.`,
    'The same product bottle/package should appear naturally and recognizably in the scene.',
    'Use the reference image to understand the product object, packaging, label, color, and proportions.',
    noCopyAssetEnvironmentPrompt(),
    'Vary composition, camera angle, background, and action across scenes while following the storyboard script.',
    'Do not replace it with perfume, skincare, beverage, generic spray, or unrelated bottle.',
  ].join(' ');
}

function normalizeProductReferenceRole(value) {
  return ['product_reference', 'identity_reference', 'reference'].includes(value) ? value : 'product_reference';
}

function noCopyAssetEnvironmentPrompt() {
  return 'Use asset references only for product identity. Do not copy the reference asset background, room, tabletop, lighting, camera angle, pose, layout, or composition. The environment, action, camera, and composition must come from this storyboard scene.';
}

function normalizeStringList(value, fallback = [], max = 8) {
  const rows = Array.isArray(value) ? value : value ? [value] : fallback;
  return rows.map((item) => shortText(item, 220)).filter(Boolean).slice(0, max);
}

function buildDefaultStoryboardConsistency(project = {}, scenes = [], defaultProductAssetId = null) {
  return {
    productIdentity: [
      project?.productName ? `Main product: ${project.productName}` : 'Main product must stay the same across all scenes.',
      project?.productCategory ? `Category: ${project.productCategory}` : '',
      defaultProductAssetId ? `Use asset ${defaultProductAssetId} only to understand product identity, package shape, label, color, and proportions.` : '',
    ].filter(Boolean).join(' '),
    brandVisualStyle: shortText(project?.style || 'Clean commercial realism with platform-native e-commerce pacing.', 260),
    worldSetting: 'Each scene environment must follow its own storyboard visualDescription and narrativeGoal, not the uploaded asset background.',
    characterContinuity: 'Keep hands, scale, product size, label orientation, and use context plausible across scenes.',
    cameraLanguage: 'Use varied camera angles and motion while preserving the same product identity and script intent.',
    sceneDiversityPlan: scenes.map((scene, index) => shortText(`Scene ${index + 1}: ${scene.visualDescription || scene.narrativeGoal || scene.subtitle || scene.sceneRole || 'unique script-driven composition'}`, 220)).slice(0, 10),
    doNotCopyFromAssets: ['background', 'room', 'tabletop', 'lighting', 'camera angle', 'pose', 'layout', 'composition'],
  };
}

function normalizeStoryboardConsistency(raw = {}, project = {}, scenes = [], defaultProductAssetId = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const fallback = buildDefaultStoryboardConsistency(project, scenes, defaultProductAssetId);
  return {
    productIdentity: shortText(source.productIdentity || fallback.productIdentity, 360),
    brandVisualStyle: shortText(source.brandVisualStyle || fallback.brandVisualStyle, 260),
    worldSetting: shortText(source.worldSetting || fallback.worldSetting, 320),
    characterContinuity: shortText(source.characterContinuity || fallback.characterContinuity, 320),
    cameraLanguage: shortText(source.cameraLanguage || fallback.cameraLanguage, 320),
    sceneDiversityPlan: normalizeStringList(source.sceneDiversityPlan, fallback.sceneDiversityPlan, 10),
    doNotCopyFromAssets: normalizeStringList(source.doNotCopyFromAssets, fallback.doNotCopyFromAssets, 10),
  };
}

function storyboardConsistencyPrompt(consistency = {}) {
  if (!consistency || typeof consistency !== 'object') return '';
  return [
    consistency.productIdentity ? `Global product identity: ${consistency.productIdentity}` : '',
    consistency.brandVisualStyle ? `Global brand visual style: ${consistency.brandVisualStyle}` : '',
    consistency.worldSetting ? `World setting rule: ${consistency.worldSetting}` : '',
    consistency.characterContinuity ? `Continuity rule: ${consistency.characterContinuity}` : '',
    consistency.cameraLanguage ? `Camera continuity: ${consistency.cameraLanguage}` : '',
    Array.isArray(consistency.doNotCopyFromAssets) && consistency.doNotCopyFromAssets.length
      ? `Never copy these reference-asset traits: ${consistency.doNotCopyFromAssets.join(', ')}.`
      : '',
  ].filter(Boolean).join('\n');
}

function defaultSceneContinuityNotes(scene = {}, index = 0) {
  return shortText([
    `Scene ${index + 1} must preserve the same product identity as other scenes.`,
    scene.voiceover ? `Match voiceover meaning: ${scene.voiceover}` : '',
    scene.subtitle ? `Match subtitle: ${scene.subtitle}` : '',
  ].filter(Boolean).join(' '), 360);
}

function defaultSceneDiversityInstruction(scene = {}, index = 0) {
  return shortText([
    `Make scene ${index + 1} visually distinct from adjacent scenes.`,
    scene.visualDescription ? `Use this scene-specific environment/action: ${scene.visualDescription}.` : '',
    scene.cameraMovement ? `Camera direction: ${scene.cameraMovement}.` : '',
    'Do not reuse the uploaded product image environment as the scene setting.',
  ].filter(Boolean).join(' '), 360);
}

function buildFallbackPrompt(scene = {}, references = {}) {
  const assetHint = references.sourceReferenceAssetIds?.length
    ? `Use selected reference asset ids ${references.sourceReferenceAssetIds.join(', ')} to preserve the exact product identity, packaging, shape, color, and label.`
    : 'Preserve the exact product identity from the available project assets.';
  return [
    `Generate a vertical e-commerce video clip for storyboard scene ${scene.order || scene.sceneOrder || ''}.`,
    `Scene role: ${scene.sceneRole || 'selling_point'}. Duration: ${scene.duration || scene.durationSeconds || 3}s.`,
    scene.sellingPoint ? `Selling point: ${scene.sellingPoint}.` : '',
    scene.narrativeGoal ? `Narrative goal: ${scene.narrativeGoal}.` : '',
    scene.visualDescription ? `Visual direction: ${scene.visualDescription}.` : '',
    scene.cameraMovement ? `Camera movement: ${scene.cameraMovement}.` : '',
    scene.voiceover ? `Voiceover meaning: ${scene.voiceover}.` : '',
    scene.subtitle ? `Subtitle: ${scene.subtitle}.` : '',
    references.languageInstruction || '',
    scene.voiceover ? `Spoken dialogue to generate as audio: "${scene.voiceover}". Generate this line only in ${references.dialogueLanguage || scene.dialogueLanguage || 'the target language'}.` : '',
    scene.bgm ? `BGM cue: ${scene.bgm}.` : '',
    assetHint,
    productAnchorPrompt(references.primaryProductAssetId),
    storyboardConsistencyPrompt(references.storyboardConsistency),
    references.sceneContinuityNotes ? `Scene continuity notes: ${references.sceneContinuityNotes}` : '',
    references.sceneDiversityInstruction ? `Scene diversity instruction: ${references.sceneDiversityInstruction}` : '',
    noCopyAssetEnvironmentPrompt(),
    'Do not replace the product category or invent a different product. Keep all claims visually plausible and compliant.',
  ].filter(Boolean).join('\n');
}

function fallbackPlan(scene = {}, index = 0, reason = 'Seed2 planning fallback', defaultProductAssetId = null, storyboardConsistency = null) {
  const languagePolicy = resolveDialogueLanguage({ scenes: [scene], productInfo: scene.productInfo || {} }, scene.dialogueLanguage);
  const sourceReferenceAssetIds = idList(scene.selectedAssetIds);
  const sourceReferenceSliceIds = idList(scene.selectedAssetSliceIds);
  const mustShowProductInFrame = scene.mustShowProductInFrame !== undefined ? Boolean(scene.mustShowProductInFrame) : sceneRequiresProduct(scene, index);
  const primaryProductAssetId = scene.primaryProductAssetId || (mustShowProductInFrame ? defaultProductAssetId : null);
  const nextSourceReferenceAssetIds = primaryProductAssetId
    ? [primaryProductAssetId, ...sourceReferenceAssetIds.filter((id) => id !== primaryProductAssetId)]
    : sourceReferenceAssetIds;
  const sceneContinuityNotes = shortText(scene.sceneContinuityNotes || defaultSceneContinuityNotes(scene, index), 500);
  const sceneDiversityInstruction = shortText(scene.sceneDiversityInstruction || defaultSceneDiversityInstruction(scene, index), 500);
  return {
    sceneId: sceneId(scene, index),
    selectedAssetIds: nextSourceReferenceAssetIds,
    selectedAssetSliceIds: sourceReferenceSliceIds,
    sourceReferenceAssetIds: nextSourceReferenceAssetIds,
    sourceReferenceSliceIds,
    primaryProductAssetId,
    primaryProductReferenceRole: primaryProductAssetId ? 'product_reference' : null,
    mustShowProductInFrame,
    sceneContinuityNotes,
    sceneDiversityInstruction,
    seedancePrompt: buildFallbackPrompt(scene, {
      sourceReferenceAssetIds: nextSourceReferenceAssetIds,
      sourceReferenceSliceIds,
      primaryProductAssetId,
      storyboardConsistency,
      sceneContinuityNotes,
      sceneDiversityInstruction,
      dialogueLanguage: languagePolicy.dialogueLanguage,
      languageInstruction: languagePolicy.languageInstruction,
    }),
    dialogueLanguage: languagePolicy.dialogueLanguage,
    spokenDialogue: scene.voiceover || scene.narration || scene.scriptText || '',
    languageConsistencyNotes: languagePolicy.languageInstruction,
    negativePrompt: 'Do not create an unrelated product, different packaging, wrong product category, or unverifiable product claim.',
    referenceUsage: sourceReferenceAssetIds.length || sourceReferenceSliceIds.length
      ? 'Use selected project assets as product identity references.'
      : 'No reliable project asset reference was available.',
    productConsistencyRules: [
      'The generated video must follow the storyboard script.',
      'The main product must stay consistent with selected project assets.',
      primaryProductAssetId ? `Use ${primaryProductAssetId} only as the product identity reference.` : 'Upload a clear product image for stable identity.',
      noCopyAssetEnvironmentPrompt(),
      storyboardConsistency?.productIdentity ? `Global identity: ${storyboardConsistency.productIdentity}` : '',
      'Vary scene composition and do not repeat the same static product packshot.',
      'Do not copy public reference videos or introduce unrelated product objects.',
    ].filter(Boolean),
    scriptAlignmentNotes: 'Fallback prompt was built from the storyboard script.',
    reason,
    confidence: primaryProductAssetId ? 0.55 : sourceReferenceAssetIds.length || sourceReferenceSliceIds.length ? 0.45 : 0.25,
    provider: 'fallback',
  };
}

function validIds(ids, allowed) {
  return idList(ids).filter((id) => allowed.has(id));
}

function normalizeSeed2Plan(plan = {}, scene = {}, index = 0, assetsById, slicesById, imageAssetIds, defaultProductAssetId = null, storyboardConsistency = null) {
  const selectedAssetIds = validIds(plan.selectedAssetIds || plan.sourceReferenceAssetIds || scene.selectedAssetIds, assetsById);
  const selectedAssetSliceIds = validIds(plan.selectedAssetSliceIds || plan.sourceReferenceSliceIds || scene.selectedAssetSliceIds, slicesById);
  const plannedPrimary = validIds([plan.primaryProductAssetId || scene.primaryProductAssetId], imageAssetIds)[0] || null;
  const selectedPrimary = selectedAssetIds.find((id) => imageAssetIds.has(id)) || null;
  const mustShowProductInFrame = plan.mustShowProductInFrame !== undefined ? Boolean(plan.mustShowProductInFrame) : sceneRequiresProduct(scene, index);
  const primaryProductAssetId = plannedPrimary || selectedPrimary || (mustShowProductInFrame ? defaultProductAssetId : null);
  const sourceReferenceAssetIds = validIds(plan.sourceReferenceAssetIds || selectedAssetIds, assetsById);
  const sourceReferenceSliceIds = validIds(plan.sourceReferenceSliceIds || selectedAssetSliceIds, slicesById);
  const sourceWithPrimary = primaryProductAssetId
    ? [primaryProductAssetId, ...sourceReferenceAssetIds.filter((id) => id !== primaryProductAssetId)]
    : sourceReferenceAssetIds;
  const selectedWithPrimary = primaryProductAssetId
    ? [primaryProductAssetId, ...selectedAssetIds.filter((id) => id !== primaryProductAssetId)]
    : selectedAssetIds;
  const fallback = fallbackPlan(scene, index, 'Seed2 returned an incomplete plan; backend completed missing fields.', defaultProductAssetId, storyboardConsistency);
  const sceneLanguage = plan.dialogueLanguage === 'zh-CN' || plan.dialogueLanguage === 'en' ? plan.dialogueLanguage : fallback.dialogueLanguage;
  const spokenDialogue = shortText(plan.spokenDialogue || scene.voiceover || scene.narration || scene.scriptText || fallback.spokenDialogue || '', 260);
  const languageConsistencyNotes = shortText(plan.languageConsistencyNotes || languageInstruction(sceneLanguage), 500);
  const confidence = Number(plan.confidence);
  const sceneContinuityNotes = shortText(plan.sceneContinuityNotes || fallback.sceneContinuityNotes, 500);
  const sceneDiversityInstruction = shortText(plan.sceneDiversityInstruction || fallback.sceneDiversityInstruction, 500);
  const seedancePrompt = [
    plan.seedancePrompt || plan.prompt || fallback.seedancePrompt,
    productAnchorPrompt(primaryProductAssetId),
    storyboardConsistencyPrompt(storyboardConsistency),
    sceneContinuityNotes ? `Scene continuity notes: ${sceneContinuityNotes}` : '',
    sceneDiversityInstruction ? `Scene diversity instruction: ${sceneDiversityInstruction}` : '',
    `Target spoken dialogue language: ${sceneLanguage}.`,
    languageConsistencyNotes,
    spokenDialogue ? `Spoken dialogue to generate as audible speech: "${spokenDialogue}". Do not translate it or mix languages.` : '',
    noCopyAssetEnvironmentPrompt(),
    mustShowProductInFrame ? 'The product must be visible and recognizable in this scene.' : '',
  ].filter(Boolean).join('\n');
  return {
    ...fallback,
    sceneId: sceneId(scene, index),
    selectedAssetIds: selectedWithPrimary.length ? selectedWithPrimary : fallback.selectedAssetIds,
    selectedAssetSliceIds: selectedAssetSliceIds.length ? selectedAssetSliceIds : fallback.selectedAssetSliceIds,
    sourceReferenceAssetIds: sourceWithPrimary.length ? sourceWithPrimary : (selectedWithPrimary.length ? selectedWithPrimary : fallback.sourceReferenceAssetIds),
    sourceReferenceSliceIds: sourceReferenceSliceIds.length ? sourceReferenceSliceIds : (selectedAssetSliceIds.length ? selectedAssetSliceIds : fallback.sourceReferenceSliceIds),
    primaryProductAssetId: primaryProductAssetId || fallback.primaryProductAssetId,
    primaryProductReferenceRole: primaryProductAssetId ? normalizeProductReferenceRole(plan.primaryProductReferenceRole) : fallback.primaryProductReferenceRole,
    mustShowProductInFrame,
    sceneContinuityNotes,
    sceneDiversityInstruction,
    dialogueLanguage: sceneLanguage,
    spokenDialogue,
    languageConsistencyNotes,
    seedancePrompt: shortText(seedancePrompt, 2200),
    negativePrompt: shortText(plan.negativePrompt || fallback.negativePrompt, 500),
    referenceUsage: shortText(plan.referenceUsage || fallback.referenceUsage, 500),
    productConsistencyRules: Array.isArray(plan.productConsistencyRules) && plan.productConsistencyRules.length
      ? [
        ...plan.productConsistencyRules.map((item) => shortText(item, 220)).slice(0, 6),
        noCopyAssetEnvironmentPrompt(),
      ]
      : fallback.productConsistencyRules,
    scriptAlignmentNotes: shortText(plan.scriptAlignmentNotes || fallback.scriptAlignmentNotes, 500),
    reason: shortText(plan.reason || fallback.reason, 500),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : fallback.confidence,
    provider: 'seed2',
  };
}

function applyPlansToScenes(scenes = [], plans = [], meta = {}) {
  const bySceneId = new Map((plans || []).map((plan) => [String(plan.sceneId || ''), plan]));
  return scenes.map((scene, index) => {
    const plan = bySceneId.get(sceneId(scene, index)) || plans[index] || fallbackPlan(scene, index, meta.error || 'Seed2 did not return a plan for this scene.', meta.defaultProductAssetId, meta.storyboardConsistency);
    return {
      ...scene,
      selectedAssetIds: plan.selectedAssetIds,
      selectedAssetSliceIds: plan.selectedAssetSliceIds,
      sourceReferenceAssetIds: plan.sourceReferenceAssetIds,
      sourceReferenceSliceIds: plan.sourceReferenceSliceIds,
      primaryProductAssetId: plan.primaryProductAssetId,
      primaryProductReferenceRole: plan.primaryProductReferenceRole,
      mustShowProductInFrame: plan.mustShowProductInFrame,
      sceneContinuityNotes: plan.sceneContinuityNotes,
      sceneDiversityInstruction: plan.sceneDiversityInstruction,
      dialogueLanguage: plan.dialogueLanguage,
      spokenDialogue: plan.spokenDialogue,
      languageConsistencyNotes: plan.languageConsistencyNotes,
      seedancePrompt: plan.seedancePrompt,
      negativePrompt: plan.negativePrompt,
      referenceUsage: plan.referenceUsage,
      productConsistencyRules: plan.productConsistencyRules,
      scriptAlignmentNotes: plan.scriptAlignmentNotes,
      seed2PlanningReason: plan.reason,
      seed2PlanningConfidence: plan.confidence,
      seed2PlanningProvider: plan.provider === 'seed2' ? 'seed2' : 'recall_fallback',
      seed2PlanningModel: meta.model || null,
      seed2PlanningError: meta.error || null,
    };
  });
}

const PLAN_SCHEMA = {
  storyboardConsistency: {
    productIdentity: 'global product identity bible for every scene',
    brandVisualStyle: 'global brand visual style and tone',
    worldSetting: 'how scenes should choose environments from the script rather than uploaded asset backgrounds',
    characterContinuity: 'cross-scene continuity rules for product scale, hands, labels, and use context',
    cameraLanguage: 'global camera and movement rules',
    sceneDiversityPlan: ['one short scene-specific composition/action rule per scene'],
    doNotCopyFromAssets: ['background', 'room', 'tabletop', 'lighting', 'camera angle', 'pose', 'layout', 'composition'],
  },
  scenes: [
    {
      sceneId: 'scene id from input',
      selectedAssetIds: ['project asset id to preserve product identity'],
      selectedAssetSliceIds: ['project slice id when useful'],
      primaryProductAssetId: 'image asset id used as the product identity anchor',
      primaryProductReferenceRole: 'product_reference',
      mustShowProductInFrame: true,
      seedancePrompt: 'complete prompt for Seedance 1.5 Pro, grounded in the storyboard script and selected project assets',
      dialogueLanguage: 'zh-CN or en',
      spokenDialogue: 'audible dialogue line in the target language, copied or adapted from scene voiceover without language mixing',
      languageConsistencyNotes: 'how the prompt keeps voiceover/subtitle in the target language',
      negativePrompt: 'what Seedance must avoid',
      sceneContinuityNotes: 'how this scene preserves product and story continuity',
      sceneDiversityInstruction: 'how this scene differs from adjacent scenes while following script',
      scriptAlignmentNotes: 'how this prompt follows voiceover/subtitle/narrativeGoal/visualDescription',
      referenceUsage: 'how selected assets/slices should be used',
      productConsistencyRules: ['rules to keep product identity, packaging, category, color, and label consistent'],
      reason: 'why these assets/slices match the scene',
      confidence: 0.8,
    },
  ],
};

async function planStoryboardScenesWithSeed2(projectId, storyboard, payload = {}, options = {}) {
  const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];
  if (!scenes.length) return { scenes: [], plans: [], provider: 'empty', lowConfidenceScenes: [], storyboardConsistency: null };
  const assets = (await listAllAssets(projectId)).slice(0, 80);
  const assetIds = assets.map((asset) => asset.id).filter(Boolean);
  const slices = (await searchSlices(projectId, { assetIds })).items.slice(0, 160);
  const assetsById = new Set(assetIds);
  const slicesById = new Set(slices.map((slice) => slice.id).filter(Boolean));
  const imageAssetIds = new Set(assets.filter(isImageAsset).map((asset) => asset.id).filter(Boolean));
  const defaultProductAssetId = pickDefaultProductAssetId(assets);
  const project = await getProject(projectId).catch(() => null);
  const languagePolicy = resolveDialogueLanguage({
    ...payload,
    productInfo: {
      title: project?.productName || payload.productName || payload.productInfo?.title || payload.productInfo || '',
      category: project?.productCategory || payload.productCategory || payload.productInfo?.category || '',
      sellingPoints: project?.sellingPoints || payload.sellingPoints || payload.productInfo?.sellingPoints || [],
      targetAudience: project?.targetAudience || payload.targetAudience || payload.audience || '',
    },
    scenes,
  }, payload.language || payload.dialogueLanguage || storyboard.dialogueLanguage);
  const defaultConsistency = normalizeStoryboardConsistency(storyboard.storyboardConsistency, project || {}, scenes, defaultProductAssetId);
  const systemPrompt = [
    'You plan Seedance 1.5 Pro storyboard video generation for e-commerce.',
    'The storyboard script is authoritative. Do not rewrite the narrative, selling point, voiceover, subtitle, or visual goal.',
    languagePolicy.languageInstruction,
    'Do not translate, alternate, or mix dialogue languages. Product/brand names may keep their original spelling, but sentence grammar must use the target dialogue language.',
    'First create a storyboardConsistency bible that every scene must obey: product identity, visual style, continuity, camera language, and reference-asset no-copy rules.',
    'For each scene, choose the best project-owned assets/slices and write a complete Seedance prompt.',
    'For the first four non-transition scenes and all selling scenes, set mustShowProductInFrame=true and choose a primaryProductAssetId that is a clear image of the main product.',
    'If a video slice is useful for action or mood, still choose a product image as primaryProductAssetId for product identity reference.',
    'The prompt must explain how to use selected references to preserve the exact product identity, packaging, object type, color, label, and visual details.',
    'Seedance prompt must explicitly say product images are identity references only.',
    'Do not ask Seedance to copy reference asset background, room, tabletop, lighting, camera angle, pose, layout, or composition.',
    'The scene environment, action, camera, and composition must come from the storyboard scene fields.',
    'Each scene must include sceneContinuityNotes and sceneDiversityInstruction.',
    'Vary composition, camera angle, background, and action across scenes. Do not repeat the same packshot composition.',
    'If assets are weak, still write the best prompt and lower confidence. Return strict JSON only.',
  ].join('\n');
  const userPrompt = JSON.stringify({
    task: 'select_project_assets_and_compile_seedance_prompts_for_storyboard_scenes',
    project: {
      projectId,
      productName: project?.productName || payload.productName || payload.productInfo?.title || payload.productInfo || '',
      productCategory: project?.productCategory || payload.productCategory || payload.productInfo?.category || '',
      sellingPoints: project?.sellingPoints || payload.sellingPoints || payload.productInfo?.sellingPoints || [],
      targetAudience: project?.targetAudience || payload.targetAudience || payload.audience || '',
      style: project?.style || payload.style || '',
      platform: payload.platform || project?.targetPlatform || 'dy',
      dialogueLanguage: languagePolicy.dialogueLanguage,
      languageReason: languagePolicy.languageReason,
    },
    dialogueLanguage: languagePolicy.dialogueLanguage,
    languageInstruction: languagePolicy.languageInstruction,
    storyboardConsistency: defaultConsistency,
    storyboard: {
      storyboardId: storyboard.storyboardId || storyboard.id,
      scriptId: storyboard.scriptId,
      scriptVersionId: storyboard.scriptVersionId,
      aspectRatio: storyboard.aspectRatio || payload.aspectRatio || '9:16',
      scenes: scenes.map(compactScene),
    },
    availableAssets: assets.map(compactAsset),
    availableSlices: slices.map(compactSlice),
    constraints: [
      'Use only project-owned assets/slices as product references.',
      'For primaryProductAssetId, choose an image asset whenever one exists.',
      'For selling scenes, the product must appear clearly in frame.',
      'primaryProductReferenceRole must be product_reference, identity_reference, or reference.',
      'Use product images only to understand product identity, packaging, label, color, shape, and proportions.',
      'Do not copy uploaded asset background, room, tabletop, lighting, camera angle, pose, layout, or composition.',
      'Scene setting and action must match visualDescription, narrativeGoal, voiceover, and subtitle.',
      'Do not use public reference videos as source footage.',
      'Seedance prompt must follow the storyboard script fields exactly.',
      'Seedance prompt must state the target spoken dialogue language and keep audible dialogue/subtitles in that language.',
      'Do not mix Chinese and English in generated dialogue unless preserving exact product/brand names.',
      'Avoid unrelated objects or product-category drift.',
    ],
  });
  const generate = options.generateJsonWithSeed2 || generateJsonWithSeed2;
  try {
    const raw = await generate({ systemPrompt, userPrompt, schema: PLAN_SCHEMA, temperature: 0, fetchImpl: options.fetchImpl });
    const rawPlans = Array.isArray(raw.scenes) ? raw.scenes : Array.isArray(raw.plans) ? raw.plans : [];
    const storyboardConsistency = normalizeStoryboardConsistency(raw.storyboardConsistency, project || {}, scenes, defaultProductAssetId);
    const plans = scenes.map((scene, index) => normalizeSeed2Plan(
      rawPlans[index] || rawPlans.find((plan) => plan.sceneId === sceneId(scene, index)),
      scene,
      index,
      assetsById,
      slicesById,
      imageAssetIds,
      defaultProductAssetId,
      storyboardConsistency
    ));
    return {
      scenes: applyPlansToScenes(scenes, plans, { model: raw.model, storyboardConsistency, defaultProductAssetId }),
      plans,
      provider: 'seed2',
      model: raw.model || null,
      rawText: raw.rawText || '',
      storyboardConsistency,
      lowConfidenceScenes: plans.filter((plan) => Number(plan.confidence || 0) < 0.5).map((plan) => plan.sceneId),
    };
  } catch (error) {
    const plans = scenes.map((scene, index) => fallbackPlan(scene, index, error.message, defaultProductAssetId, defaultConsistency));
    return {
      scenes: applyPlansToScenes(scenes, plans, { error: error.message, storyboardConsistency: defaultConsistency, defaultProductAssetId }),
      plans,
      provider: 'recall_fallback',
      model: null,
      error: error.message,
      storyboardConsistency: defaultConsistency,
      lowConfidenceScenes: plans.map((plan) => plan.sceneId),
    };
  }
}

module.exports = {
  planStoryboardScenesWithSeed2,
  applyPlansToScenes,
  fallbackPlan,
  normalizeStoryboardConsistency,
  storyboardConsistencyPrompt,
  compactScene,
  compactAsset,
  compactSlice,
};
