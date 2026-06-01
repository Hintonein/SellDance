const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  PROJECTS_DIR,
  ASSETS_DIR,
  SCRIPTS_DIR,
  STORYBOARDS_DIR,
  TASKS_DIR,
  UPLOADS_DIR,
  COMPLIANCE_REVIEWS_FILE,
  DISTRIBUTION_EVENTS_FILE,
  CONVERSION_EVENTS_FILE,
} = require('../src/config/paths');

const now = new Date().toISOString();

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function readJson(filePath, fallback = []) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function ensureDemoImage() {
  await ensureDir(UPLOADS_DIR);
  const filePath = path.join(UPLOADS_DIR, 'demo-product-image.svg');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <rect width="1080" height="1440" fill="#f8fafc"/>
  <rect x="160" y="210" width="760" height="920" rx="54" fill="#ffffff" stroke="#bfdbfe" stroke-width="8"/>
  <circle cx="540" cy="580" r="180" fill="#dbeafe"/>
  <text x="540" y="920" text-anchor="middle" font-family="Arial" font-size="52" fill="#1e3a8a">SellDance Demo</text>
  <text x="540" y="1000" text-anchor="middle" font-family="Arial" font-size="34" fill="#64748b">Product image placeholder</text>
</svg>`;
  await fs.writeFile(filePath, svg);
  return filePath;
}

async function ensureDemoVideo() {
  await ensureDir(UPLOADS_DIR);
  const filePath = path.join(UPLOADS_DIR, 'demo-product-video.mp4');
  if (fsSync.existsSync(filePath)) return filePath;

  const ffmpeg = spawnSync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0xf8fafc:s=720x1280:d=2',
    '-pix_fmt',
    'yuv420p',
    filePath,
  ], { stdio: 'ignore' });

  if (ffmpeg.status !== 0 || !fsSync.existsSync(filePath)) {
    throw new Error('Seed mock data requires backend/uploads/demo-product-video.mp4. Install FFmpeg or place a demo MP4 there, then retry.');
  }
  return filePath;
}

function product(index) {
  const categories = ['beauty', 'home', 'fitness', 'electronics', 'kitchen'];
  return {
    productId: `seed-prod-${String(index).padStart(3, '0')}`,
    productName: `Seed Product ${index}`,
    productCategory: categories[index % categories.length],
    sellingPoints: ['high conversion visual', 'clear usage scenario', 'short-video friendly'],
  };
}

function mockAnalysis(type, name) {
  return {
    subject: type.includes('video') ? '商品展示视频' : '商品展示图片',
    category: type,
    colors: ['white', 'blue', 'gold'],
    scene: type.includes('reference') ? 'reference social commerce scene' : 'studio',
    style: 'clean commercial',
    tags: ['seed', type, '素材库', type.includes('video') ? '视频素材' : '图片素材'],
    summary: `${name} 是 seed 脚本生成的 ${type} mock 素材，可用于脚本、分镜和视频生成模块召回。`,
    embedding: [0.11, 0.22, 0.33, 0.44],
    vector: [0.11, 0.22, 0.33, 0.44],
  };
}

function buildAsset(projectId, productId, index, demoImageUrl, demoVideoUrl) {
  const video = index % 3 === 0;
  const reference = index % 5 === 0;
  const type = video ? (reference ? 'reference_video' : 'product_video') : (reference ? 'reference_image' : 'product_image');
  const assetId = `seed-asset-${String(index).padStart(3, '0')}`;
  const url = video ? demoVideoUrl : demoImageUrl;
  const name = `${type}_${assetId}${video ? '.mp4' : '.svg'}`;
  return {
    id: assetId,
    assetId,
    projectId,
    productId,
    type,
    originalName: name,
    name,
    filename: path.basename(url),
    storagePath: url.replace(/^\//, ''),
    fileUrl: url,
    url,
    thumbnailUrl: video ? demoImageUrl : url,
    mimeType: video ? 'video/mp4' : 'image/svg+xml',
    size: video ? 1024 * 512 : 4096,
    source: index % 4 === 0 ? 'ai_generated' : 'uploaded',
    provider: index % 4 === 0 ? 'mock' : null,
    model: index % 4 === 0 ? 'mock-seed-generator' : null,
    prompt: index % 4 === 0 ? 'seed mock generated asset' : '',
    analysis: mockAnalysis(type, name),
    createdAt: now,
    updatedAt: now,
    uploadedAt: now,
  };
}

function buildScript(projectId, productInfo, index) {
  const scriptId = `seed-script-${String(index).padStart(3, '0')}`;
  const versionId = `seed-script-version-${String(index).padStart(3, '0')}`;
  const scriptText = `Stop scrolling - meet ${productInfo.productName}. Designed for shoppers who want ${productInfo.sellingPoints[0]}. Show the product clearly, prove the use case, and close with a direct TikTok Shop CTA.`;
  return {
    id: scriptId,
    scriptId,
    projectId,
    scriptText,
    selectedVersionId: versionId,
    versions: [{
      versionId,
      versionNumber: 1,
      prompt: 'seed mock script',
      hook: `Stop scrolling - meet ${productInfo.productName}.`,
      painPoint: `Shoppers need ${productInfo.sellingPoints[0]}.`,
      productIntroduction: `${productInfo.productName} is built for short commerce videos.`,
      sellingPoints: productInfo.sellingPoints,
      cta: 'Tap now to check the offer.',
      tone: 'confident',
      suggestedDuration: 15,
      sceneOutline: ['hook', 'pain point', 'product proof', 'CTA'],
      scriptText,
      createdAt: now,
    }],
    source: 'seed',
    updatedAt: now,
  };
}

function buildStoryboard(projectId, script, assets, index) {
  const scenes = script.versions[0].sceneOutline.map((label, sceneIndex) => ({
    sceneId: `seed-scene-${index}-${sceneIndex + 1}`,
    sceneOrder: sceneIndex + 1,
    sceneIndex: sceneIndex + 1,
    durationSeconds: sceneIndex === 3 ? 3 : 4,
    duration: sceneIndex === 3 ? 3 : 4,
    scriptText: `${label}: ${script.versions[0].scriptText}`,
    narration: `${label}: ${script.versions[0].scriptText}`,
    subtitleText: label,
    subtitle: label,
    visualDescription: `Seed scene for ${label}`,
    cameraMotion: sceneIndex === 0 ? 'quick push-in' : 'smooth pan',
    selectedAssetIds: [assets[sceneIndex % assets.length].assetId],
    assetRefs: [assets[sceneIndex % assets.length].assetId],
    layout: 'cover',
    transition: 'cut',
    bgmHint: 'upbeat commerce bed',
    status: 'ready',
  }));
  return {
    id: projectId,
    storyboardId: projectId,
    projectId,
    scriptId: script.scriptId,
    source: 'seed',
    scenes,
    totalDuration: scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    updatedAt: now,
  };
}

async function main() {
  const demoImage = await ensureDemoImage();
  const demoVideo = await ensureDemoVideo();
  const demoImageUrl = `/uploads/${path.basename(demoImage)}`;
  const demoVideoUrl = `/uploads/${path.basename(demoVideo)}`;

  await Promise.all([PROJECTS_DIR, ASSETS_DIR, SCRIPTS_DIR, STORYBOARDS_DIR, TASKS_DIR].map(ensureDir));

  const products = Array.from({ length: 20 }, (_, index) => product(index + 1));
  const complianceReviews = (await readJson(COMPLIANCE_REVIEWS_FILE, [])).filter((item) => !String(item.id).startsWith('seed-'));
  const distributionEvents = [];
  const conversionEvents = [];

  for (let index = 1; index <= 30; index += 1) {
    const productInfo = products[(index - 1) % products.length];
    const projectId = `seed-project-${String(index).padStart(3, '0')}`;
    const project = {
      id: projectId,
      projectId,
      name: `${productInfo.productName} Campaign ${index}`,
      projectName: `${productInfo.productName} Campaign ${index}`,
      productName: productInfo.productName,
      productId: productInfo.productId,
      productUrl: productInfo.productId,
      productCategory: productInfo.productCategory,
      targetAudience: 'TikTok Shop shoppers',
      sellingPoints: productInfo.sellingPoints,
      tone: 'confident',
      style: 'clean product demo',
      targetPlatform: 'TikTok Shop',
      expectedDuration: 15,
      status: 'active',
      description: 'Seed mock project for SellDance demo.',
      createdAt: now,
      updatedAt: now,
    };
    await writeJson(path.join(PROJECTS_DIR, `${projectId}.json`), project);

    const assetCount = index <= 10 ? 4 : 3;
    const assets = Array.from({ length: assetCount }, (_, assetIndex) =>
      buildAsset(projectId, productInfo.productId, (index - 1) * 4 + assetIndex + 1, demoImageUrl, demoVideoUrl)
    );
    await writeJson(path.join(ASSETS_DIR, `${projectId}.json`), assets);

    const script = buildScript(projectId, productInfo, index);
    await writeJson(path.join(SCRIPTS_DIR, `${projectId}.json`), script);
    await writeJson(path.join(STORYBOARDS_DIR, `${projectId}.json`), buildStoryboard(projectId, script, assets, index));

    const taskId = `seed-task-${String(index).padStart(3, '0')}`;
    await writeJson(path.join(TASKS_DIR, `${taskId}.json`), {
      id: taskId,
      taskId,
      projectId,
      scriptId: script.scriptId,
      storyboardId: projectId,
      status: 'completed',
      progress: 100,
      currentStep: 'exporting',
      errorMessage: null,
      options: {},
      retries: 0,
      exportFile: null,
      videoUrl: demoVideoUrl,
      outputVideoUrl: demoVideoUrl,
      exportPresets: [
        { presetId: 'vertical', aspectRatio: '9:16', label: 'TikTok/Reels 9:16', url: demoVideoUrl },
        { presetId: 'wide', aspectRatio: '16:9', label: 'YouTube 16:9', url: demoVideoUrl },
      ],
      createdAt: now,
      updatedAt: now,
    });

    assets
      .filter((asset) => asset.source === 'ai_generated')
      .forEach((asset) => {
        complianceReviews.push({
          id: `seed-review-${asset.assetId}`,
          assetId: asset.assetId,
          projectId,
          reviewType: 'ai_generated_content',
          status: 'needs_manual_review',
          riskLevel: 'medium',
          riskTags: ['AI生成', '需人工确认真实性', '需确认商品功效表达'],
          comment: 'Seed AI generated asset review.',
          createdAt: now,
        });
      });

    distributionEvents.push({
      id: `seed-dist-${String(index).padStart(3, '0')}`,
      projectId,
      platform: 'TikTok Shop',
      impressions: 1000 + index * 17,
      clicks: 80 + index,
      createdAt: now,
    });
    conversionEvents.push({
      id: `seed-conv-${String(index).padStart(3, '0')}`,
      projectId,
      productId: productInfo.productId,
      orders: 5 + (index % 7),
      revenue: 99 + index * 3,
      createdAt: now,
    });
  }

  await writeJson(COMPLIANCE_REVIEWS_FILE, complianceReviews);
  await writeJson(DISTRIBUTION_EVENTS_FILE, distributionEvents);
  await writeJson(CONVERSION_EVENTS_FILE, conversionEvents);
  console.log('Seed mock data generated: 20 products, 30 projects, ~100 assets, scripts, storyboards, tasks, events, compliance reviews.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
