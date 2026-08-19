import { ChatOpenAI } from '@langchain/openai';
import { COMET_API_KEY, COMET_BASE_URL, LLM_MODEL } from '../config.js';

const MAX_TOKENS = 4096;

// Without an explicit timeout the OpenAI client waits 10 minutes per request, so a hung
// CometAPI call looks like a frozen run. Fail fast and retry a bounded number of times.
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;

/**
 * The chat model for the agent. CometAPI is an OpenAI-compatible gateway that exposes
 * Claude models, so we use ChatOpenAI pointed at its baseURL. ChatOpenAI defaults to the
 * chat-completions API (`useResponsesApi` is false), which is what CometAPI supports.
 */
export function createModel(): ChatOpenAI {
  return new ChatOpenAI({
    model: LLM_MODEL,
    apiKey: COMET_API_KEY,
    maxTokens: MAX_TOKENS,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    configuration: { baseURL: COMET_BASE_URL },
  });
}
