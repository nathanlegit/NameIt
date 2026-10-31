// Shared setup for every Meta Model API call.
// Verified 30 Oct 2026 against https://dev.meta.ai/docs/quickstart and the cookbook:
// - base URL https://api.meta.ai/v1
// - auth header "Authorization: Bearer <MODEL_API_KEY>"
// - the API is OpenAI-SDK compatible, but the SDK does NOT read MODEL_API_KEY by itself,
//   so we pass it explicitly.

import { existsSync } from "node:fs";
import OpenAI from "openai";

const DEFAULT_BASE_URL = "https://api.meta.ai/v1";

// Loads .env.local into process.env if it exists. Node 24 has this built in,
// so we don't need the dotenv package.
export function loadLocalEnv(): void {
  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
}

export function getBaseUrl(): string {
  return process.env.MODEL_API_BASE_URL || DEFAULT_BASE_URL;
}

export function requireApiKey(): string {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MODEL_API_KEY is not set. Copy .env.example to .env.local and paste your key from https://dev.meta.ai/ (API keys).",
    );
  }
  return apiKey;
}

let cachedClient: OpenAI | null = null;

export function metaClient(): OpenAI {
  if (cachedClient === null) {
    cachedClient = new OpenAI({ baseURL: getBaseUrl(), apiKey: requireApiKey() });
  }
  return cachedClient;
}
