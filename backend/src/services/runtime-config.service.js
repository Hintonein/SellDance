const fs = require('fs/promises');
const path = require('path');
const { PROJECT_ENV_FILE } = require('../config/env');

function hasValue(value) {
  return Boolean(String(value || '').trim());
}

function maskSecret(value) {
  const secret = String(value || '').trim();
  if (!secret) return '';
  if (secret.length <= 10) return `${secret.slice(0, 2)}****${secret.slice(-2)}`;
  return `${secret.slice(0, 6)}****${secret.slice(-4)}`;
}

function envLine(key, value) {
  const escaped = String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '');
  return `${key}="${escaped}"`;
}

async function readEnvFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function upsertEnvValue(content, key, value) {
  const lines = content ? content.split(/\r?\n/) : [];
  const nextLine = envLine(key, value);
  let updated = false;
  const next = lines.map((line) => {
    if (line.trim().startsWith('#')) return line;
    const separator = line.indexOf('=');
    if (separator === -1) return line;
    if (line.slice(0, separator).trim() !== key) return line;
    updated = true;
    return nextLine;
  });
  if (!updated) {
    if (next.length && next[next.length - 1].trim()) next.push('');
    next.push(nextLine);
  }
  return `${next.join('\n').replace(/\n+$/, '')}\n`;
}

function getRuntimeConfigStatus() {
  return {
    arkApiKeyConfigured: hasValue(process.env.ARK_API_KEY),
    arkApiKeyMasked: maskSecret(process.env.ARK_API_KEY),
    seedEndpointConfigured: hasValue(process.env.SEED_ENDPOINT_ID),
    seedanceEndpointConfigured: hasValue(process.env.SEEDANCE_ENDPOINT_ID),
    seedreamEndpointConfigured: hasValue(process.env.SEEDREAM_ENDPOINT_ID),
  };
}

async function saveArkApiKey(apiKey) {
  const normalized = String(apiKey || '').trim();
  if (!normalized) {
    const error = new Error('Ark API key is required.');
    error.statusCode = 400;
    error.code = 'ARK_API_KEY_REQUIRED';
    throw error;
  }
  if (normalized.length < 12) {
    const error = new Error('Ark API key looks too short.');
    error.statusCode = 400;
    error.code = 'ARK_API_KEY_INVALID';
    throw error;
  }

  await fs.mkdir(path.dirname(PROJECT_ENV_FILE), { recursive: true });
  const current = await readEnvFile(PROJECT_ENV_FILE);
  await fs.writeFile(PROJECT_ENV_FILE, upsertEnvValue(current, 'ARK_API_KEY', normalized));
  process.env.ARK_API_KEY = normalized;
  return getRuntimeConfigStatus();
}

module.exports = {
  getRuntimeConfigStatus,
  saveArkApiKey,
  maskSecret,
};
