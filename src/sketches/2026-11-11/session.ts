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
		const legacyScrub = Number.isFinite(song.scrub) ? Math.max(0, song.scrub) : 0;
		const scrubFallback =
			index === clampInt(song.slot, 0, SLOTS - 1) ? legacyScrub : (window?.start ?? 0);
		slots[index] = {
			pattern: normalizePattern(slot.pattern),
			mode: slot.mode === "keys" ? "keys" : "chop",
			pitch: Number.isFinite(slot.pitch) ? Math.min(1, Math.max(0, slot.pitch)) : 0.5,
			transpose: clampInt(slot.transpose, -12, 12),
			url: typeof slot.url === "string" ? slot.url : typeof song.url === "string" ? song.url : "",
			scrub:
				typeof slot.scrub === "number" && Number.isFinite(slot.scrub)
					? Math.max(0, slot.scrub)
					: scrubFallback,
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

function videoUrl(id: string): string {
	return id === "." ? "" : `https://www.youtube.com/watch?v=${id}`;
}

function encodeSlot(slot: SlotRecord): string {
	const start = slot.window ? Math.round(Math.max(0, slot.window.start) * 100) : ".";
	const duration = slot.window ? Math.round(slot.window.duration * 100) : ".";
	return [
		youtubeId(slot.url) ?? ".",
		slot.mode === "keys" ? "k" : "c",
		Math.round(Math.min(1, Math.max(0, slot.pitch)) * 100),
		Math.round(slot.transpose),
		Math.round(Math.max(0, slot.scrub) * 100),
		start,
		duration,
		packPattern(slot.pattern),
	].join(",");
}

function decodeWindow(start: string | undefined, duration: string | undefined): TakeWindow | null {
	if (start == null || duration == null || start === "." || duration === ".") return null;
	const startSec = Number(start) / 100;
	const durationSec = Number(duration) / 100;
	if (!Number.isFinite(startSec) || !Number.isFinite(durationSec) || durationSec <= 0) return null;
	return { start: Math.max(0, startSec), duration: durationSec };
}

function decodeSlot(text: string, version: 1 | 2): SlotRecord | null {
	const fields = text.split(",");
	const mode = version === 2 ? fields[1] : fields[0];
	const pitch = version === 2 ? fields[2] : fields[1];
	const tune = version === 2 ? fields[3] : fields[2];
	const patternText = version === 2 ? fields[7] : fields[5];
	if ((mode !== "c" && mode !== "k") || !patternText) return null;
	const id = version === 2 ? (fields[0] ?? ".") : ".";
	if (id !== "." && !youtubeId(id)) return null;
	const pattern = unpackPattern(patternText);
	if (!pattern) return null;
	const window =
		version === 2 ? decodeWindow(fields[5], fields[6]) : decodeWindow(fields[3], fields[4]);
	const pitchValue = Number(pitch) / 100;
	const scrub = version === 2 ? Number(fields[4]) / 100 : 0;
	return {
		pattern,
		mode: mode === "k" ? "keys" : "chop",
		pitch: Number.isFinite(pitchValue) ? Math.min(1, Math.max(0, pitchValue)) : 0.5,
		transpose: clampInt(Number(tune), -12, 12),
		url: videoUrl(id),
		scrub: Number.isFinite(scrub) ? Math.max(0, scrub) : 0,
		window,
		audio: null,
	};
}

export function encodeSong(song: SongRecord): string {
	const parts = [
		"2",
		Math.round(song.bpm),
		Math.round(song.swing * 100),
		Math.round(song.tone * 100),
		song.bars === 2 || song.bars === 4 ? song.bars : 1,
		song.listen === "mic" ? "1" : "0",
		clampInt(song.slot, 0, SLOTS - 1),
		clampInt(song.selected, 0, PADS - 1),
		...song.slots.map(encodeSlot),
	];
	return `song=${parts.join("!")}`;
}

function songFrom(
	parts: string[],
	index: {
		bpm: number;
		swing: number;
		tone: number;
		bars: number;
		listen: number;
		slot: number;
		selected: number;
	},
	slots: SlotRecord[],
): SongRecord {
	const bars = Number(parts[index.bars]);
	const swing = Number(parts[index.swing]) / 100;
	const tone = Number(parts[index.tone]) / 100;
	const slot = clampInt(Number(parts[index.slot]), 0, SLOTS - 1);
	const current = slots[slot];
	return {
		url: current?.url ?? "",
		scrub: current?.scrub ?? 0,
		bars: bars === 2 || bars === 4 ? bars : 1,
		listen: parts[index.listen] === "1" ? "mic" : "tab",
		bpm: clampInt(Number(parts[index.bpm]), 70, 180),
		swing: Number.isFinite(swing) ? Math.min(0.4, Math.max(0, swing)) : 0,
		tone: Number.isFinite(tone) ? Math.min(1, Math.max(0, tone)) : 1,
		slot,
		selected: clampInt(Number(parts[index.selected]), 0, PADS - 1),
		slots,
	};
}

export function decodeSong(hash: string): SongRecord | null {
	const text = hash.startsWith("#") ? hash.slice(1) : hash;
	if (!text.startsWith("song=")) return null;
	const parts = text.slice("song=".length).split("!");
	if (parts[0] === "2") {
		if (parts.length < 8 + SLOTS) return null;
		const slots: SlotRecord[] = [];
		for (let index = 0; index < SLOTS; index++) {
			const slot = decodeSlot(parts[8 + index] ?? "", 2);
			if (!slot) return null;
			slots.push(slot);
		}
		return songFrom(
			parts,
			{ bpm: 1, swing: 2, tone: 3, bars: 4, listen: 5, slot: 6, selected: 7 },
			slots,
		);
	}
	if (parts[0] !== "1" || parts.length < 10 + SLOTS) return null;
	const id = parts[1] ?? ".";
	if (id !== "." && !youtubeId(id)) return null;
	const url = videoUrl(id);
	const scrub = Number(parts[6]) / 100;
	const safeScrub = Number.isFinite(scrub) ? Math.max(0, scrub) : 0;
	const selectedSlot = clampInt(Number(parts[8]), 0, SLOTS - 1);
	const slots: SlotRecord[] = [];
	for (let index = 0; index < SLOTS; index++) {
		const slot = decodeSlot(parts[10 + index] ?? "", 1);
		if (!slot) return null;
		slot.url = url;
		slot.scrub = index === selectedSlot ? safeScrub : (slot.window?.start ?? 0);
		slots.push(slot);
	}
	return songFrom(
		parts,
		{ bpm: 2, swing: 3, tone: 4, bars: 5, listen: 7, slot: 8, selected: 9 },
		slots,
	);
}
