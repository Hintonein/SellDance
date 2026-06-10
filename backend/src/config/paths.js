const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  PROJECTS_DIR: path.join(DATA_DIR, 'projects'),
  ASSETS_DIR: path.join(DATA_DIR, 'assets'),
  PROJECT_ASSET_LINKS_DIR: path.join(DATA_DIR, 'project-assets'),
  ASSET_SLICES_FILE: path.join(DATA_DIR, 'asset-slices.json'),
  SCRIPTS_DIR: path.join(DATA_DIR, 'scripts'),
  STORYBOARDS_DIR: path.join(DATA_DIR, 'storyboards'),
  TASKS_DIR: path.join(DATA_DIR, 'generation-tasks'),
  ASSET_GENERATION_TASKS_FILE: path.join(DATA_DIR, 'asset-generation-tasks.json'),
  ASSET_ANALYSIS_TASKS_FILE: path.join(DATA_DIR, 'asset-analysis-tasks.json'),
  COMPLIANCE_REVIEWS_FILE: path.join(DATA_DIR, 'compliance-reviews.json'),
  DISTRIBUTION_EVENTS_FILE: path.join(DATA_DIR, 'distribution-events.json'),
  CONVERSION_EVENTS_FILE: path.join(DATA_DIR, 'conversion-events.json'),
  TEMPLATES_FILE: path.join(DATA_DIR, 'templates.json'),
  REFERENCE_VIDEOS_FILE: path.join(DATA_DIR, 'reference-videos.json'),
  EDITING_PLANS_FILE: path.join(DATA_DIR, 'editing-plans.json'),
  INSPIRATION_VIDEOS_DIR: path.join(DATA_DIR, 'inspiration-videos'),
  VIDEO_ANALYSIS_REPORTS_DIR: path.join(DATA_DIR, 'video-analysis-reports'),
  INSPIRATION_TEMPLATES_DIR: path.join(DATA_DIR, 'inspiration-templates'),
  GENERATED_SCRIPTS_DIR: path.join(DATA_DIR, 'generated-scripts'),
  CRAWLER_TASKS_DIR: path.join(DATA_DIR, 'crawler-tasks'),
  CRAWLER_RUNS_DIR: path.join(DATA_DIR, 'crawler-runs'),
  INSPIRATION_WORKFLOW_TASKS_DIR: path.join(DATA_DIR, 'inspiration-workflow-tasks'),
  SCRIPT_WORKFLOW_TASKS_DIR: path.join(DATA_DIR, 'script-workflow-tasks'),
  CREATION_WORKFLOW_TASKS_DIR: path.join(DATA_DIR, 'creation-workflow-tasks'),
  TMP_INSPIRATION_ANALYSIS_DIR: path.join(DATA_DIR, 'tmp-inspiration-analysis'),
  UPLOADS_DIR: path.join(ROOT_DIR, 'uploads'),
  OUTPUTS_DIR: path.join(ROOT_DIR, 'outputs'),
};
