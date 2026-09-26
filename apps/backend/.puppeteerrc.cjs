const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Store Chrome in the local project directory so it persists in Render deployment
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
