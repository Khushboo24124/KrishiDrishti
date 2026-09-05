const env = require("./config/env");
const { connectDb } = require("./config/db");
const createApp = require("./app");

async function main() {
  await connectDb(); // logs and continues even if DB is down — health
                      // endpoint reports readiness; the process doesn't
                      // crash-loop on a transient DB outage.

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] AgriSense backend listening on :${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error("[server] fatal startup error:", err);
  process.exit(1);
});
