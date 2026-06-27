import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || loadDotEnv().PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || loadDotEnv().OPENAI_MODEL || "gpt-4.1";
const API_KEY = process.env.OPENAI_API_KEY || loadDotEnv().OPENAI_API_KEY || "";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const PUBLIC_EXTENSIONS = new Set([".html", ".css", ".js", ".json", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"]);

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return {};

  return readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const index = trimmed.indexOf("=");
      if (index === -1) return acc;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      acc[key] = value;
      return acc;
    }, {});
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5500",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  response.end(JSON.stringify(body));
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".webp") return "image/webp";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function getOutputText(openAiResponse) {
  if (typeof openAiResponse.output_text === "string") return openAiResponse.output_text.trim();

  const chunks = [];
  for (const item of openAiResponse.output || []) {
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text) chunks.push(part.text);
    }
  }

  return chunks.join("\n").trim();
}

function buildOpenAiInput(systemText, payload) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: systemText
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify(payload, null, 2)
        }
      ]
    }
  ];
}

async function callOpenAi(systemText, payload, maxOutputTokens = 180) {
  const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input: buildOpenAiInput(systemText, payload),
      max_output_tokens: maxOutputTokens
    })
  });

  const data = await openAiResponse.json().catch(() => ({}));
  if (!openAiResponse.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  return getOutputText(data);
}

function parseJsonObject(text) {
  const raw = String(text || "").trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return {};

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return {};
  }
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calculateJobMetrics(extracted = {}) {
  const fare = toFiniteNumber(extracted.fare);
  const pickupMiles = toFiniteNumber(extracted.pickupMiles);
  const tripMiles = toFiniteNumber(extracted.tripMiles);
  const totalMiles = pickupMiles !== null && tripMiles !== null
    ? pickupMiles + tripMiles
    : null;
  const poundsPerTripMile = fare !== null && tripMiles > 0
    ? fare / tripMiles
    : null;
  const poundsPerTotalMile = fare !== null && totalMiles > 0
    ? fare / totalMiles
    : null;

  return {
    fare,
    pickupMiles,
    tripMiles,
    totalMiles,
    poundsPerTripMile,
    poundsPerTotalMile
  };
}

function roundMetric(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

async function extractCoachFacts(payload) {
  const systemText = [
    "Extract any fare, pickup miles, trip miles, pickup location, drop-off location, job action and context from the driver's note.",
    "Infer the driver's emotion, market condition, and intent from natural language. Do not rely only on exact keywords.",
    "Classify emotion loosely as excitement, relief, frustration, fatigue, neutral, or mixed.",
    "Classify marketCondition loosely as strong, weak, quiet, normal, unknown, or mixed.",
    "Classify intent loosely as continue, pause, finish, split shift, reposition, review job, reflect, ask advice, or unknown.",
    "Also classify the messageType loosely as one of: ride decision, fatigue / wellbeing, positioning strategy, break / pause / resume, shift reflection, earnings concern, market conditions, success, general note.",
    "Not every message is about a ride. The driver may be tired, frustrated, taking a break, restarting, heading to an area, or asking whether to continue.",
    "Never ask for trip data unless the driver is clearly discussing a specific job, clearly seeking a review of that job, and critical information is missing.",
    "Use cueHints and recentConversation only as context, not as hard rules.",
    "If information is missing, use null. Never ask for strict formatting.",
    "Return JSON only with these keys:",
    "fare, pickupMiles, tripMiles, pickupLocation, dropoffLocation, action, context, messageType, emotion, marketCondition, intent, confidence, notes."
  ].join(" ");

  const text = await callOpenAi(systemText, {
    driverNote: payload.driverNote,
    cueHints: payload.cueHints,
    recentConversation: payload.recentConversation,
    shift: payload.shift,
    weekly: payload.weekly
  }, 160);

  return parseJsonObject(text);
}

async function buildCoachReply(payload, extracted, metrics) {
  const systemText = [
    "You are an experienced, calm and supportive Uber driver coach.",
    "This is post-event coaching only. You are reviewing jobs already accepted, declined, completed, or manually logged by the driver.",
    "Do not advise on live Uber offers in real time.",
    "Use the provided shift data, weekly target data, driver note, extracted job details and calculated job metrics.",
    "If some information is missing, review the decision using whatever information is available. Never ask for strict formatting.",
    "Never ask for trip data unless all of these are true: the driver is clearly discussing a specific job, the driver is seeking a review of that job, and critical information is missing. Otherwise respond naturally.",
    "Do not assume every note requires tactical ride analysis. Sometimes the right response is encouragement, a reset, or a suggestion to take 20 minutes, eat, then reassess.",
    "Infer emotion, market condition, and intent from the driver's natural wording and recent conversation. Do not behave like a keyword dictionary.",
    "Cue hints are training wheels only. They may help you notice tone, but they must not force a canned response.",
    "Mirror the driver's emotional temperature before analysing numbers. Positive relief or excitement should receive matching energy. Frustration, fatigue, or a weak market should receive empathy and reassurance first.",
    "The coach should feel like another experienced driver in the passenger seat. The numbers support the conversation; they should not dominate emotional moments.",
    "The driver's stated intention overrides the forecast. If they mention going home, coming back later, taking a break, being tired or hungry, not feeling it, poor jobs, low offers, or an empty radar, switch to energy mode.",
    "In energy mode, suppress hours remaining, target deficit, productive-hours estimates, and current-pace calculations. Talk about preserving energy, split shifts, market conditions, reassessing later, and not forcing weak work.",
    "Never quote extreme hours estimates. If the math implies an unrealistic number of hours, say the current pace is not representative and suggest reassessing after the next meaningful checkpoint.",
    "When not in energy mode, focus on job efficiency, pickup miles, total working miles, destination quality, dead miles, positioning, current pace and target remaining.",
    "Speak like an experienced Uber driver, not a report. Avoid sounding like a spreadsheet.",
    "Use phrases like fair enough, reasonable decision, no harm in passing, keep an eye on it, see what the next area brings, reassess after the next checkpoint, no need to overthink it, momentum matters on quieter days, and better opportunities may come.",
    "Avoid analytical labels, spreadsheet-style grading terms, and examiner language.",
    "The driver is reviewing decisions after the event, not being marked.",
    "Use encouraging, conversational language. If a decision is understandable, say so.",
    "Focus on context and positioning, not just mathematics.",
    "Reply in 1 short paragraph or 2-4 short bullets. Maximum 80 words."
  ].join(" ");

  return callOpenAi(systemText, {
    ...payload,
    extractedJob: extracted,
    calculatedJob: {
      ...metrics,
      poundsPerTripMile: roundMetric(metrics.poundsPerTripMile),
      poundsPerTotalMile: roundMetric(metrics.poundsPerTotalMile)
    }
  }, 180);
}

async function handleCoach(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Use POST /api/coach" });
    return;
  }

  if (!API_KEY) {
    sendJson(response, 503, {
      error: "OPENAI_API_KEY is not configured on the backend."
    });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const extracted = await extractCoachFacts(payload);
    const metrics = calculateJobMetrics(extracted);
    const coachReply = await buildCoachReply(payload, extracted, metrics);

    sendJson(response, 200, {
      coachReply: coachReply || "Coach response was empty. Try asking again with the job note and shift context.",
      extractedJob: extracted,
      calculatedJob: {
        ...metrics,
        poundsPerTripMile: roundMetric(metrics.poundsPerTripMile),
        poundsPerTotalMile: roundMetric(metrics.poundsPerTotalMile)
      },
      model: MODEL
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || "Coach backend failed."
    });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = path.normalize(path.join(__dirname, pathname));

  if (!safePath.startsWith(__dirname) || !PUBLIC_EXTENSIONS.has(path.extname(safePath).toLowerCase())) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const file = await readFile(safePath);
    response.writeHead(200, {
      "Content-Type": getContentType(safePath),
      "Cache-Control": "no-store"
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/coach")) {
    handleCoach(request, response);
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`Uber Engine running at http://127.0.0.1:${PORT}`);
  console.log(API_KEY ? "Coach API enabled." : "Coach API disabled: set OPENAI_API_KEY in .env.");
});
