const express = require('express');
const cors = require('cors');
const { loadProjectEnv } = require('./config/env');
loadProjectEnv();
const apiRouter = require('./routes/api');
const { UPLOADS_DIR, OUTPUTS_DIR } = require('./config/paths');

const app = express();

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/outputs', express.static(OUTPUTS_DIR));
app.use('/api', apiRouter);

app.use((error, req, res, _next) => {
  console.error('[api.error]', {
    method: req.method,
    path: req.path,
    message: error.message,
    stack: error.stack,
  });
  if (error?.code === 'INVALID_ID') {
    return res.status(400).json({
      message: error.message,
      route: `${req.method} ${req.path}`,
    });
  }
  const statusCode = error?.statusCode || 500;
  return res.status(statusCode).json({
    message: error.message || 'Internal server error.',
    code: error.code,
    details: error.details,
    route: `${req.method} ${req.path}`,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
  });
});

module.exports = app;
