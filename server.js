const { start } = require('./backend/server');

start().catch((error) => {
  console.error('Unable to start API:', error.message);
  process.exitCode = 1;
});
