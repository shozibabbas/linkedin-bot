const { startScheduler } = require("./scheduler");
const { startWebServer } = require("./web-server");

function startServices() {
  console.log("[launch] Starting scheduler and web server...");
  startScheduler();
  startWebServer();
  console.log("[launch] All services started.");
}

if (require.main === module) {
  startServices();
}

module.exports = {
  startServices,
};
