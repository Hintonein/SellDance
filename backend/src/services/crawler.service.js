const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { CRAWLER_RUNS_DIR } = require('../config/paths');
const { listCrawlerTasks, writeCrawlerTasks } = require('./storage.service');
const { upsertVideosFromCrawler, rankVideos } = require('./inspiration-video.service');

const MEDIA_CRAWLER_DIR = process.env.MEDIACRAWLER_DIR || path.resolve(__dirname, '../../../../MediaCrawler');
const DEFAULT_TIMEOUT_MS = Number(process.env.MEDIACRAWLER_TIMEOUT_MS || 300000);
const SUPPORTED_PLATFORMS = new Set(['xhs', 'dy', 'ks', 'bili', 'wb', 'tieba', 'zhihu']);
const activeTasks = new Map();
const DEFAULT_UV_BIN = '/root/.local/bin/uv';
const CHROME_BIN = process.env.MEDIACRAWLER_CHROME_BIN || 'google-chrome';
const CHROME_CDP_URL = process.env.MEDIACRAWLER_CHROME_CDP_URL || 'http://127.0.0.1:9222/json/version';
const CHROME_DISPLAY = process.env.MEDIACRAWLER_CHROME_DISPLAY || process.env.DISPLAY || ':99';
const CHROME_ARGS = [
  '--remote-debugging-port=9222',
  '--user-data-dir=/root/selldance/MediaCrawler/browser_data/dy_cdp_user_data_dir',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
  '--window-size=1440,900',
  'https://www.douyin.com',
];

function now() {
  return new Date().toISOString();
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function parseLogLevel(message, fallback = 'info') {
  const text = String(message || '');
  if (/Traceback|TargetClosedError|ERROR|FAILED|Exception|timed out/i.test(text)) return 'error';
  if (/WARNING|WARN/i.test(text)) return 'warning';
  if (/\bINFO\b|MediaCrawler INFO|Received interrupt signal/i.test(text)) return 'info';
  return fallback;
}

function appendLog(task, message, level = 'info') {
  const normalized = parseLogLevel(message, level);
  task.logs = [...(task.logs || []), { timestamp: now(), level: normalized, message: String(message || '').slice(0, 2000) }].slice(-500);
}

function buildCrawlerArgs({ platform, keywords, limit, outputDir }) {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    const error = new Error(`Unsupported MediaCrawler platform: ${platform}`);
    error.statusCode = 400;
    throw error;
  }
  return [
    'run', 'python', 'main.py',
    '--platform', platform,
    '--type', 'search',
    '--keywords', keywords,
    '--crawler_max_notes_count', String(normalizeLimit(limit)),
    '--save_data_option', 'jsonl',
    '--save_data_path', outputDir,
    '--get_comment', 'false',
    '--get_sub_comment', 'false',
    '--headless', 'false',
  ];
}

function resolveUvBin() {
  if (process.env.MEDIACRAWLER_UV_BIN) return process.env.MEDIACRAWLER_UV_BIN;
  if (fsSync.existsSync(DEFAULT_UV_BIN)) return DEFAULT_UV_BIN;
  return 'uv';
}

function childEnv() {
  const pathEntries = [path.dirname(resolveUvBin()), '/root/.local/bin', process.env.PATH || ''].filter(Boolean);
  return {
    ...process.env,
    PATH: Array.from(new Set(pathEntries.join(':').split(':').filter(Boolean))).join(':'),
    DISPLAY: CHROME_DISPLAY,
    PYTHONUNBUFFERED: '1',
  };
}

async function saveTask(projectId, task) {
  const rows = await listCrawlerTasks(projectId);
  const exists = rows.some((item) => item.id === task.id);
  const next = exists ? rows.map((item) => (item.id === task.id ? task : item)) : [task, ...rows];
  await writeCrawlerTasks(projectId, next);
}

async function findContentFiles(outputDir, platform) {
  const platformDir = path.join(outputDir, platform === 'dy' ? 'douyin' : platform, 'jsonl');
  let files = [];
  try {
    files = await fs.readdir(platformDir);
  } catch {
    return [];
  }
  return files
    .filter((name) => /search_contents_.*\.jsonl$/.test(name))
    .map((name) => path.join(platformDir, name));
}

async function parseJsonlFiles(files) {
  const rows = [];
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try { rows.push(JSON.parse(trimmed)); } catch { /* skip malformed crawler row */ }
    });
  }
  return rows;
}

async function finalizeSuccess(projectId, task) {
  const files = await findContentFiles(task.outputDir, task.platform);
  const rows = limitRowsBySearchRank(await parseJsonlFiles(files), task.limit);
  const videos = await upsertVideosFromCrawler(projectId, rows, {
    platform: task.platform,
    category: task.category,
    keyword: task.keywords,
    semanticFilter: task.semanticFilter,
  });
  const ranked = await rankVideos(projectId, videos, task.semanticFilter || '');
  task.status = 'succeeded';
  task.progress = 100;
  task.resultCount = videos.length;
  task.topVideoIds = ranked.map((video) => video.id);
  task.rankingFallback = ranked.some((video) => video.rankingFallback);
  task.completedAt = now();
  appendLog(task, `Imported ${videos.length} public metadata records and ranked top ${ranked.length}.`, 'success');
  await saveTask(projectId, task);
}

async function importPartialResults(projectId, task, status, error = null) {
  const files = await findContentFiles(task.outputDir, task.platform);
  const rows = limitRowsBySearchRank(await parseJsonlFiles(files), task.limit);
  if (rows.length) {
    const videos = await upsertVideosFromCrawler(projectId, rows, {
      platform: task.platform,
      category: task.category,
      keyword: task.keywords,
      semanticFilter: task.semanticFilter,
    });
    const ranked = await rankVideos(projectId, videos, task.semanticFilter || '');
    task.resultCount = videos.length;
    task.topVideoIds = ranked.map((video) => video.id);
    task.rankingFallback = ranked.some((video) => video.rankingFallback);
    appendLog(task, `Crawler stopped before normal completion; imported ${videos.length} partial metadata records.`, 'warning');
  }
  task.status = rows.length && status !== 'cancelled' ? 'partial' : status;
  task.progress = rows.length ? 100 : task.progress;
  task.error = error;
  task.completedAt = now();
  await saveTask(projectId, task);
}

function limitRowsBySearchRank(rows = [], limit = 20) {
  const max = normalizeLimit(limit);
  return [...rows]
    .sort((a, b) => {
      const rankA = Number(a.search_rank || a.searchRank || Number.MAX_SAFE_INTEGER);
      const rankB = Number(b.search_rank || b.searchRank || Number.MAX_SAFE_INTEGER);
      if (rankA !== rankB) return rankA - rankB;
      return 0;
    })
    .slice(0, max);
}

function hasRunningTask() {
  for (const active of activeTasks.values()) {
    if (active?.task && ['queued', 'running'].includes(active.task.status)) return true;
  }
  return false;
}

async function startChrome(task, spawnImpl = spawn) {
  appendLog(task, `Starting Chrome for MediaCrawler: ${CHROME_BIN} ${CHROME_ARGS.join(' ')}`);
  appendLog(task, `Chrome DISPLAY=${CHROME_DISPLAY}`, 'info');
  const child = spawnImpl(CHROME_BIN, CHROME_ARGS, {
    cwd: MEDIA_CRAWLER_DIR,
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => appendLog(task, line, 'info')));
  child.stderr?.on('data', (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => appendLog(task, line, 'info')));
  child.on('error', (error) => appendLog(task, `Chrome launch warning: ${error.message}`, 'warning'));
  await waitForChromeReady(task, Number(process.env.MEDIACRAWLER_CHROME_READY_TIMEOUT_MS || 30000));
  return child;
}

async function waitForChromeReady(task, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(CHROME_CDP_URL);
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        appendLog(task, `Chrome CDP ready: ${payload.Browser || 'browser connected'}`, 'success');
        return payload;
      }
      lastError = new Error(`CDP returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const error = new Error(`Chrome CDP was not ready within ${timeoutMs}ms: ${lastError?.message || 'unknown error'}`);
  error.code = 'CHROME_CDP_NOT_READY';
  throw error;
}

function stopProcess(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return;
  try { child.kill(signal); } catch { /* no-op */ }
}

function closeChrome(chrome) {
  if (!chrome) return;
  stopProcess(chrome, 'SIGTERM');
  setTimeout(() => stopProcess(chrome, 'SIGKILL'), 5000);
}

async function startSearch(projectId, payload = {}, options = {}) {
  if (hasRunningTask()) {
    const error = new Error('A MediaCrawler search task is already running. Stop it before starting a new search.');
    error.statusCode = 409;
    error.code = 'MEDIACRAWLER_ALREADY_RUNNING';
    throw error;
  }
  const taskId = `crawler_task_${uuidv4()}`;
  const platform = payload.platform || 'dy';
  const keywords = String(payload.keywords || payload.keyword || '').trim();
  if (!keywords) {
    const error = new Error('keywords are required.');
    error.statusCode = 400;
    throw error;
  }
  const outputDir = path.join(CRAWLER_RUNS_DIR, taskId);
  const args = buildCrawlerArgs({ platform, keywords, limit: payload.limit, outputDir });
  const uvBin = options.uvBin || resolveUvBin();
  const task = {
    id: taskId,
    projectId,
    platform,
    keywords,
    category: payload.category || 'general',
    semanticFilter: String(payload.semanticFilter || '').trim(),
    limit: normalizeLimit(payload.limit),
    status: 'queued',
    cancelRequested: false,
    progress: 0,
    command: [uvBin, ...args],
    outputDir,
    logs: [],
    error: null,
    createdAt: now(),
    startedAt: null,
    completedAt: null,
  };
  await saveTask(projectId, task);
  runCrawlerTask(projectId, task, args, { ...options, uvBin }).catch(async (error) => {
    task.status = 'failed';
    task.error = { message: error.message, code: error.code };
    task.completedAt = now();
    appendLog(task, error.message, 'error');
    await saveTask(projectId, task);
  });
  return task;
}

async function runCrawlerTask(projectId, task, args, options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const uvBin = options.uvBin || resolveUvBin();
  task.status = 'running';
  task.progress = 10;
  task.startedAt = now();
  appendLog(task, 'Preparing Chrome before MediaCrawler starts.');
  await saveTask(projectId, task);
  await fs.mkdir(task.outputDir, { recursive: true });
  let chrome = null;
  try {
    chrome = await startChrome(task, spawnImpl);
  } catch (error) {
    closeChrome(chrome);
    task.status = 'failed';
    task.error = { message: error.message, code: error.code || 'CHROME_START_FAILED' };
    task.completedAt = now();
    appendLog(task, error.message, 'error');
    await saveTask(projectId, task);
    return;
  }
  appendLog(task, `Starting MediaCrawler: ${uvBin} ${args.join(' ')}`);
  await saveTask(projectId, task);

  const child = spawnImpl(uvBin, args, {
    cwd: options.cwd || MEDIA_CRAWLER_DIR,
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeTasks.set(task.id, { task, child, chrome });
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    appendLog(task, `MediaCrawler timed out after ${timeoutMs}ms.`, 'error');
    stopProcess(child, 'SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) {
        stopProcess(child, 'SIGKILL');
      }
    }, 5000);
  }, timeoutMs);

  const onData = async (chunk, level) => {
    String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => appendLog(task, line, level));
    task.progress = Math.max(task.progress || 10, 35);
    await saveTask(projectId, task);
  };
  child.stdout?.on('data', (chunk) => { onData(chunk, 'info'); });
  child.stderr?.on('data', (chunk) => { onData(chunk, 'info'); });

  await new Promise((resolve) => {
    child.on('close', resolve);
    child.on('error', (error) => {
      task.error = { message: error.message, code: error.code };
      resolve(1);
    });
  }).then(async (code) => {
    clearTimeout(timer);
    closeChrome(chrome);
    activeTasks.delete(task.id);
    if (task.cancelRequested) {
      await importPartialResults(projectId, task, 'cancelled', { message: 'Search cancelled by user.', code: 'MEDIACRAWLER_CANCELLED' });
      return;
    }
    if (timedOut) {
      await importPartialResults(projectId, task, 'timeout', { message: 'MediaCrawler task timed out.', code: 'MEDIACRAWLER_TIMEOUT' });
      return;
    }
    if (code !== 0) {
      const error = task.error || { message: `MediaCrawler exited with code ${code}.`, code: 'MEDIACRAWLER_FAILED' };
      appendLog(task, error.message, 'error');
      await importPartialResults(projectId, task, 'failed', error);
      return;
    }
    task.progress = 70;
    await saveTask(projectId, task);
    await finalizeSuccess(projectId, task);
  });
}

async function cancelTask(projectId, taskId) {
  const active = activeTasks.get(taskId);
  const task = active?.task || await getTask(projectId, taskId);
  if (!task || task.projectId !== projectId) return null;
  appendLog(task, 'User requested search cancellation.', 'warning');
  task.cancelRequested = true;
  if (active?.child) {
    stopProcess(active.child, 'SIGTERM');
    setTimeout(() => stopProcess(active.child, 'SIGKILL'), 5000);
  }
  closeChrome(active?.chrome);
  activeTasks.delete(taskId);
  await importPartialResults(projectId, task, 'cancelled', { message: 'Search cancelled by user.', code: 'MEDIACRAWLER_CANCELLED' });
  return task;
}

async function listTasks(projectId) {
  return (await listCrawlerTasks(projectId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getTask(projectId, taskId) {
  return (await listCrawlerTasks(projectId)).find((task) => task.id === taskId) || null;
}

module.exports = {
  buildCrawlerArgs,
  startSearch,
  listTasks,
  getTask,
  cancelTask,
  parseLogLevel,
  waitForChromeReady,
  parseJsonlFiles,
  limitRowsBySearchRank,
  findContentFiles,
};
