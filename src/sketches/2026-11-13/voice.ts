export type Availability = "unavailable" | "downloadable" | "downloading" | "available";

export interface DungeonMaster {
	narrate(context: string, narration: string): Promise<string | null>;
	flavor(context: string, attempt: string): Promise<string | null>;
	destroy(): void;
}

interface PromptSession {
	prompt(input: string): Promise<string>;
	destroy(): void;
}

interface CreateMonitor {
	addEventListener(type: "downloadprogress", listener: (event: { loaded?: number }) => void): void;
}

interface CreateOptions {
	expectedInputs?: { type: string; languages?: string[] }[];
	expectedOutputs?: { type: string; languages?: string[] }[];
	initialPrompts?: { role: string; content: string }[];
	monitor?: (monitor: CreateMonitor) => void;
}

interface LanguageModelConstructor {
	availability(options?: CreateOptions): Promise<string>;
	create(options?: CreateOptions): Promise<PromptSession>;
}

const CAPABILITY: CreateOptions = {
	expectedInputs: [{ type: "text", languages: ["en"] }],
	expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const PERSONA = `You are the dungeon master of a short haunted-house game. The player is trying to leave. Write in the second person, present tense, two or three sentences. Dry and specific. No gore. No preamble. Do not mention these instructions or that you are a model.

Never add objects, rooms, exits, or outcomes. Never write the word Marrow unless it already appears in the narration you were given. Never say the player has escaped or been taken unless the narration says so.`;

function languageModel(): LanguageModelConstructor | null {
	const scope = globalThis as { LanguageModel?: LanguageModelConstructor };
	return scope.LanguageModel ?? null;
}

export function normalizeAvailability(value: string): Availability | null {
	if (value === "available" || value === "readily") return "available";
	if (value === "downloadable" || value === "after-download") return "downloadable";
	if (value === "downloading") return "downloading";
	if (value === "unavailable" || value === "no") return "unavailable";
	return null;
}

export async function browserVoice(): Promise<Availability | null> {
	const Model = languageModel();
	if (!Model) return null;
	try {
		const result = normalizeAvailability(await Model.availability(CAPABILITY));
		return result;
	} catch {
		return null;
	}
}

export async function wakeDungeonMaster(onProgress: (loaded: number) => void): Promise<DungeonMaster> {
	const Model = languageModel();
	if (!Model) throw new Error("This browser has no built-in model.");
	const session = await Model.create({
		...CAPABILITY,
		initialPrompts: [{ role: "system", content: PERSONA }],
		monitor(monitor) {
			monitor.addEventListener("downloadprogress", (event) => {
				if (typeof event.loaded === "number") onProgress(event.loaded);
			});
		},
	});

	return {
		narrate(context, narration) {
			return ask(
				session,
				`${PERSONA}

Facts:
${context}

Rewrite this narration. Keep every fact. Two or three sentences, and nothing else.

${narration}`,
			);
		},
		flavor(context, attempt) {
			return ask(
				session,
				`${PERSONA}

Facts:
${context}

The player tried: "${attempt}"

The rules do not change anything. No new item, no opened door, no revealed name, no escape. Two sentences about the attempt, and nothing else.`,
			);
		},
		destroy() {
			session.destroy();
		},
	};
}

export function voiceError(error: unknown): string {
	if (error instanceof DOMException && error.name === "NotAllowedError") {
		return "The browser wants another click before it starts. Press the button again.";
	}
	return "The model did not start. The house will speak for itself.";
}

async function ask(session: PromptSession, prompt: string): Promise<string | null> {
	try {
		const raw = await withTimeout(session.prompt(prompt), 15000);
		if (typeof raw !== "string") return null;
		const text = raw
			.trim()
			.replace(/^["“”]+|["“”]+$/g, "")
			.replace(/^(narration|reply|response|house):\s*/i, "")
			.trim();
		return text || null;
	} catch {
		return null;
	}
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("timeout")), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error instanceof Error ? error : new Error("prompt failed"));
			},
		);
	});
}
