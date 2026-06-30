import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || loadDotEnv().PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || loadDotEnv().OPENAI_MODEL || "gpt-4.1";
const API_KEY = process.env.OPENAI_API_KEY || loadDotEnv().OPENAI_API_KEY || "";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const PUBLIC_EXTENSIONS = new Set([".html", ".css", ".js", ".json", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"]);
const COACH_VOCABULARY_DIR = path.join(__dirname, "coach_vocabulary");
const COACH_VOCABULARY_FILES = [
  "uber_terms.json",
  "driver_states.json",
  "coach_signals.json",
  "market_phrases.json",
  "multilingual_phrases.json",
  "common_misspellings.json",
  "real_driver_messages.json"
];
const REAL_DRIVER_MESSAGES_FILE = path.join(COACH_VOCABULARY_DIR, "real_driver_messages.json");
const MAX_REAL_DRIVER_MESSAGES = 200;

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

function loadCoachVocabulary() {
  return COACH_VOCABULARY_FILES.reduce((library, fileName) => {
    const filePath = path.join(COACH_VOCABULARY_DIR, fileName);
    const key = path.basename(fileName, ".json");

    try {
      library[key] = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
      console.warn(`Unable to load coach vocabulary ${fileName}:`, error.message);
      library[key] = {};
    }

    return library;
  }, {});
}

const COACH_VOCABULARY = loadCoachVocabulary();

function sanitiseDriverPhrase(value) {
  return String(value || "")
    .trim()
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:\+?44|0)\s?\d{2,4}\s?\d{3,4}\s?\d{3,4}\b/g, "[phone]")
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "[postcode]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function buildObservedMeaning(extracted = {}) {
  return {
    messageType: extracted.messageType || null,
    primaryEmotion: extracted.primaryEmotion || extracted.emotion || null,
    secondaryEmotion: extracted.secondaryEmotion || null,
    marketCondition: extracted.marketCondition || null,
    intent: extracted.intent || null,
    driverState: extracted.driverState || null,
    conversationPurpose: extracted.conversationPurpose || null,
    languageQuality: extracted.languageQuality || null,
    recommendedOutcome: extracted.recommendedOutcome || null,
    adviceConfidence: extracted.adviceConfidence || extracted.confidence || null,
    safetySignal: extracted.safetySignal || null,
    mentalFatigue: extracted.mentalFatigue || null,
    reassuranceNeed: extracted.reassuranceNeed || null,
    driverCapacity: extracted.driverCapacity || null
  };
}

function logRealDriverPhrase(driverNote, extracted = {}) {
  const message = sanitiseDriverPhrase(driverNote);
  if (message.length < 3) return;

  try {
    const current = JSON.parse(readFileSync(REAL_DRIVER_MESSAGES_FILE, "utf8"));
    const examples = Array.isArray(current.examples) ? current.examples : [];
    const normalised = message.toLowerCase();
    const existing = examples.find((entry) => String(entry.message || "").toLowerCase() === normalised);
    const now = new Date().toISOString();

    if (existing) {
      existing.count = Number(existing.count || 1) + 1;
      existing.lastSeen = now;
      existing.observedMeaning = buildObservedMeaning(extracted);
    } else {
      examples.unshift({
        message,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        observedMeaning: buildObservedMeaning(extracted)
      });
    }

    current.examples = examples.slice(0, MAX_REAL_DRIVER_MESSAGES);
    writeFileSync(REAL_DRIVER_MESSAGES_FILE, `${JSON.stringify(current, null, 2)}\n`);
    COACH_VOCABULARY.real_driver_messages = current;
  } catch (error) {
    console.warn("Unable to log real driver phrase:", error.message);
  }
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
    "Process the note through this coaching hierarchy: safety, driver wellbeing, driver intention, market conditions, financial goals, then ride analysis. Higher priorities override lower priorities.",
    "Infer meaning from natural language, poor spelling, shorthand, broken grammar, slang, and partial phrases. Do not require perfect grammar or exact wording.",
    "Use phraseLibrary as semantic examples and training context, not as a hard keyword dictionary. Infer similar meanings even when wording, spelling, grammar, background, or shorthand varies.",
    "Classify primaryEmotion and secondaryEmotion loosely as excitement, relief, frustration, fatigue, anxiety, demoralised, neutral, mixed, or unknown.",
    "Classify marketCondition loosely as strong, weak, quiet, normal, unknown, or mixed.",
    "Classify intent loosely as continue, pause, finish, split shift, reposition, review job, reflect, ask advice, or unknown.",
    "Classify driverState as fresh, steady, grinding, frustrated, fatigued, demoralised, ready_to_finish, unwell, unsafe_to_drive, or unknown.",
    "Classify conversationPurpose as decision, venting, celebration, reflection, companionship, reassurance, information, job_review, or unknown.",
    "Classify languageQuality as clear, short_note, broken_english, slang, mixed, unclear, or unknown.",
    "Classify recommendedOutcome as stay, move_area, take_break, finish_shift, or unknown.",
    "Classify adviceConfidence as high, medium, low, or unknown.",
    "Classify safetySignal as none, caution, stop_now, or unknown. Use stop_now for illness, dizziness, falling asleep, anger affecting judgement, inability to concentrate, or feeling unsafe.",
    "Classify mentalFatigue as none, mild, moderate, severe, or unknown. Treat head gone, fed up, cannot get rhythm, demoralised, not feeling it, or emotionally drained as mental fatigue even if the driver is physically able to drive.",
    "Classify reassuranceNeed as none, low, medium, high, or unknown. Use high when the driver appears to be seeking permission to stop, pause, lower expectations, or choose self-protection over the target.",
    "Classify driverCapacity as full, reduced, low, unsafe, or unknown. Capacity means the driver's practical ability to continue making calm driving decisions now.",
    "Also classify the messageType loosely as one of: ride decision, fatigue / wellbeing, positioning strategy, break / pause / resume, shift reflection, earnings concern, market conditions, success, general note.",
    "Not every message is about a ride. The driver may be tired, frustrated, taking a break, restarting, heading to an area, or asking whether to continue.",
    "Safety rule: if the driver says they are ill, dizzy, unwell, not safe, falling asleep, or similar, infer fatigue / wellbeing, intent finish or pause, driverState unwell or unsafe_to_drive, and conversationPurpose reassurance.",
    "Capacity rule: if driverCapacity is low or unsafe, or safetySignal is stop_now, safety and wellbeing override targets and ride analysis.",
    "Never ask for trip data unless the driver is clearly discussing a specific job, clearly seeking a review of that job, and critical information is missing.",
    "Use cueHints and recentConversation only as context, not as hard rules.",
    "If information is missing, use null. Never ask for strict formatting.",
    "Return JSON only with these keys:",
    "fare, pickupMiles, tripMiles, pickupLocation, dropoffLocation, action, context, messageType, emotion, primaryEmotion, secondaryEmotion, marketCondition, intent, driverState, conversationPurpose, languageQuality, recommendedOutcome, adviceConfidence, safetySignal, mentalFatigue, reassuranceNeed, driverCapacity, confidence, notes."
  ].join(" ");

  const text = await callOpenAi(systemText, {
    driverNote: payload.driverNote,
    phraseLibrary: COACH_VOCABULARY,
    cueHints: payload.cueHints,
    recentConversation: payload.recentConversation,
    shift: payload.shift,
    weekly: payload.weekly
  }, 240);

  return parseJsonObject(text);
}

async function buildCoachReply(payload, extracted, metrics) {
  const systemText = [
    "You are an experienced, calm and supportive Uber driver coach.",
    "Your purpose is not to maximise earnings. Your purpose is to help the driver make better decisions while protecting wellbeing, confidence, and long-term sustainability.",
    "Always follow this coaching hierarchy: safety, driver wellbeing, driver intention, market conditions, financial goals, then ride analysis. Higher priorities override lower priorities.",
    "You are a general shift companion for someone working Uber: weather, traffic, fatigue, frustration, low fares, strong work, quiet patches, positioning, breaks, and motivation are all valid topics.",
    "Ride or job reviews are only one possible conversation type. Do not force every message into ride analysis.",
    "Do not advise on live Uber offers in real time; keep replies calm, post-message, and focused on decision support.",
    "Use the provided shift data, weekly target data, driver note, extracted job details and calculated job metrics only when they genuinely help the conversation.",
    "If some information is missing, review the decision using whatever information is available. Never ask for strict formatting.",
    "Never ask for trip data unless all of these are true: the driver is clearly discussing a specific job, the driver is seeking a review of that job, and critical information is missing. Otherwise respond naturally.",
    "Do not assume every note requires tactical ride analysis. Sometimes the right response is encouragement, a reset, or a suggestion to take 20 minutes, eat, then reassess.",
    "Infer emotion, market condition, and intent from the driver's natural wording and recent conversation. Do not behave like a keyword dictionary.",
    "Use extracted driverState, conversationPurpose, and languageQuality to adapt the reply. Do not penalise broken English, shorthand, slang, or poor spelling.",
    "Use safetySignal, mentalFatigue, reassuranceNeed, and driverCapacity as the strongest indicators of what the driver needs emotionally and practically.",
    "If driverState is unwell or unsafe_to_drive, safetySignal is stop_now, or driverCapacity is low/unsafe, prioritise safety above targets: recommend stopping, resting, and only restarting when safe.",
    "If reassuranceNeed is high, give the driver calm permission to protect energy, pause, finish, or lower expectations. Do not bury that reassurance under target maths.",
    "If mentalFatigue is moderate or severe, focus on energy, frustration, judgement, and the next simple decision rather than detailed forecasting.",
    "Cue hints are training wheels only. They may help you notice tone, but they must not force a canned response.",
    "Mirror the driver's emotional temperature before analysing numbers. Positive relief or excitement should receive matching energy. Frustration, fatigue, or a weak market should receive empathy and reassurance first.",
    "The coach should feel like another experienced driver in the passenger seat. The numbers support the conversation; they should not dominate emotional moments.",
    "The driver's stated intention overrides the forecast. If they mention going home, coming back later, taking a break, being tired or hungry, not feeling it, poor jobs, low offers, or an empty radar, switch to energy mode.",
    "In energy mode, suppress hours remaining, target deficit, productive-hours estimates, and current-pace calculations. Talk about preserving energy, split shifts, market conditions, reassessing later, and not forcing weak work.",
    "Never quote extreme hours estimates. If the math implies an unrealistic number of hours, say the current pace is not representative and suggest reassessing after the next meaningful checkpoint.",
    "When not in energy mode, focus on the driver's actual question first. Use job efficiency, pickup miles, destination quality, positioning, current pace and target remaining only when relevant.",
    "Speak like an experienced Uber driver, not a report. Avoid sounding like a spreadsheet.",
    "Prioritise one clear decision: stay, move area, finish shift, or take a break.",
    "If confidence is low, say so naturally and suggest a short reassessment window instead of pretending the numbers are certain.",
    "Mention only the one or two metrics that directly support the advice. Do not list every metric.",
    "Avoid repeating the same wording as recentConversation. Vary the phrasing while keeping the same calm personality.",
    "Respect driver autonomy. Prefer phrases like I'd probably, sounds reasonable, or might be worth. Avoid judgmental or commanding language like you should.",
    "Use phrases like fair enough, reasonable decision, no harm in passing, keep an eye on it, see what the next area brings, reassess after the next checkpoint, no need to overthink it, momentum matters on quieter days, and better opportunities may come.",
    "Avoid analytical labels, spreadsheet-style grading terms, and examiner language.",
    "The driver is reviewing decisions after the event, not being marked.",
    "Use encouraging, conversational language. If a decision is understandable, say so.",
    "Focus on context and positioning, not just mathematics.",
    "Reply in a conversational 2-3 sentences. No bullet lists. Maximum 70 words."
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
    logRealDriverPhrase(payload.driverNote, extracted);
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
