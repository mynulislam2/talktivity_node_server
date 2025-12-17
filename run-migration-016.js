// One-off migration runner for making device_id nullable in device_speaking_sessions
// Usage: node run-migration-016.js

require("dotenv").config();
const db = require("./db");

async function main() {
  try {
    console.log("Running migration 016: drop NOT NULL on device_id...");
    await db.pool.query(
      "ALTER TABLE device_speaking_sessions ALTER COLUMN device_id DROP NOT NULL;"
    );
    console.log("✅ Migration 016 applied successfully.");
  } catch (err) {
    console.error("❌ Migration 016 failed:", err.message);
    process.exitCode = 1;
  } finally {
    // Let the shared pool be closed by gracefulShutdown if needed
  }
}

main();

