const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', apiRouter);

app.use((error, _req, res, _next) => {
  if (error?.code === 'INVALID_ID') {
    return res.status(400).json({ message: error.message });
  }
  return res.status(500).json({ message: 'Internal server error.' });
});

module.exports = app;
