import { type LLMProvider } from "./types.js";
import { type Config } from "../utils/config.js";
import { DeepSeekProvider } from "./deepseek.js";

export function createProvider(config: Config): LLMProvider {
  switch (config.provider) {
    case "deepseek":
      return new DeepSeekProvider(config);
    case "openai":
      // Use DeepSeek-compatible API for OpenAI too (just swap env vars/model)
      throw new Error(
        "OpenAI provider not yet implemented. Set provider: 'deepseek' in config.",
      );
    case "anthropic":
      throw new Error(
        "Anthropic provider not yet implemented. Set provider: 'deepseek' in config.",
      );
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
