const { startScheduler } = require("./scheduler");

function startServices() {
  console.log("[launch] Starting scheduler...");
  startScheduler();
  console.log("[launch] All services started.");
}

if (require.main === module) {
  startServices();
}

module.exports = {
  startServices,
};
