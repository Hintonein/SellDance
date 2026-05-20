const fs = require('fs/promises');
const path = require('path');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function readJsonFiles(dirPath) {
  await ensureDir(dirPath);
  const files = await fs.readdir(dirPath);
  const jsonFiles = files.filter((name) => name.endsWith('.json'));
  const records = await Promise.all(
    jsonFiles.map(async (name) => {
      const content = await readJson(path.join(dirPath, name));
      return content;
    })
  );
  return records.filter(Boolean);
}

module.exports = {
  ensureDir,
  readJson,
  writeJson,
  readJsonFiles,
};
