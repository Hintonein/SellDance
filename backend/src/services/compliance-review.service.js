const { v4: uuidv4 } = require('uuid');
const { listComplianceReviews, writeComplianceReviews } = require('./storage.service');

async function createAiGeneratedAssetReview({ projectId, assetId }) {
  const reviews = await listComplianceReviews();
  const review = {
    id: `review_${uuidv4()}`,
    assetId,
    projectId,
    reviewType: 'ai_generated_content',
    status: 'needs_manual_review',
    riskLevel: 'medium',
    riskTags: ['AI生成', '需人工确认真实性', '需确认商品功效表达'],
    comment: 'AI 生成素材已入库，需要人工确认版权、品牌露出、功效表达和平台合规风险。',
    createdAt: new Date().toISOString(),
  };
  await writeComplianceReviews([review, ...reviews]);
  return review;
}

module.exports = {
  createAiGeneratedAssetReview,
};
