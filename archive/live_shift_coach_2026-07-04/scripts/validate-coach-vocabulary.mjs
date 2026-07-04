import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const vocabularyDir = path.join(rootDir, "coach_vocabulary");
const requiredFiles = [
  "uber_terms.json",
  "driver_states.json",
  "coach_signals.json",
  "market_phrases.json",
  "multilingual_phrases.json",
  "common_misspellings.json",
  "real_driver_messages.json"
];
const piiPatterns = [
  { name: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { name: "UK phone", pattern: /\b(?:\+?44|0)\s?\d{2,4}\s?\d{3,4}\s?\d{3,4}\b/ },
  { name: "UK postcode", pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i }
];

function fail(message) {
  throw new Error(message);
}

function readJson(fileName) {
  const filePath = path.join(vocabularyDir, fileName);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${fileName} is not valid JSON: ${error.message}`);
  }
}

function walkStrings(value, visitor) {
  if (typeof value === "string") {
    visitor(value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => walkStrings(item, visitor));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => walkStrings(item, visitor));
  }
}

function validateNoObviousPii(fileName, data) {
  walkStrings(data, (text) => {
    for (const { name, pattern } of piiPatterns) {
      if (pattern.test(text)) {
        fail(`${fileName} contains possible ${name}: "${text}"`);
      }
    }
  });
}

function validateRealDriverMessages(data) {
  if (!Array.isArray(data.examples)) {
    fail("real_driver_messages.json must contain an examples array.");
  }

  const seen = new Set();
  data.examples.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      fail(`real_driver_messages.json example ${index + 1} must be an object.`);
    }
    if (typeof entry.message !== "string" || entry.message.trim().length < 3) {
      fail(`real_driver_messages.json example ${index + 1} needs a message of at least 3 characters.`);
    }
    if (entry.message.length > 240) {
      fail(`real_driver_messages.json example ${index + 1} is longer than 240 characters.`);
    }

    const normalised = entry.message.trim().toLowerCase();
    if (seen.has(normalised)) {
      fail(`real_driver_messages.json contains duplicate message: "${entry.message}"`);
    }
    seen.add(normalised);
  });
}

const availableFiles = new Set(readdirSync(vocabularyDir));
requiredFiles.forEach((fileName) => {
  if (!availableFiles.has(fileName)) fail(`Missing required vocabulary file: ${fileName}`);
});

requiredFiles.forEach((fileName) => {
  const data = readJson(fileName);
  if (typeof data.description !== "string" || !data.description.trim()) {
    fail(`${fileName} must include a description.`);
  }
  validateNoObviousPii(fileName, data);
  if (fileName === "real_driver_messages.json") validateRealDriverMessages(data);
  console.log(`${fileName} ok`);
});

console.log("Coach vocabulary validation passed.");
