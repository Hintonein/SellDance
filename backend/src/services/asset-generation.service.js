const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { UPLOADS_DIR } = require('../config/paths');
const { appendMaterial, buildMockAnalysis, normalizeAssetType } = require('./material.service');
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

function buildMockClassification(task, project = {}) {
  const sellingPoints = Array.isArray(project.sellingPoints) ? project.sellingPoints : [];
  const tags = uniqueList([
    'AI生成',
    '商品展示',
    '电商短视频',
    project.productCategory,
    ...(sellingPoints.slice(0, 3)),
  ]);
  return {
    subject: project.productName || '商品展示视频',
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
  const asset = await appendMaterial(task.projectId, {
    id: assetId,
    assetId,
    type: normalizeAssetType(task.assetType, inferMimeType(task.mediaType, localAsset.publicUrl)),
    originalName: `AI生成素材_${assetId}${extension}`,
    name: `AI生成素材_${assetId}${extension}`,
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
      ...buildMockAnalysis({ originalName: `AI生成素材_${assetId}`, type: task.assetType }),
      subject: classification.subject || '商品展示视频',
      category: classification.category || task.assetType,
      colors: classification.colors || ['white', 'gold'],
      scene: classification.scene || 'studio',
      style: classification.style || 'clean commercial',
      tags: uniqueList(['AI生成', '商品展示', '电商短视频', ...(classification.tags || [])]),
      summary: classification.summary || '由 AI 根据商品卖点和提示词生成的短视频素材。',
      sellingPoints: classification.sellingPoints || [],
      audience: classification.audience || '',
      riskTags: classification.riskTags || [],
      embedding: [0.12, 0.24, 0.36, 0.48],
      vector: [0.12, 0.24, 0.36, 0.48],
    },
  });
  await createAiGeneratedAssetReview({ projectId: task.projectId, assetId });
  return asset;
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
};
