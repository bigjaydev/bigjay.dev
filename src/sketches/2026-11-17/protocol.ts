export const MODEL_REPO = "LiquidAI/LFM2.5-350M-GGUF";
export const MODEL_FILE = "LFM2.5-350M-Q4_K_M.gguf";
export const MODEL_NAME = "LFM2.5-350M";
export const DOWNLOAD_LABEL = "230 MB";

export function loadFailure(message: string): string {
	const lower = message.toLowerCase();
	if (lower.includes("fetch") || lower.includes("network") || lower.includes("failed to load")) {
		return "The download stopped.";
	}
	if (lower.includes("timeout")) return "The model took too long.";
	if (lower.includes("arch") || lower.includes("unknown model")) {
		return "This browser could not read the model.";
	}
	return "The model did not start.";
}
