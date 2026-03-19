export async function syncShiftToGoogleSheets(shift) {
  const response = await fetch("https://script.google.com/macros/s/AKfycbw_aoGbvVnmc5p3CFLy0lQKhsrTTZDAOPq4-3yEFQoFtj0I27RaVSMh-Qko78Jitp0qoQ/exec", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      action: "saveShift",
      shift,
    }),
  });

  const text = await response.text();
  console.log("Apps Script raw response:", text);

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = { raw: text };
  }

  if (!response.ok || result.success === false) {
    throw new Error(result?.error || `HTTP ${response.status}`);
  }

  return result;
}