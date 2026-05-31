function runConstraintCheckAgent(input = {}) {
  const duration = Number(input.totalDuration || input.metadata?.duration || 0);
  const risks = [];
  if (duration > 15) risks.push({ code: 'DURATION_OVER_15S', message: 'Total duration should be compressed to 15 seconds or less.' });
  const text = JSON.stringify(input).toLowerCase();
  if (text.includes('guaranteed') || text.includes('100%')) risks.push({ code: 'UNVERIFIED_CLAIM', message: 'Avoid unverifiable absolute claims.' });
  return {
    provider: 'mock',
    passed: risks.length === 0,
    risks,
    constraints: ['max 15 seconds', 'avoid unverifiable claims', 'do not reuse third-party original video content'],
  };
}

module.exports = { runConstraintCheckAgent };
