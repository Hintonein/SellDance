const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function ensureSafeId(value) {
  if (!SAFE_ID_PATTERN.test(value || '')) {
    const error = new Error('Invalid identifier.');
    error.code = 'INVALID_ID';
    throw error;
  }
  return value;
}

module.exports = {
  ensureSafeId,
};
