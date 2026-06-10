const fs = require('fs/promises');
const path = require('path');

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com';
const DEFAULT_TIMEOUT_MS = 90000;

function seed2Config() {
  return {
    apiKey: process.env.ARK_API_KEY || '',
    endpointId: process.env.SEED_ENDPOINT_ID || '',
    baseUrl: process.env.ARK_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs: Number(process.env.SEED2_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function responsesUrl(baseUrl = DEFAULT_BASE_URL) {
  const normalized = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  if (normalized.endsWith('/api/v3')) return `${normalized}/responses`;
  if (normalized.endsWith('/api/v3/responses')) return normalized;
  return `${normalized}/api/v3/responses`;
}

function missingSeed2ConfigError() {
  const error = new Error('Seed 2.0 analysis requires ARK_API_KEY and SEED_ENDPOINT_ID. Configure .env or switch AI_ASSET_ANALYSIS_PROVIDER=mock.');
  error.statusCode = 400;
  error.code = 'MISSING_SEED2_ENV';
  error.provider = 'seed2';
  return error;
}

function inferMimeType(filePath = '') {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function fileToDataUrl(filePath) {
  const bytes = await fs.readFile(filePath);
  return `data:${inferMimeType(filePath)};base64,${bytes.toString('base64')}`;
}

function stripJsonFence(text = '') {
  return String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractOutputText(payload) {
  if (!payload) return '';
  if (typeof payload.output_text === 'string') return payload.output_text;
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
      if (typeof content.output_text === 'string') chunks.push(content.output_text);
    }
  }
  if (typeof payload.text === 'string') chunks.push(payload.text);
  return chunks.join('\n').trim();
}

function parseJsonOrFallback(rawText) {
  const stripped = stripJsonFence(rawText);
  try {
    return { parsed: JSON.parse(stripped), warning: null };
  } catch (error) {
    return {
      parsed: {
        summary: stripped.slice(0, 800) || 'Seed 2.0 returned a non-JSON analysis response.',
        tags: [],
        rawText: stripped.slice(0, 4000),
        parseWarning: error.message,
      },
      warning: error.message,
    };
  }
}

function buildAnalysisPrompt({ asset, slices = [], promptContext = {}, mode }) {
  const sliceHints = slices.slice(0, 12).map((slice) => ({
    id: slice.id,
    index: slice.index,
    startTime: slice.startTime,
    endTime: slice.endTime,
    duration: slice.duration,
    tags: slice.tags || [],
  }));
  return [
    'You are analyzing merchant-owned e-commerce product assets for AIGC short video creation.',
    'Return strict JSON only. Do not wrap the answer in markdown.',
    'Use concise English canonical tags when possible, such as product, close_up, usage, unboxing, detail, comparison, hook.',
    mode === 'video'
      ? 'The images are representative frames sampled from the same product video in chronological order.'
      : 'The image is a merchant-uploaded product/reference image.',
    'Required JSON schema:',
    JSON.stringify({
      subject: 'main product or object',
      category: 'product category',
      colors: ['...'],
      material: ['...'],
      sellingPoints: ['...'],
      usageScenarios: ['...'],
      visualStyle: ['...'],
      summary: 'short asset summary',
      tags: ['product', 'close_up', 'usage'],
      video: {
        overallSummary: 'video summary if applicable',
        cameraStyle: 'camera style if applicable',
        actions: ['...'],
        sceneTypes: ['...'],
      },
      sliceSuggestions: [
        {
          startTime: 0,
          endTime: 3,
          visualDescription: 'what happens in this time range',
          tags: ['hook', 'product', 'close_up'],
          usageSuggestion: 'use_as_hook',
        },
      ],
    }),
    'Asset context:',
    JSON.stringify({
      id: asset?.id,
      title: asset?.title || asset?.name,
      type: asset?.type,
      assetType: asset?.assetType,
      mediaType: asset?.mediaType,
      userTags: asset?.userTags || asset?.tags || [],
      metadata: asset?.metadata || {},
      promptContext,
      slices: sliceHints,
    }),
  ].join('\n');
}

async function buildImageContent({ asset, imageFile, imageUrl, promptContext, mode, slices }) {
  let imageValue = imageUrl || '';
  if (!imageValue && imageFile) imageValue = await fileToDataUrl(imageFile);
  if (!imageValue) {
    const error = new Error('Seed 2.0 image analysis requires a local image file or accessible image URL.');
    error.statusCode = 400;
    error.code = 'SEED2_IMAGE_INPUT_MISSING';
    throw error;
  }
  return [
    { type: 'input_text', text: buildAnalysisPrompt({ asset, slices, promptContext, mode }) },
    { type: 'input_image', image_url: imageValue },
  ];
}

async function buildVideoContent({ asset, frames = [], slices = [], promptContext }) {
  const validFrames = frames.filter((frame) => frame.filePath || frame.fileUrl);
  if (!validFrames.length) {
    const error = new Error('Seed 2.0 video analysis requires representative frames or slice thumbnails.');
    error.statusCode = 400;
    error.code = 'SEED2_VIDEO_FRAMES_MISSING';
    throw error;
  }
  const content = [
    { type: 'input_text', text: buildAnalysisPrompt({ asset, slices, promptContext, mode: 'video' }) },
  ];
  for (const frame of validFrames.slice(0, 8)) {
    const imageValue = frame.filePath ? await fileToDataUrl(frame.filePath) : frame.fileUrl;
    content.push({ type: 'input_image', image_url: imageValue });
  }
  return content;
}

async function callSeed2Responses(content, config = seed2Config(), fetchImpl = globalThis.fetch) {
  if (!config.apiKey || !config.endpointId) throw missingSeed2ConfigError();
  if (typeof fetchImpl !== 'function') {
    const error = new Error('Global fetch is not available in this Node runtime.');
    error.statusCode = 500;
    error.code = 'FETCH_UNAVAILABLE';
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs || DEFAULT_TIMEOUT_MS);
  const body = {
    model: config.endpointId,
    input: [{ role: 'user', content }],
    temperature: 0,
  };
  try {
    const response = await fetchImpl(responsesUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload = null;
    try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = { rawText: responseText }; }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || `Seed 2.0 request failed with HTTP ${response.status}.`);
      error.statusCode = response.status >= 500 ? 502 : response.status;
      error.code = payload?.error?.code || 'SEED2_REQUEST_FAILED';
      error.provider = 'seed2';
      error.details = payload?.error || payload;
      throw error;
    }
    const rawText = extractOutputText(payload);
    const { parsed, warning } = parseJsonOrFallback(rawText);
    return {
      ...parsed,
      provider: 'seed2',
      model: config.endpointId,
      rawText: rawText.slice(0, 4000),
      parseWarning: warning || parsed.parseWarning || null,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Seed 2.0 request timed out.');
      timeoutError.statusCode = 504;
      timeoutError.code = 'SEED2_TIMEOUT';
      timeoutError.provider = 'seed2';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function generateJsonWithSeed2({
  systemPrompt = '',
  userPrompt = '',
  schema = null,
  temperature = 0,
  fetchImpl,
} = {}) {
  const schemaHint = schema ? `\nRequired JSON schema:\n${JSON.stringify(schema, null, 2)}` : '';
  const text = [
    systemPrompt || 'You are a strict JSON generation assistant for compliant e-commerce short-form video planning.',
    'Return strict JSON only. Do not wrap the answer in markdown. Do not include comments.',
    schemaHint,
    'User input:',
    userPrompt,
  ].filter(Boolean).join('\n');
  const config = seed2Config();
  if (!config.apiKey || !config.endpointId) throw missingSeed2ConfigError();
  if (typeof (fetchImpl || globalThis.fetch) !== 'function') {
    const error = new Error('Global fetch is not available in this Node runtime.');
    error.statusCode = 500;
    error.code = 'FETCH_UNAVAILABLE';
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs || DEFAULT_TIMEOUT_MS);
  const body = {
    model: config.endpointId,
    input: [{ role: 'user', content: [{ type: 'input_text', text }] }],
    temperature,
  };
  try {
    const response = await (fetchImpl || globalThis.fetch)(responsesUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload = null;
    try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = { rawText: responseText }; }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || `Seed 2.0 request failed with HTTP ${response.status}.`);
      error.statusCode = response.status >= 500 ? 502 : response.status;
      error.code = payload?.error?.code || 'SEED2_REQUEST_FAILED';
      error.provider = 'seed2';
      error.details = payload?.error || payload;
      throw error;
    }
    const rawText = extractOutputText(payload);
    const { parsed, warning } = parseJsonOrFallback(rawText);
    return {
      ...parsed,
      provider: 'seed2',
      model: config.endpointId,
      rawText: rawText.slice(0, 4000),
      parseWarning: warning || parsed.parseWarning || null,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Seed 2.0 request timed out.');
      timeoutError.statusCode = 504;
      timeoutError.code = 'SEED2_TIMEOUT';
      timeoutError.provider = 'seed2';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeImageWithSeed2({ asset, imageFile, imageUrl, promptContext = {}, fetchImpl } = {}) {
  const content = await buildImageContent({ asset, imageFile, imageUrl, promptContext, mode: 'image', slices: [] });
  return callSeed2Responses(content, seed2Config(), fetchImpl);
}

async function analyzeVideoFramesWithSeed2({ asset, frames = [], slices = [], promptContext = {}, fetchImpl } = {}) {
  const content = await buildVideoContent({ asset, frames, slices, promptContext });
  return callSeed2Responses(content, seed2Config(), fetchImpl);
}

async function analyzeAssetWithSeed2(asset, options = {}) {
  if (asset?.mediaType === 'video') return analyzeVideoFramesWithSeed2({ asset, ...options });
  return analyzeImageWithSeed2({ asset, imageFile: options.imageFile, imageUrl: options.imageUrl, promptContext: options.promptContext, fetchImpl: options.fetchImpl });
}

module.exports = {
  seed2Config,
  responsesUrl,
  analyzeAssetWithSeed2,
  analyzeImageWithSeed2,
  analyzeVideoFramesWithSeed2,
  generateJsonWithSeed2,
  missingSeed2ConfigError,
  parseJsonOrFallback,
};
