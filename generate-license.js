#!/usr/bin/env node
/**
 * License Key Generator
 * Usage: npm run generate-license
 *   or: node generate-license.js [--count 5] [--secret your-secret]
 */

const crypto = require("crypto");

// Must match the values in license.js
const ENCRYPTION_ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = crypto.scryptSync("linkedin-bot-license-key", "salt", 32);

// Override signing secret via CLI arg or env; must match what validation uses
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaultValue;
}

const SIGNING_SECRET = getArg("--secret", process.env.LICENSE_SECRET || "admin-secret-key-from-env");
const COUNT = parseInt(getArg("--count", "1"), 10);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf-8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function generateLicense() {
  const timestamp = Date.now();
  // Empty computer IDs = not yet bound to a machine (binding happens on first activation)
  const licenseData = `license:${timestamp}::`;

  const signature = crypto
    .createHmac("sha256", SIGNING_SECRET)
    .update(licenseData)
    .digest("hex")
    .substring(0, 12);

  const raw = `${licenseData}:${signature}`;
  return encrypt(raw);
}

console.log(`\nGenerating ${COUNT} license key(s)...\n`);
for (let i = 0; i < COUNT; i++) {
  console.log(generateLicense());
}
console.log();
