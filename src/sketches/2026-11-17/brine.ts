import { Wllama } from "@wllama/wllama";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import { MODEL_FILE, MODEL_REPO } from "./protocol";

export interface BrineTurn {
	role: "system" | "user";
	content: string;
}

export interface BrineSession {
	generate(options: {
		messages: BrineTurn[];
		maxTokens: number;
		temperature: number;
		onDelta?: (text: string) => void;
	}): Promise<string>;
	exit(): Promise<void>;
}

export async function openBrine(onProgress: (pct: number) => void): Promise<BrineSession> {
	const wllama = new Wllama({ default: wasmUrl }, { suppressNativeLog: true });
	try {
		await wllama.loadModelFromHF(
			{ repo: MODEL_REPO, file: MODEL_FILE },
			{
				n_threads: 1,
				n_ctx: 2048,
				progressCallback: ({ loaded, total }) => {
					if (total <= 0) return;
					onProgress(Math.max(0, Math.min(100, Math.round((loaded / total) * 100))));
				},
			},
		);
	} catch (error) {
		await wllama.exit().catch(() => undefined);
		throw error;
	}

	return {
		async generate({ messages, maxTokens, temperature, onDelta }) {
			let spoken = "";
			await wllama.createChatCompletion({
				messages,
				max_tokens: maxTokens,
				temperature,
				stream: true,
				onData: (chunk) => {
					const piece = chunk.choices[0]?.delta?.content ?? "";
					if (!piece) return;
					spoken = piece.startsWith(spoken) ? piece : spoken + piece;
					onDelta?.(spoken);
				},
			});
			return spoken;
		},
		exit() {
			return wllama.exit();
		},
	};
}
