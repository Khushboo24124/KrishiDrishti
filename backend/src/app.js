const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const requestId = require("./middleware/requestId");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const apiV1Routes = require("./routes");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestId);
  app.use(
    morgan(":method :url :status :res[content-length] - :response-time ms", {
      // Correlation ID goes to console.warn/error in errorHandler; morgan
      // stays focused on the access-log line itself.
    })
  );

  app.use("/api/v1", apiV1Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
