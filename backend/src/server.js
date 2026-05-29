const app = require('./app');

const PORT = process.env.PORT || 4000;

process.on('unhandledRejection', (error) => {
  console.error('[process.unhandledRejection]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[process.uncaughtException]', error);
});

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SellDance API listening on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  console.error('[server.error]', error);
});
