import Anthropic from "@anthropic-ai/sdk";

// Resolves ANTHROPIC_API_KEY from the environment. Never hardcode a key.
export const anthropic = new Anthropic();

export const MODEL = process.env.BAGINDEX_MODEL || "claude-opus-5";
