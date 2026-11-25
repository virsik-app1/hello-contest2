// Turn a failed AI call into the message shown on the member card. The server
// already explains most failures in plain words (out of credit, key rejected,
// daily limit reached), so show that. Only a dropped connection, where the
// browser has no server message, gets a wording of our own.
const FALLBACK = "The AI analysis failed. Please try again.";

export function aiErrorText(err) {
  const msg = (err && typeof err.message === "string") ? err.message.trim() : "";
  if (!msg) return FALLBACK;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return "Couldn't reach the server. Check your internet connection and try again.";
  }
  return msg;
}
