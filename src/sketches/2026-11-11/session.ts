import {
	emptyPattern,
	emptySlots,
	PADS,
	SLOTS,
	STEPS,
	youtubeId,
	type ListenMode,
	type SlotRecord,
	type TakeWindow,
} from "./ko";

export type SongRecord = {
	url: string;
	scrub: number;
	bars: number;
	listen: ListenMode;
	bpm: number;
	swing: number;
	tone: number;
	slot: number;
	selected: number;
	slots: SlotRecord[];
};

const DB = "po-33";
const STORE = "session";
const KEY = "current";

let tail: Promise<void> = Promise.resolve();
let generation = 0;

function enqueue(task: () => Promise<void>) {
	const run = tail.then(task, task);
	tail = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

function clampInt(value: number, min: number, max: number) {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function normalizePattern(pattern: boolean[][] | undefined): boolean[][] {
	const next = emptyPattern();
	for (let pad = 0; pad < PADS; pad++) {
		const row = pattern?.[pad];
		if (!row) continue;
		for (let step = 0; step < STEPS; step++) next[pad]![step] = row[step] === true;
	}
	return next;
}

function normalize(song: SongRecord): SongRecord {
	const slots = emptySlots();
	for (let index = 0; index < SLOTS; index++) {
		const slot = song.slots[index];
		if (!slot) continue;
		const window =
			slot.window && slot.window.duration > 0
				? { start: Math.max(0, slot.window.start), duration: slot.window.duration }
				: null;
		slots[index] = {
			pattern: normalizePattern(slot.pattern),
			mode: slot.mode === "keys" ? "keys" : "chop",
			pitch: Number.isFinite(slot.pitch) ? Math.min(1, Math.max(0, slot.pitch)) : 0.5,
			transpose: clampInt(slot.transpose, -12, 12),
			window,
			audio:
				slot.audio && slot.audio.sampleRate > 0 && (slot.audio.channels[0]?.length ?? 0) > 0
					? slot.audio
					: null,
		};
	}
	return {
		url: typeof song.url === "string" ? song.url : "",
		scrub: Number.isFinite(song.scrub) ? Math.max(0, song.scrub) : 0,
		bars: song.bars === 2 || song.bars === 4 ? song.bars : 1,
		listen: song.listen === "mic" ? "mic" : "tab",
		bpm: clampInt(song.bpm, 70, 180),
		swing: Number.isFinite(song.swing) ? Math.min(0.4, Math.max(0, song.swing)) : 0,
		tone: Number.isFinite(song.tone) ? Math.min(1, Math.max(0, song.tone)) : 1,
		slot: clampInt(song.slot, 0, SLOTS - 1),
		selected: clampInt(song.selected, 0, PADS - 1),
		slots,
	};
}

export async function loadSession(): Promise<SongRecord | null> {
	const db = await openDb();
	try {
		const song = await new Promise<SongRecord | null>((resolve, reject) => {
			const request = db.transaction(STORE).objectStore(STORE).get(KEY);
			request.onsuccess = () => {
				const value = request.result as SongRecord | undefined;
				resolve(value && Array.isArray(value.slots) ? normalize(value) : null);
			};
			request.onerror = () => reject(request.error);
		});
		return song;
	} finally {
		db.close();
	}
}

export function saveSession(song: SongRecord) {
	const gen = generation;
	return enqueue(async () => {
		if (gen !== generation) return;
		const db = await openDb();
		try {
			if (gen !== generation) return;
			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction(STORE, "readwrite");
				tx.objectStore(STORE).put(normalize(song), KEY);
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	});
}

export function clearSession() {
	generation += 1;
	return enqueue(async () => {
		const db = await openDb();
		try {
			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction(STORE, "readwrite");
				tx.objectStore(STORE).delete(KEY);
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	});
}

function packPattern(pattern: boolean[][]): string {
	const bytes = new Uint8Array(32);
	let bit = 0;
	let any = false;
	for (let pad = 0; pad < PADS; pad++) {
		for (let step = 0; step < STEPS; step++) {
			if (pattern[pad]?.[step]) {
				bytes[bit >> 3] |= 1 << (bit & 7);
				any = true;
			}
			bit++;
		}
	}
	if (!any) return ".";
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function unpackPattern(text: string): boolean[][] | null {
	if (text === ".") return emptyPattern();
	try {
		const padded = text.replaceAll("-", "+").replaceAll("_", "/");
		const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
		if (binary.length !== 32) return null;
		const pattern = emptyPattern();
		let bit = 0;
		for (let pad = 0; pad < PADS; pad++) {
			for (let step = 0; step < STEPS; step++) {
				const byte = binary.charCodeAt(bit >> 3);
				const row = pattern[pad];
				if (row) row[step] = (byte & (1 << (bit & 7))) !== 0;
				bit++;
			}
		}
		return pattern;
	} catch {
		return null;
	}
}

function encodeSlot(slot: SlotRecord): string {
	const start = slot.window ? Math.round(Math.max(0, slot.window.start) * 100) : ".";
	const duration = slot.window ? Math.round(slot.window.duration * 100) : ".";
	return [
		slot.mode === "keys" ? "k" : "c",
		Math.round(Math.min(1, Math.max(0, slot.pitch)) * 100),
		Math.round(slot.transpose),
		start,
		duration,
		packPattern(slot.pattern),
	].join(",");
}

function decodeSlot(text: string): SlotRecord | null {
	const [mode, pitch, tune, start, duration, patternText] = text.split(",");
	if ((mode !== "c" && mode !== "k") || !patternText) return null;
	const pattern = unpackPattern(patternText);
	if (!pattern) return null;
	let window: TakeWindow | null = null;
	if (start !== "." && duration !== ".") {
		const startSec = Number(start) / 100;
		const durationSec = Number(duration) / 100;
		if (Number.isFinite(startSec) && Number.isFinite(durationSec) && durationSec > 0) {
			window = { start: Math.max(0, startSec), duration: durationSec };
		}
	}
	const pitchValue = Number(pitch) / 100;
	return {
		pattern,
		mode: mode === "k" ? "keys" : "chop",
		pitch: Number.isFinite(pitchValue) ? Math.min(1, Math.max(0, pitchValue)) : 0.5,
		transpose: clampInt(Number(tune), -12, 12),
		window,
		audio: null,
	};
}

export function encodeSong(song: SongRecord): string {
	const parts = [
		"1",
		youtubeId(song.url) ?? ".",
		Math.round(song.bpm),
		Math.round(song.swing * 100),
		Math.round(song.tone * 100),
		song.bars === 2 || song.bars === 4 ? song.bars : 1,
		Math.round(Math.max(0, song.scrub) * 100),
		song.listen === "mic" ? "1" : "0",
		clampInt(song.slot, 0, SLOTS - 1),
		clampInt(song.selected, 0, PADS - 1),
		...song.slots.map(encodeSlot),
	];
	return `song=${parts.join("!")}`;
}

export function decodeSong(hash: string): SongRecord | null {
	const text = hash.startsWith("#") ? hash.slice(1) : hash;
	if (!text.startsWith("song=")) return null;
	const parts = text.slice("song=".length).split("!");
	if (parts[0] !== "1" || parts.length < 10 + SLOTS) return null;
	const id = parts[1] ?? ".";
	if (id !== "." && !youtubeId(id)) return null;
	const slots: SlotRecord[] = [];
	for (let index = 0; index < SLOTS; index++) {
		const slot = decodeSlot(parts[10 + index] ?? "");
		if (!slot) return null;
		slots.push(slot);
	}
	const bars = Number(parts[5]);
	const swing = Number(parts[3]) / 100;
	const tone = Number(parts[4]) / 100;
	const scrub = Number(parts[6]) / 100;
	return {
		url: id === "." ? "" : `https://www.youtube.com/watch?v=${id}`,
		scrub: Number.isFinite(scrub) ? Math.max(0, scrub) : 0,
		bars: bars === 2 || bars === 4 ? bars : 1,
		listen: parts[7] === "1" ? "mic" : "tab",
		bpm: clampInt(Number(parts[2]), 70, 180),
		swing: Number.isFinite(swing) ? Math.min(0.4, Math.max(0, swing)) : 0,
		tone: Number.isFinite(tone) ? Math.min(1, Math.max(0, tone)) : 1,
		slot: clampInt(Number(parts[8]), 0, SLOTS - 1),
		selected: clampInt(Number(parts[9]), 0, PADS - 1),
		slots,
	};
}
