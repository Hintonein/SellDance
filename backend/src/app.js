const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api');
const { UPLOADS_DIR, OUTPUTS_DIR } = require('./config/paths');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/outputs', express.static(OUTPUTS_DIR));
app.use('/api', apiRouter);

app.use((error, _req, res, _next) => {
  if (error?.code === 'INVALID_ID') {
    return res.status(400).json({ message: error.message });
  }
  return res.status(500).json({ message: 'Internal server error.' });
});

module.exports = app;
