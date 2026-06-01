const DEFAULT_SEEDANCE_MODEL = process.env.SEEDANCE_MODEL || 'seedance-1.5-pro';
const DEFAULT_SEEDREAM_MODEL = process.env.SEEDREAM_MODEL || 'doubao-seedream-4.0';
const DEFAULT_ARK_BASE_URL = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com';
const DEFAULT_POLL_ATTEMPTS = Number(process.env.ARK_POLL_ATTEMPTS || 120);
const DEFAULT_POLL_INTERVAL_MS = Number(process.env.ARK_POLL_INTERVAL_MS || 5000);

function hasArkApiKey() {
  return Boolean(process.env.ARK_API_KEY);
}

function getSeedClassifierEndpointId() {
  return process.env.SEED_ENDPOINT_ID || process.env.SEED_CLASSIFICATION_ENDPOINT_ID || process.env.SEED_MODEL || '';
}

function extractRemoteUrl(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    payload.url ||
    payload.output_url ||
    payload.video_url ||
    payload.image_url ||
    payload.data?.url ||
    payload.data?.output_url ||
    payload.data?.video_url ||
    payload.data?.image_url ||
    payload.data?.[0]?.url ||
    payload.output?.url ||
    payload.output?.video_url ||
    payload.output?.image_url ||
    payload.output?.images?.[0]?.url ||
    payload.content?.video_url ||
    payload.content?.image_url ||
    payload.content?.url ||
    payload.images?.[0]?.url ||
    payload.videos?.[0]?.url ||
    null
  );
}

function extractTaskId(payload) {
  return (
    payload?.id ||
    payload?.task_id ||
    payload?.data?.id ||
    payload?.data?.task_id ||
    null
  );
}

function extractTaskStatus(payload) {
  return (
    payload?.status ||
    payload?.data?.status ||
    payload?.task_status ||
    payload?.data?.task_status ||
    null
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function postArkGeneration(payload) {
  if (!process.env.ARK_API_KEY) {
    throw new Error('ARK_API_KEY is not configured.');
  }

  // TODO: Replace this OpenAPI-compatible best-effort call with the official
  // Volcengine Ark SDK once the project pins an SDK dependency. Keeping the
  // provider details here prevents provider-specific code from leaking into
  // business services.
  const response = await fetch(`${DEFAULT_ARK_BASE_URL}/api/v3/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error?.message || `Volcengine Ark request failed with ${response.status}.`);
  }
  return data;
}

function parseJsonObject(text) {
  if (!text) return null;
  const raw = String(text).trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function classifyPromptWithSeed({ prompt, project = {}, assetType, ratio, durationSec }) {
  const model = getSeedClassifierEndpointId();
  if (!process.env.ARK_API_KEY || !model) {
    return null;
  }
  const response = await fetch(`${DEFAULT_ARK_BASE_URL}/api/v3/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: '你是电商 AIGC 视频素材分类器。只输出 JSON，不要输出解释。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'classify_video_asset_generation_prompt',
            prompt,
            assetType,
            ratio,
            durationSec,
            project: {
              productName: project.productName,
              productCategory: project.productCategory,
              sellingPoints: project.sellingPoints,
              targetAudience: project.targetAudience,
              tone: project.tone,
              style: project.style,
              targetPlatform: project.targetPlatform,
            },
            outputSchema: {
              subject: '商品主体',
              category: '商品类目',
              sellingPoints: ['卖点'],
              audience: '目标人群',
              scene: '视频场景',
              style: '视觉风格',
              colors: ['主色'],
              tags: ['标签'],
              riskTags: ['合规风险标签'],
              assetName: '素材名称，用商品/场景/风格命名，不要使用 AI生成素材 这类泛称',
              summary: '素材摘要',
              enhancedPrompt: '给 seedance 文生视频使用的增强 prompt',
            },
          }),
        },
      ],
      temperature: 0.2,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error?.message || `Seed classification failed with ${response.status}.`);
  }
  const content = data.choices?.[0]?.message?.content || data.output_text || data.content;
  const parsed = parseJsonObject(content);
  if (!parsed) {
    throw new Error(`Seed classification response is not valid JSON: ${content || JSON.stringify(data)}`);
  }
  return {
    ...parsed,
    provider: 'volcengine',
    model,
  };
}

async function getArkGenerationTask(taskId) {
  if (!process.env.ARK_API_KEY) {
    throw new Error('ARK_API_KEY is not configured.');
  }
  const response = await fetch(`${DEFAULT_ARK_BASE_URL}/api/v3/contents/generations/tasks/${taskId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error?.message || `Volcengine Ark task polling failed with ${response.status}.`);
  }
  return data;
}

async function waitForArkVideoUrl(taskId) {
  let lastPayload = null;
  for (let attempt = 1; attempt <= DEFAULT_POLL_ATTEMPTS; attempt += 1) {
    const payload = await getArkGenerationTask(taskId);
    lastPayload = payload;
    const remoteUrl = extractRemoteUrl(payload);
    if (remoteUrl) {
      return { remoteUrl, raw: payload };
    }
    const status = String(extractTaskStatus(payload) || '').toLowerCase();
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      throw new Error(payload.message || payload.error?.message || `Volcengine Ark generation task failed with status ${status}.`);
    }
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }
  const timeoutSeconds = Math.round((DEFAULT_POLL_ATTEMPTS * DEFAULT_POLL_INTERVAL_MS) / 1000);
  const error = new Error(`Volcengine Ark generation task ${taskId} was still running after ${timeoutSeconds}s of local polling. This usually means the remote Seedance task is still queued/generating, not that the request failed. Last payload: ${JSON.stringify(lastPayload)}`);
  error.code = 'ARK_GENERATION_POLL_TIMEOUT';
  error.statusCode = 504;
  error.taskId = taskId;
  error.lastPayload = lastPayload;
  throw error;
}

function normalizeReferenceImages(referenceImages = []) {
  return (Array.isArray(referenceImages) ? referenceImages : [])
    .map((item) => ({
      role: item.role || 'reference',
      url: item.url || item.dataUrl || item.imageUrl,
    }))
    .filter((item) => item.url)
    .slice(0, 2);
}

async function generateVideoWithSeedance({ prompt, durationSec = 5, ratio = '9:16', model = DEFAULT_SEEDANCE_MODEL, referenceImages = [] }) {
  const normalizedReferenceImages = normalizeReferenceImages(referenceImages);
  if (process.env.ARK_MOCK_REMOTE_URL) {
    return { remoteUrl: process.env.ARK_MOCK_REMOTE_URL, model, raw: { mocked: true, referenceImages: normalizedReferenceImages.length } };
  }
  const referenceHint = normalizedReferenceImages.length
    ? ` Reference images: ${normalizedReferenceImages.map((item) => item.role).join(', ')}. Use first_frame as the opening frame and last_frame as the ending frame when provided.`
    : '';
  const payload = {
    model,
    content: [
      {
        type: 'text',
        text: `${prompt}${referenceHint} --ratio ${ratio} --duration ${durationSec}`,
      },
      ...normalizedReferenceImages.map((item) => ({
        type: 'image_url',
        image_url: { url: item.url },
      })),
    ],
  };
  const data = await postArkGeneration(payload);
  const remoteUrl = extractRemoteUrl(data);
  if (remoteUrl) {
    return { remoteUrl, model, raw: data };
  }
  const taskId = extractTaskId(data);
  if (taskId) {
    const completed = await waitForArkVideoUrl(taskId);
    return { ...completed, model, taskId };
  }
  if (!remoteUrl) {
    throw new Error(`Volcengine Ark response did not include a downloadable video URL or task id. Payload: ${JSON.stringify(data)}`);
  }
  return { remoteUrl, model, raw: data };
}

async function generateImageWithSeedream({ prompt, ratio = '1:1', model = DEFAULT_SEEDREAM_MODEL }) {
  if (process.env.ARK_MOCK_REMOTE_URL) {
    return { remoteUrl: process.env.ARK_MOCK_REMOTE_URL, model, raw: { mocked: true } };
  }
  const payload = {
    model,
    prompt,
    content_generation_config: {
      ratio,
    },
  };
  const data = await postArkGeneration(payload);
  const remoteUrl = extractRemoteUrl(data);
  if (!remoteUrl) {
    throw new Error('Volcengine Ark response did not include a downloadable image URL yet. Configure provider polling when enabling the official SDK.');
  }
  return { remoteUrl, model, raw: data };
}

async function generateAssetWithVolcengine({ mediaType, prompt, durationSec, ratio, model, referenceImages }) {
  if (mediaType === 'video') {
    return generateVideoWithSeedance({
      prompt,
      durationSec,
      ratio,
      model: model || DEFAULT_SEEDANCE_MODEL,
      referenceImages,
    });
  }
  return generateImageWithSeedream({
    prompt,
    ratio,
    model: model || DEFAULT_SEEDREAM_MODEL,
  });
}

module.exports = {
  DEFAULT_SEEDANCE_MODEL,
  DEFAULT_SEEDREAM_MODEL,
  DEFAULT_ARK_BASE_URL,
  generateAssetWithVolcengine,
  generateImageWithSeedream,
  generateVideoWithSeedance,
  getArkGenerationTask,
  classifyPromptWithSeed,
  getSeedClassifierEndpointId,
  hasArkApiKey,
};
