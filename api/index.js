/** Vercel serverless entry — wraps Express for the /api routes. */
const serverless = require("serverless-http");
const app = require("../server");

module.exports = serverless(app, {
  binary: ["audio/mpeg", "audio/*", "application/octet-stream"],
});
