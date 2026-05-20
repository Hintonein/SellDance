const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  PROJECTS_DIR: path.join(DATA_DIR, 'projects'),
  ASSETS_DIR: path.join(DATA_DIR, 'assets'),
  SCRIPTS_DIR: path.join(DATA_DIR, 'scripts'),
  STORYBOARDS_DIR: path.join(DATA_DIR, 'storyboards'),
  TASKS_DIR: path.join(DATA_DIR, 'generation-tasks'),
  UPLOADS_DIR: path.join(ROOT_DIR, 'uploads'),
  OUTPUTS_DIR: path.join(ROOT_DIR, 'outputs'),
};
