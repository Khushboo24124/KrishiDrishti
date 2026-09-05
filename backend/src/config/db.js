const mongoose = require("mongoose");
const env = require("./env");

let isConnected = false;
let lastError = null;

async function connectDb() {
  mongoose.set("strictQuery", true);
  mongoose.set("bufferCommands", false);
  try {
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    lastError = null;
    console.log("[db] connected to MongoDB");
  } catch (err) {
    isConnected = false;
    lastError = err.message;
    console.error("[db] connection failed:", err.message);
  }

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
    console.warn("[db] disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    isConnected = true;
    console.log("[db] reconnected");
  });
  mongoose.connection.on("error", (err) => {
    lastError = err.message;
    console.error("[db] error:", err.message);
  });
}

function dbStatus() {
  // mongoose.connection.readyState: 0=disconnected,1=connected,2=connecting,3=disconnecting
  const readyState = mongoose.connection.readyState;
  return {
    connected: readyState === 1,
    readyState,
    lastError,
  };
}

module.exports = { connectDb, dbStatus };
