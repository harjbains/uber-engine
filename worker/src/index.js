export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env)
      });
    }

    if (url.pathname !== "/training-trip") {
      return jsonResponse({ error: "Not found" }, 404, env);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST /training-trip" }, 405, env);
    }

    try {
      const input = await request.json();
      const context = normaliseTrainingInput(input);

      if (!context.currentPostcode) {
        return jsonResponse({ error: "currentPostcode is required" }, 400, env);
      }

      if (!env.OPENAI_API_KEY) {
        return jsonResponse({ error: "OPENAI_API_KEY is not configured" }, 500, env);
      }

      const trip = await generateTrainingTrip(context, env);
      const finalTrip = addComputedMetrics(trip, context);

      return jsonResponse(finalTrip, 200, env);
    } catch (error) {
      console.error("Training trip error", error);

      return jsonResponse(
        {
          error: "Could not generate training trip",
          detail: error?.message || String(error)
        },
        500,
        env
      );
    }
  }
};

async function generateTrainingTrip(context, env) {
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  const apiKey = String(env.OPENAI_API_KEY || "")
  .trim()
  .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
  .replace(/^Bearer\s+/i, "")
  .replace(/^["'`]+|["'`]+$/g, "")
  .trim();

if (!apiKey.startsWith("sk-")) {
  throw new Error(
    `OPENAI_API_KEY looks invalid. It should start with sk-. Detected start: ${apiKey.slice(0, 4) || "empty"}`
  );
}

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: buildInstructions()
      },
      {
        role: "user",
        content: buildUserInput(context)
      }
    ],
    response_format: {
      type: "json_object"
    }
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const responseText = await response.text();

  if (!responseText) {
    throw new Error(
      `OpenAI returned an empty response. Status: ${response.status}. Headers: ${JSON.stringify(
        Object.fromEntries(response.headers)
      )}`
    );
  }

  let data;

  try {
    data = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      `OpenAI returned non-JSON. Status: ${response.status}. Body: ${responseText.slice(0, 1000)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `OpenAI error ${response.status}: ${JSON.stringify(data).slice(0, 1200)}`
    );
  }

  const outputText = data?.choices?.[0]?.message?.content?.trim();

  if (!outputText) {
    throw new Error(
      `OpenAI response did not contain message content: ${JSON.stringify(data).slice(0, 1200)}`
    );
  }

  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new Error(
      `Model returned invalid JSON: ${error.message}. Output: ${outputText.slice(0, 1000)}`
    );
  }
}

function buildInstructions() {
  return `
You generate realistic Uber driver training scenarios for a Wolverhampton private hire driver learning Birmingham.

Return exactly one valid JSON object only. Do not use markdown, comments, explanations, or code fences.

The output must include:
- pickup.outcode
- pickup.area
- pickup.label
- pickup.milesAway
- pickup.minutesAway
- trip.miles
- trip.minutes
- trip.dropoffOutcode
- trip.dropoffArea
- trip.dropoffLabel

The card should be able to display:
"3 mins (1.2 mi) away"
"WV6, Compton"
"5.5 mi / 15 mins trip"
"B1, New Street Station / City Centre"

The JSON object must use this structure:

{
  "scenarioId": "string",
  "fare": number,
  "currency": "GBP",
  "passengerRating": number,
  "pickup": {
    "outcode": "string",
    "area": "string",
    "label": "string",
    "milesAway": number,
    "minutesAway": integer
  },
  "trip": {
    "miles": number,
    "minutes": integer,
    "dropoffOutcode": "string",
    "dropoffArea": "string",
    "dropoffLabel": "string"
  },
  "decision": {
    "recommended": "Take" | "Pass" | "Situational",
    "dropoffRating": "Green" | "Amber" | "Red" | "Green/Amber" | "Amber/Red",
    "reasoning": "string",
    "afterDropoffPlan": "string",
    "challengeQuestion": "string"
  },
  "learning": {
    "postcodeLesson": "string",
    "focusSkill": "string"
  }
}

Driver profile and strategy:
- Base area: Wolverhampton.
- The driver wants to improve fast Take/Pass decision-making.
- The driver tends to give up too quickly in quiet periods, so scenarios should train staying in the game without accepting poor jobs.
- Birmingham reset is normally only considered after 20:00, once traffic has eased.
- Judge jobs using total pickup + trip miles, total pickup + trip time, £/mile, £/hour, traffic risk and post-drop positioning.
- Avoid romanticising big fares; airport jobs and long mileage jobs must be challenged if the return/positioning is weak.
- Use realistic UK private hire/Uber-style figures: fares in GBP, passenger ratings 4.60 to 5.00, pickup usually 0.3 to 3.5 miles, trip usually 1 to 35 miles.

Location realism rules:
- The pickup must normally be close to the currentPostcode supplied by the user.
- If currentPostcode starts with WV, pickup should usually be WV1, WV2, WV3, WV4, WV6 or a named nearby area such as Compton, Penn, Chapel Ash, Tettenhall, Bilston, Wednesfield or New Cross.
- Do not generate a Birmingham pickup when currentPostcode is Wolverhampton unless the scenario explicitly says the driver has already repositioned.
- If creating a Birmingham reset scenario from Wolverhampton, the pickup must still be near Wolverhampton and the drop-off should be a Birmingham or Black Country outcode.
- Always include a useful pickup outcode and drop-off outcode.
- Pickup label should be a recognisable local area or landmark.
- Drop-off label should be a recognisable local area, station, hospital, nightlife area or landmark.
- Trip distance and trip minutes must feel consistent with each other.
- Pickup miles and pickup minutes must feel consistent with each other.
- For beginner mode, avoid weird geography and make the route easy to understand.

Commercial area guide:
- WV1/WV2/WV3/WV4/WV6: Wolverhampton core and nearby working area.
- Walsall / Willenhall / Darlaston: situational; can become drift if low fare.
- B1: Birmingham City Centre; demand can be strong but traffic, restrictions and pickups can be awkward.
- B3: Colmore / Jewellery Quarter edge; useful but central complexity.
- B5: Southside / Digbeth; busy but traffic/pickup traps.
- B6/B7: Aston / Nechells; amber, depends on time and flow.
- B8/B9/B10/B11/B12: east/inner Birmingham; often amber, watch traffic and whether it pulls away from target zones.
- B13/B14/B17/B29/B30: south/south-west Birmingham; often workable but context matters.
- B15/B16: Edgbaston / Five Ways / Hagley Road side; often useful for Birmingham reset, green/amber.
- B18/B19/B20/B21: north-west / inner north; amber, depends on night flow and roads.
- B23/B24: Erdington / Tyburn; amber/situational.
- B25/B26/B27/B28: Yardley / Sheldon / Acocks Green / Hall Green; situational, can pull east/south-east.
- B31/B32/B45: Northfield / Quinton / Rubery; can become outer-zone amber/red unless fare is strong.
- B42/B43/B44: Perry Barr / Great Barr / Kingstanding; amber, can link back towards M6/Walsall/Wolves.
- B66/B67: Smethwick / Bearwood; amber/green depending on time, useful corridor between Birmingham and Black Country.
- B68/B69: Oldbury / Tividale; amber, not terrible but needs a post-drop plan.

Difficulty rules:
- beginner: make the learning point clear; do not make the numbers too marginal.
- intermediate: include one trade-off, such as good fare but awkward drop-off, or low fare but strong positioning.
- pressure: make it marginal and realistic; include time/traffic/positioning tension.

Do not claim access to live Uber data. These are synthetic training scenarios.
`;
}

function buildUserInput(context) {
  return JSON.stringify(
    {
      task: "Generate one realistic synthetic Uber training job offer.",
      currentContext: context,
      outputGuidance: {
        pickupShouldBeNearCurrentPostcode: true,
        includePostcodeLesson: true,
        includeAfterDropoffPlan: true,
        includeChallengeQuestion: true
      }
    },
    null,
    2
  );
}

function trainingTripSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      scenarioId: {
        type: "string"
      },
      fare: {
        type: "number"
      },
      currency: {
        type: "string",
        enum: ["GBP"]
      },
      passengerRating: {
        type: "number"
      },
      pickup: {
        type: "object",
        additionalProperties: false,
        properties: {
          outcode: {
            type: "string"
          },
          area: {
            type: "string"
          },
          label: {
            type: "string"
          },
          milesAway: {
            type: "number"
          },
          minutesAway: {
            type: "integer"
          }
        },
        required: ["outcode", "area", "label", "milesAway", "minutesAway"]
      },
      trip: {
        type: "object",
        additionalProperties: false,
        properties: {
          miles: {
            type: "number"
          },
          minutes: {
            type: "integer"
          },
          dropoffOutcode: {
            type: "string"
          },
          dropoffArea: {
            type: "string"
          },
          dropoffLabel: {
            type: "string"
          }
        },
        required: ["miles", "minutes", "dropoffOutcode", "dropoffArea", "dropoffLabel"]
      },
      decision: {
        type: "object",
        additionalProperties: false,
        properties: {
          recommended: {
            type: "string",
            enum: ["Take", "Pass", "Situational"]
          },
          dropoffRating: {
            type: "string",
            enum: ["Green", "Amber", "Red", "Green/Amber", "Amber/Red"]
          },
          reasoning: {
            type: "string"
          },
          afterDropoffPlan: {
            type: "string"
          },
          challengeQuestion: {
            type: "string"
          }
        },
        required: [
          "recommended",
          "dropoffRating",
          "reasoning",
          "afterDropoffPlan",
          "challengeQuestion"
        ]
      },
      learning: {
        type: "object",
        additionalProperties: false,
        properties: {
          postcodeLesson: {
            type: "string"
          },
          focusSkill: {
            type: "string"
          }
        },
        required: ["postcodeLesson", "focusSkill"]
      }
    },
    required: [
      "scenarioId",
      "fare",
      "currency",
      "passengerRating",
      "pickup",
      "trip",
      "decision",
      "learning"
    ]
  };
}

function addComputedMetrics(trip, context) {
  const fare = number(trip.fare);
  const pickupMiles = number(trip.pickup?.milesAway);
  const tripMiles = number(trip.trip?.miles);
  const pickupMinutes = integer(trip.pickup?.minutesAway);
  const tripMinutes = integer(trip.trip?.minutes);

  const totalMiles = round1(pickupMiles + tripMiles);
  const totalMinutes = pickupMinutes + tripMinutes;
  const grossPerMile = totalMiles > 0 ? round2(fare / totalMiles) : 0;
  const grossPerHour = totalMinutes > 0 ? round2(fare / (totalMinutes / 60)) : 0;

  return {
    source: "api",
    ...trip,
    fare: round2(fare),
    passengerRating: round2(number(trip.passengerRating)),
    pickup: {
      ...trip.pickup,
      outcode: normaliseOutcode(trip.pickup?.outcode),
      milesAway: round1(pickupMiles),
      minutesAway: pickupMinutes
    },
    trip: {
      ...trip.trip,
      miles: round1(tripMiles),
      minutes: tripMinutes,
      dropoffOutcode: normaliseOutcode(trip.trip?.dropoffOutcode)
    },
    context,
    metrics: {
      totalMiles,
      totalMinutes,
      grossPerMile,
      grossPerHour
    }
  };
}

function normaliseTrainingInput(input) {
  const now = new Date();

  const currentPostcode = normaliseOutcode(
    input?.currentPostcode || input?.postcode || ""
  );

  return {
    currentPostcode,
    localTime: safeString(input?.localTime) || now.toISOString().slice(11, 16),
    dayOfWeek: safeString(input?.dayOfWeek) || "Unknown",
    date: safeString(input?.date) || now.toISOString().slice(0, 10),
    timezone: safeString(input?.timezone) || "Europe/London",
    mode: safeEnum(
      input?.mode,
      ["morning", "evening", "friday_saturday_night", "quiet_shift", "full_shift"],
      "evening"
    ),
    difficulty: safeEnum(
      input?.difficulty,
      ["beginner", "intermediate", "pressure"],
      "beginner"
    ),
    targetGross: nullableNumber(input?.targetGross),
    currentGross: nullableNumber(input?.currentGross)
  };
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const pieces = [];

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        pieces.push(content.text);
      }
    }
  }

  return pieces.join("").trim();
}

function jsonResponse(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(env),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function normaliseOutcode(value) {
  const cleaned = safeString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const firstPart = cleaned.split(" ")[0];
  const compact = cleaned.replace(/\s/g, "");

  if (/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(firstPart)) {
    return firstPart;
  }

  const outwardMatch = compact.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);

  return outwardMatch ? outwardMatch[1] : firstPart;
}

function safeString(value) {
  return String(value ?? "").trim().slice(0, 120);
}

function safeEnum(value, allowed, fallback) {
  const text = safeString(value);
  return allowed.includes(text) ? text : fallback;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

function round1(value) {
  return Math.round(number(value) * 10) / 10;
}

function round2(value) {
  return Math.round(number(value) * 100) / 100;
}