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

const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/${MODEL_FILE}`;
const SIZE_URL = `${MODEL_URL}.bytes`;
const CACHE_NAME = "brine-model-v1";
const MIN_BYTES = 1_000_000;
const LOAD = { n_threads: 1, n_ctx: 2048 };

export async function modelIsSaved(): Promise<boolean> {
	if (await cacheHasModel()) return true;
	const wllama = new Wllama({ default: wasmUrl }, { suppressNativeLog: true });
	try {
		return (await storedEntry(wllama)) != null;
	} catch {
		return false;
	} finally {
		await wllama.exit().catch(() => undefined);
	}
}

export async function openBrine(
	onProgress: (pct: number, kept: boolean) => void,
): Promise<BrineSession> {
	const wllama = new Wllama({ default: wasmUrl }, { suppressNativeLog: true });
	try {
		const kept = (await openCache()) ?? (await openStored(wllama));
		if (kept) {
			onProgress(100, true);
			await wllama.loadModel([kept], LOAD);
		} else {
			const blob = await fetchModel((pct) => onProgress(pct, false));
			const wrote = await remember(wllama, blob);
			onProgress(100, wrote);
			await wllama.loadModel([blob], LOAD);
		}
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

async function cacheHasModel(): Promise<boolean> {
	if (!("caches" in globalThis)) return false;
	const cache = await caches.open(CACHE_NAME);
	const recorded = await recordedSize(cache);
	if (recorded == null) return false;
	if (recorded < MIN_BYTES || !(await cache.match(MODEL_URL))) {
		await cache.delete(MODEL_URL);
		await cache.delete(SIZE_URL);
		return false;
	}
	return true;
}

async function openCache(): Promise<Blob | null> {
	if (!(await cacheHasModel())) return null;
	const cache = await caches.open(CACHE_NAME);
	const hit = await cache.match(MODEL_URL);
	const blob = hit ? await hit.blob() : null;
	if (!blob || blob.size < MIN_BYTES) {
		await cache.delete(MODEL_URL);
		await cache.delete(SIZE_URL);
		return null;
	}
	return blob;
}

async function recordedSize(cache: Cache): Promise<number | null> {
	const hit = await cache.match(SIZE_URL);
	if (!hit) return null;
	const size = Number(await hit.text());
	return Number.isFinite(size) ? size : null;
}

async function storedEntry(wllama: Wllama) {
	const entries = await wllama.cacheManager.list();
	return (
		entries.find(
			(entry) =>
				entry.metadata.originalURL.endsWith(`/${MODEL_FILE}`) &&
				entry.size >= MIN_BYTES &&
				entry.metadata.originalSize === entry.size,
		) ?? null
	);
}

async function openStored(wllama: Wllama): Promise<Blob | null> {
	const entry = await storedEntry(wllama);
	if (!entry) return null;
	const blob = await wllama.cacheManager.open(entry.name);
	if (!blob || blob.size < MIN_BYTES) return null;
	await rememberCache(blob).catch(() => undefined);
	return blob;
}

async function fetchModel(onPct: (pct: number) => void): Promise<Blob> {
	const response = await fetch(MODEL_URL, { cache: "no-store" });
	if (!response.ok || !response.body) {
		throw new Error(`fetch failed (${response.status})`);
	}
	const total = Number(response.headers.get("content-length") || "0");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let loaded = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.byteLength;
		if (total > 0) onPct(Math.min(99, Math.round((loaded / total) * 100)));
	}
	if (total > 0 && loaded !== total) throw new Error("The download stopped.");
	const blob = new Blob(chunks);
	if (blob.size < MIN_BYTES) throw new Error("The download stopped.");
	return blob;
}

async function remember(wllama: Wllama, blob: Blob): Promise<boolean> {
	if (await rememberCache(blob)) return true;
	try {
		const name = await wllama.cacheManager.getNameFromURL(MODEL_URL);
		await wllama.cacheManager.write(name, blob.stream(), {
			etag: "",
			originalSize: blob.size,
			originalURL: MODEL_URL,
		});
		return true;
	} catch (error) {
		console.error(error);
		return false;
	}
}

async function rememberCache(blob: Blob): Promise<boolean> {
	if (!("caches" in globalThis)) return false;
	try {
		await navigator.storage?.persist?.();
		const cache = await caches.open(CACHE_NAME);
		await cache.put(
			MODEL_URL,
			new Response(blob, {
				headers: {
					"Content-Type": "application/octet-stream",
					"Content-Length": String(blob.size),
				},
			}),
		);
		await cache.put(
			SIZE_URL,
			new Response(String(blob.size), { headers: { "Content-Type": "text/plain" } }),
		);
		return true;
	} catch (error) {
		console.error(error);
		return false;
	}
}
