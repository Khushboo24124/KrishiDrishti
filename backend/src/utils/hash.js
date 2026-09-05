// Per Phase 3 §9 / Team Execution risk table: hash or minimize identifiers
// used in the review workflow so reviewers never need farmer personal data.
const crypto = require("crypto");

/**
 * One-way hash for identifiers that must be linkable (same input -> same
 * hash) but not reversible. Not used for anything security-critical (e.g.
 * passwords) — only for keeping reviewer/farmer identity out of the review
 * surface while still letting the same person be recognized across records.
 */
function hashIdentifier(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = { hashIdentifier };
