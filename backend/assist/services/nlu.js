// assist/services/nlu.js

export async function detectIntent(utterance = "") {
  const t = (utterance || "").toLowerCase().trim();

  // ----- existing: add account -----
  if (/\b(add|create|new)\b.*\b(account|bank|card)\b/.test(t)) return "add_account";
  if (/\b(bank|card)\b.*\baccount\b/.test(t)) return "add_account";

  // ----- new: add day-to-day expense / expense / dtd -----
  if (
    // explicit "dtd/day to day" + expense
    /\b(dtd|day\s*to\s*day)\b.*\b(expense|expenses)\b/.test(t) ||
    /\b(expense|expenses)\b.*\b(dtd|day\s*to\s*day)\b/.test(t) ||

    // generic verbs + expense keywords
    /\b(add|create|new|log|record|track|note|save)\b.*\b(expense|expenses|spend|spent|purchase|payment|cost|bill|charge)\b/.test(t) ||
    /\b(expense|expenses|spend|spent|purchase|payment|cost|bill|charge)\b.*\b(add|create|new|log|record|track|note|save)\b/.test(t) ||

    // natural spend phrases with an amount
    /\b(spent|paid|bought)\b.*\b\d/.test(t)
  ) {
    return "add_transaction";
  }

  return null;
}
