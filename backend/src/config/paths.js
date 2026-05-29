const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  PROJECTS_DIR: path.join(DATA_DIR, 'projects'),
  ASSETS_DIR: path.join(DATA_DIR, 'assets'),
  ASSET_SLICES_FILE: path.join(DATA_DIR, 'asset-slices.json'),
  SCRIPTS_DIR: path.join(DATA_DIR, 'scripts'),
  STORYBOARDS_DIR: path.join(DATA_DIR, 'storyboards'),
  TASKS_DIR: path.join(DATA_DIR, 'generation-tasks'),
  ASSET_GENERATION_TASKS_FILE: path.join(DATA_DIR, 'asset-generation-tasks.json'),
  COMPLIANCE_REVIEWS_FILE: path.join(DATA_DIR, 'compliance-reviews.json'),
  DISTRIBUTION_EVENTS_FILE: path.join(DATA_DIR, 'distribution-events.json'),
  CONVERSION_EVENTS_FILE: path.join(DATA_DIR, 'conversion-events.json'),
  TEMPLATES_FILE: path.join(DATA_DIR, 'templates.json'),
  REFERENCE_VIDEOS_FILE: path.join(DATA_DIR, 'reference-videos.json'),
  EDITING_PLANS_FILE: path.join(DATA_DIR, 'editing-plans.json'),
  UPLOADS_DIR: path.join(ROOT_DIR, 'uploads'),
  OUTPUTS_DIR: path.join(ROOT_DIR, 'outputs'),
};
