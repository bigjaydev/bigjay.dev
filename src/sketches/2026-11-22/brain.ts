import { Wllama } from "@wllama/wllama";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import { TOOL_DEFS, type ToolCall } from "./tools";

export const MODEL_REPO = "LiquidAI/LFM2.5-350M-GGUF";
export const MODEL_FILE = "LFM2.5-350M-Q4_K_M.gguf";
export const MODEL_LABEL = "LFM2.5-350M · ~230 MB local";

const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/${MODEL_FILE}`;

export type ChatTurn = {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	tool_call_id?: string;
};

export type BrainStatus = "idle" | "loading" | "ready" | "thinking" | "error";
export type LoadPhase = "download" | "cache" | "init";

let client: Wllama | null = null;
let loadPromise: Promise<{ fromCache: boolean }> | null = null;

export function isBrainReady(): boolean {
	return Boolean(client?.isModelLoaded());
}

async function isModelCached(wllama: Wllama): Promise<boolean> {
	const name = await wllama.cacheManager.getNameFromURL(MODEL_URL);
	const size = await wllama.cacheManager.getSize(name);
	if (size <= 0) {
		const byUrl = await wllama.cacheManager.open(MODEL_URL);
		return Boolean(byUrl && byUrl.size > 1_000_000);
	}
	const meta = await wllama.cacheManager.getMetadata(name);
	if (!meta?.originalSize) return size > 1_000_000;
	return size >= meta.originalSize * 0.98;
}

/** Auto-loads the GGUF once; wllama OPFS cache keeps later visits offline-fast. */
export async function loadBrain(
	onProgress: (pct: number, phase: LoadPhase) => void = () => undefined,
): Promise<{ fromCache: boolean }> {
	if (client?.isModelLoaded()) {
		onProgress(100, "cache");
		return { fromCache: true };
	}
	if (loadPromise) return loadPromise;

	loadPromise = (async () => {
		const wllama = new Wllama(
			{ default: wasmUrl },
			{ suppressNativeLog: true, allowOffline: true },
		);
		try {
			const fromCache = await isModelCached(wllama);
			onProgress(fromCache ? 8 : 0, fromCache ? "cache" : "download");

			await wllama.loadModelFromUrl(MODEL_URL, {
				useCache: true,
				n_ctx: 2048,
				n_batch: 256,
				n_threads: Math.min(4, navigator.hardwareConcurrency || 2),
				progressCallback: ({ loaded, total }) => {
					if (!total) return;
					onProgress(Math.min(99, Math.round((loaded / total) * 100)), fromCache ? "cache" : "download");
				},
			});
			onProgress(100, "init");
			client = wllama;
			return { fromCache };
		} catch (error) {
			await wllama.exit().catch(() => undefined);
			client = null;
			loadPromise = null;
			throw error;
		}
	})();

	return loadPromise;
}

export async function unloadBrain(): Promise<void> {
	if (!client) return;
	await client.exit().catch(() => undefined);
	client = null;
}

const SYSTEM = `You are Shotgun — a witty, calm AI riding in the passenger seat.
Keep every reply short (1–3 spoken sentences). Safety first: never distract with long monologues.
You run locally on the driver's phone/laptop. Prefer tools for facts, notes, location, and starting games.
You are great at trivia, word-chain, twenty questions, and rhyme battles.
Tone: friendly co-pilot, a little dry humor, no emoji spam.`;

export async function chat(
	history: ChatTurn[],
	userText: string,
	toolResult?: string,
): Promise<{ text: string; toolCalls: ToolCall[] }> {
	if (!client?.isModelLoaded()) {
		throw new Error("Model not loaded yet.");
	}

	const messages: Array<Record<string, unknown>> = [
		{ role: "system", content: SYSTEM },
		...history.map((h) => {
			if (h.role === "tool") {
				return { role: "tool", content: h.content, tool_call_id: h.tool_call_id ?? "tool" };
			}
			return { role: h.role, content: h.content };
		}),
		{ role: "user", content: userText },
	];

	if (toolResult) {
		messages.push({
			role: "user",
			content: `Tool result to weave into your short spoken reply:\n${toolResult}`,
		});
	}

	try {
		const response = await client.createChatCompletion({
			messages: messages as never,
			tools: TOOL_DEFS as never,
			tool_choice: "auto",
			temperature: 0.7,
			max_tokens: 140,
		});

		const choice = response.choices[0];
		const message = choice?.message;
		const toolCalls = extractToolCalls(message);

		if (toolCalls.length) {
			return { text: (message?.content as string | undefined)?.trim() || "", toolCalls };
		}

		const text = String(message?.content ?? "").trim();
		if (text) return { text: stripToolMarkup(text), toolCalls: parseInlineTools(text) };
	} catch {
		/* fall through to plain completion */
	}

	const plain = await client.createChatCompletion({
		messages: messages as never,
		temperature: 0.75,
		max_tokens: 120,
	});
	const text = String(plain.choices[0]?.message?.content ?? "").trim() || "Hmm — radio static. Try again?";
	return { text: stripToolMarkup(text), toolCalls: parseInlineTools(text) };
}

function extractToolCalls(message: unknown): ToolCall[] {
	if (!message || typeof message !== "object") return [];
	const calls = (message as { tool_calls?: unknown }).tool_calls;
	if (!Array.isArray(calls)) return [];

	const out: ToolCall[] = [];
	for (const call of calls) {
		const fn = (call as { function?: { name?: string; arguments?: string } }).function;
		if (!fn?.name) continue;
		let args: Record<string, string> = {};
		try {
			const parsed = JSON.parse(fn.arguments || "{}") as Record<string, unknown>;
			for (const [k, v] of Object.entries(parsed)) args[k] = String(v ?? "");
		} catch {
			args = {};
		}
		out.push({ name: fn.name as ToolCall["name"], args });
	}
	return out;
}

function parseInlineTools(text: string): ToolCall[] {
	const match = text.match(/\[\[tool:(\w+)\|([^\]]*)\]\]/i);
	if (!match) return [];
	const name = match[1]!.toLowerCase() as ToolCall["name"];
	const payload = match[2] ?? "";
	if (name === "web_lookup") return [{ name, args: { query: payload } }];
	if (name === "save_note") return [{ name, args: { text: payload } }];
	if (name === "start_game") return [{ name, args: { kind: payload || "trivia" } }];
	if (name === "list_notes" || name === "get_location") return [{ name, args: {} }];
	return [];
}

function stripToolMarkup(text: string): string {
	return text.replace(/\[\[tool:[^\]]+\]\]/gi, "").trim();
}

export function offlineReply(userText: string, toolBlurb?: string): string {
	if (toolBlurb) return toolBlurb;
	const t = userText.toLowerCase();
	if (/\b(hi|hello|hey)\b/.test(t)) return "Hey — brain's still warming up. Hang tight and we can properly chat in a sec.";
	if (/\b(help|what can you do)\b/.test(t)) {
		return "Once I'm loaded: chat, look things up, save notes, check where we are, and host trivia or word games.";
	}
	return "Still fetching the local model — notes, location, lookups, and games already work.";
}
