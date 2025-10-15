// assist/services/openaiClient.js
import OpenAI from "openai";
import "dotenv/config";

let _client = null;
export function getOpenAI() {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  _client = new OpenAI({ apiKey: key });
  return _client;
}
