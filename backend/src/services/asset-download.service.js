const fs = require('fs/promises');
const path = require('path');
const { UPLOADS_DIR } = require('../config/paths');

function extensionFromContentType(contentType, fallback = '.bin') {
  if (!contentType) return fallback;
  if (contentType.includes('image/png')) return '.png';
  if (contentType.includes('image/jpeg')) return '.jpg';
  if (contentType.includes('image/svg')) return '.svg';
  if (contentType.includes('video/mp4')) return '.mp4';
  if (contentType.includes('video/webm')) return '.webm';
  return fallback;
}

async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

async function fileSize(filePath) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

async function copyUploadFile(sourcePath, targetName) {
  await ensureUploadsDir();
  const targetPath = path.join(UPLOADS_DIR, targetName);
  await fs.copyFile(sourcePath, targetPath);
  return {
    diskPath: targetPath,
    publicUrl: `/uploads/${targetName}`,
    size: await fileSize(targetPath),
  };
}

async function writeGeneratedSvg(targetName, { prompt = '', ratio = '1:1' } = {}) {
  await ensureUploadsDir();
  const targetPath = path.join(UPLOADS_DIR, targetName);
  const safePrompt = String(prompt || 'AI generated product asset')
    .replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#f8fafc"/>
  <rect x="110" y="260" width="860" height="1180" rx="48" fill="#ffffff" stroke="#dbeafe" stroke-width="8"/>
  <circle cx="540" cy="760" r="210" fill="#dbeafe"/>
  <rect x="330" y="1020" width="420" height="90" rx="45" fill="#1d4ed8"/>
  <text x="540" y="1078" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" fill="#ffffff">SellDance Mock Asset</text>
  <text x="540" y="1235" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#334155">${safePrompt.slice(0, 80)}</text>
  <text x="540" y="1320" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#64748b">ratio: ${ratio}</text>
</svg>`;
  await fs.writeFile(targetPath, svg);
  return {
    diskPath: targetPath,
    publicUrl: `/uploads/${targetName}`,
    size: await fileSize(targetPath),
  };
}

async function downloadRemoteAsset(remoteUrl, targetBaseName, fallbackExtension = '.bin') {
  if (!remoteUrl) {
    throw new Error('Remote asset URL is empty.');
  }
  await ensureUploadsDir();
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Remote asset download failed with ${response.status}.`);
  }
  const contentType = response.headers.get('content-type') || '';
  const extension = extensionFromContentType(contentType, fallbackExtension);
  const targetName = `${targetBaseName}${extension}`;
  const targetPath = path.join(UPLOADS_DIR, targetName);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
  return {
    diskPath: targetPath,
    publicUrl: `/uploads/${targetName}`,
    size: buffer.length,
    contentType,
  };
}

module.exports = {
  copyUploadFile,
  downloadRemoteAsset,
  fileSize,
  writeGeneratedSvg,
};
