const fs = require('fs');
const path = require('path');
const { ROOT_DIR } = require('./paths');

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex === -1) return null;
  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!key) return null;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const entry = parseEnvLine(line);
    if (!entry) return;
    const [key, value] = entry;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function loadProjectEnv() {
  loadEnvFile(path.resolve(ROOT_DIR, '..', '.env'));
  loadEnvFile(path.resolve(ROOT_DIR, '.env'));
}

module.exports = {
  loadProjectEnv,
};
