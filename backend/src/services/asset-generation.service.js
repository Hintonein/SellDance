const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { UPLOADS_DIR, OUTPUTS_DIR } = require('../config/paths');
const { appendMaterial, buildMockAnalysis, normalizeAssetType, reanalyzeMaterial, updateMaterial, getAssetSlices, getMaterial } = require('./material.service');
const { copyUploadFile, downloadRemoteAsset, writeGeneratedSvg } = require('./asset-download.service');
const { createAiGeneratedAssetReview } = require('./compliance-review.service');
const {
  classifyPromptWithSeed,
  generateAssetWithVolcengine,
  getSeedClassifierEndpointId,
  hasArkApiKey,
} = require('./volcengine-ark.service');
const { listAssetGenerationTasks, writeAssetGenerationTasks } = require('./storage.service');
const { getProject } = require('./project.service');
const { curateTags } = require('./asset-tag.service');

const validMediaTypes = new Set(['image', 'video']);
const runningJobs = new Set();
const generationOptions = {
  seed_dance: {
    mediaType: 'video',
    defaultAssetType: 'product_video',
    endpointEnv: 'SEEDANCE_ENDPOINT_ID',
    defaultModelEnv: 'SEEDANCE_MODEL',
    defaultModel: 'seedance-1.5-pro',
  },
};

function now() {
  return new Date().toISOString();
}

function inferMimeType(mediaType, publicUrl) {
  if (mediaType === 'video') return 'video/mp4';
  if (publicUrl.endsWith('.svg')) return 'image/svg+xml';
  if (publicUrl.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function uniqueList(items) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function safeFileStem(value) {
  return String(value || 'seedance_asset')
    .trim()
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'seedance_asset';
}

function safePathSegment(value, fallback = 'item') {
  const safe = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return safe || fallback;
}

async function fileSize(filePath) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

async function downloadRemoteStoryboardOutput(remoteUrl, task) {
  if (!remoteUrl) throw new Error('Remote storyboard video URL is empty.');
  const projectId = safePathSegment(task.projectId, 'project');
  const storyboardId = safePathSegment(task.metadata?.storyboardId || task.metadata?.storyboardSceneId || task.id, 'storyboard');
  const outputDir = path.join(OUTPUTS_DIR, projectId, 'storyboards', storyboardId);
  await fs.mkdir(outputDir, { recursive: true });
  const response = await fetch(remoteUrl);
  if (!response.ok) throw new Error(`Remote storyboard video download failed with ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  const extension = contentType.includes('video/webm') ? '.webm' : '.mp4';
  const fileName = `${safePathSegment(task.metadata?.storyboardSceneId || task.id, 'scene')}${extension}`;
  const diskPath = path.join(outputDir, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(diskPath, buffer);
  return {
    diskPath,
    publicUrl: `/outputs/${projectId}/storyboards/${storyboardId}/${fileName}`,
    size: buffer.length,
    contentType,
  };
}

async function copyStoryboardMockOutput(task) {
  const demoPath = await assertDemoFile(
    'demo-product-video.mp4',
    'Mock storyboard video generation requires backend/uploads/demo-product-video.mp4. Please place a demo MP4 there and retry.'
  );
  const projectId = safePathSegment(task.projectId, 'project');
  const storyboardId = safePathSegment(task.metadata?.storyboardId || task.metadata?.storyboardSceneId || task.id, 'storyboard');
  const outputDir = path.join(OUTPUTS_DIR, projectId, 'storyboards', storyboardId);
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `${safePathSegment(task.metadata?.storyboardSceneId || task.id, 'scene')}.mp4`;
  const diskPath = path.join(outputDir, fileName);
  await fs.copyFile(demoPath, diskPath);
  return {
    diskPath,
    publicUrl: `/outputs/${projectId}/storyboards/${storyboardId}/${fileName}`,
    size: await fileSize(diskPath),
    contentType: 'video/mp4',
  };
}

function buildStoryboardOutputRecord(task, localAsset, generated) {
  const outputId = `storyboard_output_${uuidv4()}`;
  return {
    id: outputId,
    outputId,
    mediaType: 'video',
    type: 'storyboard_generated_output',
    source: 'storyboard_workflow',
    provider: task.provider,
    model: generated?.model || task.model,
    prompt: task.promptForGeneration || task.prompt,
    fileUrl: localAsset.publicUrl,
    url: localAsset.publicUrl,
    thumbnailUrl: localAsset.publicUrl,
    mimeType: 'video/mp4',
    size: localAsset.size,
    metadata: task.metadata || {},
    isProjectAsset: false,
    createdAt: now(),
  };
}

const genericGeneratedTags = new Set(['product', 'close_up', 'detail', 'studio_shot', 'studio', 'product_showcase']);

function pruneGeneratedAnalysisTags(analysis = {}) {
  return {
    ...analysis,
    tags: curateTags((analysis.tags || []).filter((tag) => !genericGeneratedTags.has(String(tag || '').toLowerCase()))),
  };
}

function publicUploadPathToDisk(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/')) return null;
  const relativePath = fileUrl.replace(/^\/uploads\//, '');
  if (!relativePath || relativePath.includes('..') || path.isAbsolute(relativePath)) return null;
  return path.join(UPLOADS_DIR, relativePath);
}

async function imageAssetToDataUrl(projectId, assetId) {
  const asset = await getMaterial(projectId, assetId);
  if (!asset) throw new Error(`Reference asset ${assetId} is not linked to project ${projectId}.`);
  if (asset.mediaType !== 'image' && asset.type !== 'image' && !String(asset.mimeType || '').startsWith('image/')) {
    throw new Error(`Reference asset ${assetId} must be an image. Video slice reference generation is not enabled.`);
  }
  const diskPath = publicUploadPathToDisk(asset.fileUrl || asset.url);
  if (!diskPath) throw new Error(`Reference image ${assetId} must be a local uploaded image or provided as data URL.`);
  const bytes = await fs.readFile(diskPath);
  const mimeType = asset.mimeType || 'image/png';
  return {
    url: `data:${mimeType};base64,${bytes.toString('base64')}`,
    sourceAssetId: asset.id,
    mimeType,
  };
}

async function normalizeReferenceImages(projectId, referenceImages = []) {
  const allowedRoles = new Set(['reference', 'product_reference', 'identity_reference', 'style_reference', 'first_frame', 'last_frame']);
  const normalized = [];
  for (const item of Array.isArray(referenceImages) ? referenceImages : []) {
    const role = allowedRoles.has(item.role) ? item.role : 'reference';
    if (item.assetId) {
      normalized.push({ role, ...(await imageAssetToDataUrl(projectId, item.assetId)) });
    } else if (item.dataUrl || item.url || item.imageUrl) {
      const url = item.dataUrl || item.url || item.imageUrl;
      if (String(url).startsWith('/uploads/')) {
        const diskPath = publicUploadPathToDisk(url);
        if (!diskPath) throw new Error('Reference image upload URL is not a valid local upload path.');
        const bytes = await fs.readFile(diskPath);
        const ext = path.extname(diskPath).toLowerCase();
        const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
        normalized.push({ role, url: `data:${mimeType};base64,${bytes.toString('base64')}`, mimeType, name: item.name || null });
      } else if (!String(url).startsWith('data:image/') && !/^https?:\/\//.test(String(url))) {
        throw new Error('Reference image must be a data:image URL or public HTTPS URL.');
      } else {
        normalized.push({ role, url, mimeType: item.mimeType || null, name: item.name || null });
      }
    }
  }
  return normalized.slice(0, 2);
}

function buildMockClassification(task, project = {}) {
  const sellingPoints = Array.isArray(project.sellingPoints) ? project.sellingPoints : [];
  const tags = curateTags([
    'AI生成',
    '商品展示',
    '电商短视频',
    project.productCategory,
    ...(sellingPoints.slice(0, 3)),
  ]);
  return {
    subject: project.productName || '商品展示视频',
    assetName: project.productName ? `${project.productName} Seedance video` : 'Seedance product video',
    category: project.productCategory || task.assetType,
    sellingPoints,
    audience: project.targetAudience || 'social commerce shoppers',
    scene: 'studio',
    style: project.style || 'clean commercial',
    colors: ['white', 'gold'],
    tags,
    riskTags: ['AI生成', '需人工确认真实性', '需确认商品功效表达'],
    summary: `由 AI 根据商品信息、卖点和提示词生成的短视频素材。商品类目：${project.productCategory || task.assetType}。`,
    enhancedPrompt: [
      task.prompt,
      project.productName ? `商品：${project.productName}` : '',
      project.productCategory ? `类目：${project.productCategory}` : '',
      sellingPoints.length ? `卖点：${sellingPoints.join('，')}` : '',
      project.targetAudience ? `目标人群：${project.targetAudience}` : '',
      project.style ? `视觉风格：${project.style}` : '',
    ].filter(Boolean).join('。'),
    provider: 'mock',
    model: getSeedClassifierEndpointId() || 'mock-seed-classifier',
  };
}

async function classifyGenerationPrompt(task) {
  const project = await getProject(task.projectId);
  if (hasArkApiKey() && getSeedClassifierEndpointId()) {
    try {
      const classification = await classifyPromptWithSeed({
        prompt: task.prompt,
        project: project || {},
        assetType: task.assetType,
        ratio: task.ratio,
        durationSec: task.durationSec,
      });
      return classification || buildMockClassification(task, project || {});
    } catch (error) {
      return {
        ...buildMockClassification(task, project || {}),
        provider: 'mock',
        error: error.message,
      };
    }
  }
  return buildMockClassification(task, project || {});
}

async function saveTask(task) {
  const tasks = await listAssetGenerationTasks();
  const index = tasks.findIndex((item) => item.id === task.id);
  const next = index === -1 ? [task, ...tasks] : tasks.map((item) => (item.id === task.id ? task : item));
  await writeAssetGenerationTasks(next);
  return task;
}

async function updateTask(task, patch) {
  const next = {
    ...task,
    ...patch,
    updatedAt: now(),
  };
  await saveTask(next);
  return next;
}

async function getAssetGenerationTask(projectId, taskId) {
  const tasks = await listAssetGenerationTasks();
  return tasks.find((task) => task.projectId === projectId && task.id === taskId) || null;
}

async function assertDemoFile(fileName, message) {
  const filePath = path.join(UPLOADS_DIR, fileName);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    throw new Error(message);
  }
}

async function generateMockLocalAsset(task) {
  if (task.mediaType === 'video') {
    const demoPath = await assertDemoFile(
      'demo-product-video.mp4',
      'Mock video generation requires backend/uploads/demo-product-video.mp4. Please place a demo MP4 there and retry.'
    );
    return copyUploadFile(demoPath, `generated-${task.id}.mp4`);
  }

  const jpgPath = path.join(UPLOADS_DIR, 'demo-product-image.jpg');
  const pngPath = path.join(UPLOADS_DIR, 'demo-product-image.png');
  try {
    await fs.access(jpgPath);
    return copyUploadFile(jpgPath, `generated-${task.id}.jpg`);
  } catch {
    try {
      await fs.access(pngPath);
      return copyUploadFile(pngPath, `generated-${task.id}.png`);
    } catch {
      return writeGeneratedSvg(`generated-${task.id}.svg`, {
        prompt: task.prompt,
        ratio: task.ratio,
      });
    }
  }
}

async function persistGeneratedAsset(task, localAsset) {
  const assetId = `asset_${uuidv4()}`;
  const extension = path.extname(localAsset.publicUrl) || (task.mediaType === 'video' ? '.mp4' : '.svg');
  const classification = task.classification || {};
  const assetTitle = classification.assetName || classification.title || classification.suggestedName || classification.subject || classification.category || `seedance_${assetId}`;
  const fileStem = safeFileStem(assetTitle);
  const asset = await appendMaterial(task.projectId, {
    id: assetId,
    assetId,
    type: normalizeAssetType(task.assetType, inferMimeType(task.mediaType, localAsset.publicUrl)),
    title: assetTitle,
    originalName: `${fileStem}${extension}`,
    name: `${fileStem}${extension}`,
    url: localAsset.publicUrl,
    fileUrl: localAsset.publicUrl,
    thumbnailUrl: task.mediaType === 'video' ? localAsset.publicUrl : localAsset.publicUrl,
    mimeType: inferMimeType(task.mediaType, localAsset.publicUrl),
    size: localAsset.size,
    source: task.provider === 'mock' ? 'mock' : 'ai_generated',
    provider: task.provider,
    model: task.model,
    prompt: task.prompt,
    classification,
    analysis: {
      ...buildMockAnalysis({ originalName: assetTitle, type: task.assetType }),
      subject: classification.subject || '商品展示视频',
      category: classification.category || task.assetType,
      colors: classification.colors || ['white', 'gold'],
      scene: classification.scene || 'studio',
      style: classification.style || 'clean commercial',
      tags: curateTags((classification.tags || []).filter((tag) => !genericGeneratedTags.has(String(tag || '').toLowerCase()))),
      summary: classification.summary || '由 AI 根据商品卖点和提示词生成的短视频素材。',
      sellingPoints: classification.sellingPoints || [],
      audience: classification.audience || '',
      riskTags: classification.riskTags || [],
      embedding: [0.12, 0.24, 0.36, 0.48],
      vector: [0.12, 0.24, 0.36, 0.48],
    },
  });
  await createAiGeneratedAssetReview({ projectId: task.projectId, assetId });
  try {
    const analyzed = await reanalyzeMaterial(task.projectId, assetId);
    const slices = await getAssetSlices(task.projectId, assetId);
    const firstSliceThumbnail = slices?.items?.[0]?.thumbnailUrl;
    const cleanedAnalysis = pruneGeneratedAnalysisTags(analyzed.analysis || {});
    if (firstSliceThumbnail && firstSliceThumbnail !== analyzed.thumbnailUrl) {
      return updateMaterial(task.projectId, assetId, {
        metadata: analyzed.metadata,
        thumbnailUrl: firstSliceThumbnail,
        analysis: cleanedAnalysis,
        systemTags: cleanedAnalysis.tags || [],
      });
    }
    return updateMaterial(task.projectId, assetId, { analysis: cleanedAnalysis, systemTags: cleanedAnalysis.tags || [] });
  } catch {
    return asset;
  }
}

async function createAssetGenerationTask(projectId, payload = {}) {
  const generator = payload.generator || payload.generationType || payload.provider || 'seed_dance';
  const generationOption = generationOptions[generator] || null;
  if (generator !== 'seed_dance') {
    throw new Error('Only seed_dance text-to-video asset generation is enabled. AI image generation is disabled for this project.');
  }
  const mediaType = generationOption?.mediaType || (validMediaTypes.has(payload.mediaType) ? payload.mediaType : 'image');
  if (mediaType !== 'video') {
    throw new Error('Only AI video asset generation is enabled. Please use seed_dance.');
  }
  const requestedProvider = generator;
  const provider = payload.provider === 'mock' ? 'mock' : hasArkApiKey() ? 'volcengine' : 'mock';
  const endpointId = payload.endpointId || (generationOption ? process.env[generationOption.endpointEnv] : '');
  const defaultModel = endpointId || (generationOption
    ? process.env[generationOption.defaultModelEnv] || generationOption.defaultModel
    : mediaType === 'video'
      ? process.env.SEEDANCE_MODEL || 'seedance-1.5-pro'
      : process.env.SEEDREAM_MODEL || 'doubao-seedream-4.0');
  const task = {
    id: `asset_gen_${uuidv4()}`,
    projectId,
    productId: payload.productId || null,
    provider,
    requestedProvider,
    generator,
    endpointId: endpointId || null,
    model: defaultModel,
    mediaType,
    assetType: normalizeAssetType(payload.assetType || generationOption?.defaultAssetType || (mediaType === 'video' ? 'product_video' : 'product_image')),
    prompt: payload.prompt || '',
    ratio: payload.ratio || (mediaType === 'video' ? '9:16' : '1:1'),
    durationSec: Number(payload.durationSec || 5),
    referenceImages: await normalizeReferenceImages(projectId, payload.referenceImages || []),
    status: 'queued',
    progress: 0,
    resultAssetId: null,
    remoteUrl: null,
    localUrl: null,
    error: null,
    createdAt: now(),
    updatedAt: now(),
  };

  await saveTask(task);
  runAssetGenerationTask(task);
  return task;
}

async function buildGenerationTask(projectId, payload = {}, idPrefix = 'asset_gen') {
  const generator = payload.generator || payload.generationType || payload.provider || 'seed_dance';
  const generationOption = generationOptions[generator] || null;
  if (generator !== 'seed_dance') {
    throw new Error('Only seed_dance text-to-video asset generation is enabled. AI image generation is disabled for this project.');
  }
  const mediaType = generationOption?.mediaType || (validMediaTypes.has(payload.mediaType) ? payload.mediaType : 'image');
  if (mediaType !== 'video') {
    throw new Error('Only AI video asset generation is enabled. Please use seed_dance.');
  }
  const provider = payload.provider === 'mock' ? 'mock' : hasArkApiKey() ? 'volcengine' : 'mock';
  const endpointId = payload.endpointId || (generationOption ? process.env[generationOption.endpointEnv] : '');
  const defaultModel = endpointId || (generationOption
    ? process.env[generationOption.defaultModelEnv] || generationOption.defaultModel
    : process.env.SEEDANCE_MODEL || 'seedance-1.5-pro');
  return {
    id: `${idPrefix}_${uuidv4()}`,
    projectId,
    productId: payload.productId || null,
    provider,
    requestedProvider: generator,
    generator,
    endpointId: endpointId || null,
    model: defaultModel,
    mediaType,
    assetType: normalizeAssetType(payload.assetType || generationOption?.defaultAssetType || 'product_video'),
    prompt: payload.prompt || '',
    ratio: payload.ratio || '9:16',
    durationSec: Number(payload.durationSec || 5),
    referenceImages: await normalizeReferenceImages(projectId, payload.referenceImages || []),
    status: 'queued',
    progress: 0,
    resultAssetId: null,
    remoteUrl: null,
    localUrl: null,
    error: null,
    metadata: payload.metadata || {},
    createdAt: now(),
    updatedAt: now(),
  };
}

async function generateStoryboardSceneAsset(projectId, payload = {}, options = {}) {
  const task = await buildGenerationTask(projectId, {
    ...payload,
    generator: 'seed_dance',
    mediaType: 'video',
    assetType: payload.assetType || 'storyboard_video',
  }, 'storyboard_scene_gen');
  let localAsset;
  let remoteUrl = null;
  let generated = null;
  const classification = payload.classification || await classifyGenerationPrompt(task);
  const enhancedPrompt = classification.enhancedPrompt || task.prompt;
  const current = {
    ...task,
    classification,
    promptForGeneration: enhancedPrompt,
    classificationModel: classification.model,
    classificationProvider: classification.provider,
    classificationError: classification.error || null,
  };
  const persistToAssetLibrary = options.persistToAssetLibrary !== undefined
    ? options.persistToAssetLibrary
    : payload.persistToAssetLibrary !== false;
  if (current.provider === 'volcengine') {
    const generateImpl = options.generateAssetWithVolcengine || generateAssetWithVolcengine;
    generated = await generateImpl({
      ...current,
      prompt: enhancedPrompt,
      referenceImages: current.referenceImages,
    });
    remoteUrl = generated.remoteUrl;
    if (persistToAssetLibrary) {
      const downloadImpl = options.downloadRemoteAsset || downloadRemoteAsset;
      localAsset = await downloadImpl(remoteUrl, `generated-${current.id}`, '.mp4');
    } else {
      const downloadImpl = options.downloadStoryboardOutput || downloadRemoteStoryboardOutput;
      localAsset = await downloadImpl(remoteUrl, current);
    }
  } else {
    if (persistToAssetLibrary) {
      localAsset = options.generateMockLocalAsset
        ? await options.generateMockLocalAsset(current)
        : await generateMockLocalAsset(current);
    } else {
      localAsset = options.generateMockStoryboardOutput
        ? await options.generateMockStoryboardOutput(current)
        : await copyStoryboardMockOutput(current);
    }
  }
  if (!persistToAssetLibrary) {
    const output = buildStoryboardOutputRecord(current, localAsset, generated);
    return {
      task: {
        ...current,
        status: 'ready',
        progress: 100,
        remoteUrl,
        localUrl: localAsset.publicUrl,
        resultOutputId: output.outputId,
        generationDurationSec: generated?.durationSec || null,
        requestedDurationSec: generated?.requestedDurationSec || current.durationSec || null,
      },
      output,
      remoteUrl,
      remoteTaskId: generated?.taskId || null,
      model: generated?.model || current.model,
      durationSec: generated?.durationSec || current.durationSec,
      requestedDurationSec: generated?.requestedDurationSec || current.durationSec,
    };
  }
  const persistImpl = options.persistGeneratedAsset || persistGeneratedAsset;
  const asset = await persistImpl({
    ...current,
    remoteUrl,
    localUrl: localAsset.publicUrl,
    status: 'indexed',
  }, localAsset);
  return {
    task: {
      ...current,
      status: 'ready',
      progress: 100,
      remoteUrl,
      localUrl: localAsset.publicUrl,
      resultAssetId: asset.assetId || asset.id,
      generationDurationSec: generated?.durationSec || null,
      requestedDurationSec: generated?.requestedDurationSec || current.durationSec || null,
    },
    asset,
    remoteUrl,
    remoteTaskId: generated?.taskId || null,
    model: generated?.model || current.model,
    durationSec: generated?.durationSec || current.durationSec,
    requestedDurationSec: generated?.requestedDurationSec || current.durationSec,
  };
}

async function runAssetGenerationTask(task) {
  if (runningJobs.has(task.id)) return task;
  runningJobs.add(task.id);
  try {
    let current = await updateTask(task, { status: 'generating', progress: 20 });
    let localAsset;
    let remoteUrl = null;
    const classification = await classifyGenerationPrompt(current);
    const enhancedPrompt = classification.enhancedPrompt || current.prompt;
    current = await updateTask(current, {
      status: 'generating',
      progress: 35,
      classification,
      promptForGeneration: enhancedPrompt,
      classificationModel: classification.model,
      classificationProvider: classification.provider,
      classificationError: classification.error || null,
    });

    if (current.provider === 'volcengine') {
      const generated = await generateAssetWithVolcengine({
        ...current,
        prompt: enhancedPrompt,
        referenceImages: current.referenceImages,
      });
      remoteUrl = generated.remoteUrl;
      current = await updateTask(current, { status: 'downloading', progress: 70, remoteUrl });
      localAsset = await downloadRemoteAsset(
        remoteUrl,
        `generated-${current.id}`,
        current.mediaType === 'video' ? '.mp4' : '.jpg'
      );
    } else {
      localAsset = await generateMockLocalAsset(current);
      current = await updateTask(current, { status: 'downloading', progress: 70 });
    }

    current = await updateTask(current, { status: 'indexed', progress: 90, remoteUrl, localUrl: localAsset.publicUrl });
    const asset = await persistGeneratedAsset(current, localAsset);
    return await updateTask(current, {
      status: 'ready',
      progress: 100,
      resultAssetId: asset.assetId || asset.id,
      localUrl: localAsset.publicUrl,
      error: null,
    });
  } catch (error) {
    return await updateTask(task, {
      status: 'failed',
      progress: Math.max(task.progress || 0, 20),
      error: error.message || 'Asset generation failed.',
    });
  } finally {
    runningJobs.delete(task.id);
  }
}

module.exports = {
  createAssetGenerationTask,
  getAssetGenerationTask,
  generateStoryboardSceneAsset,
  buildGenerationTask,
};
