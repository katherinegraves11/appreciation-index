import Anthropic from "@anthropic-ai/sdk";

// Resolves ANTHROPIC_API_KEY from the environment. Never hardcode a key.
export const anthropic = new Anthropic();

export const MODEL = process.env.BAGINDEX_MODEL || "claude-opus-5";

// Evidence gathering runs on the fast model; the verdict (scoring) stays on MODEL.
export const RESEARCH_MODEL = process.env.BAGINDEX_RESEARCH_MODEL || "claude-sonnet-5";
