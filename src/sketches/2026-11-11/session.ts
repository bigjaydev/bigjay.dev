import {
	emptyPattern,
	emptySlots,
	PADS,
	SLOTS,
	STEPS,
	youtubeId,
	type ListenMode,
	type SlotAudio,
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

const SHARE_RATE = 22050;
const IMA_STEP = [
	7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
	80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
	544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
	2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
	12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8];

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
		packAudio(slot.audio),
	].join(",");
}

function monoAt(audio: SlotAudio, rate: number): Float32Array | null {
	const source = audio.channels.filter((channel) => channel.length > 0);
	const first = source[0];
	if (!first || audio.sampleRate <= 0) return null;
	const length = first.length;
	const mixed = new Float32Array(length);
	for (let index = 0; index < length; index++) {
		let sum = 0;
		for (const channel of source) sum += channel[index] ?? 0;
		mixed[index] = sum / source.length;
	}
	if (rate === audio.sampleRate) return mixed;
	const outLength = Math.max(1, Math.round((length * rate) / audio.sampleRate));
	const out = new Float32Array(outLength);
	for (let index = 0; index < outLength; index++) {
		const position = (index * audio.sampleRate) / rate;
		const left = Math.floor(position);
		const right = Math.min(length - 1, left + 1);
		const blend = position - left;
		out[index] = (mixed[left] ?? 0) * (1 - blend) + (mixed[right] ?? 0) * blend;
	}
	return out;
}

function clampSample(value: number): number {
	return Math.min(1, Math.max(-1, value));
}

function imaNibble(sample: number, state: { pred: number; index: number }): number {
	const step = IMA_STEP[state.index] ?? 7;
	let diff = sample - state.pred;
	let nibble = 0;
	if (diff < 0) {
		nibble = 8;
		diff = -diff;
	}
	let delta = step >> 3;
	if (diff >= step) {
		nibble |= 4;
		diff -= step;
		delta += step;
	}
	if (diff >= step >> 1) {
		nibble |= 2;
		diff -= step >> 1;
		delta += step >> 1;
	}
	if (diff >= step >> 2) {
		nibble |= 1;
		delta += step >> 2;
	}
	state.pred += nibble & 8 ? -delta : delta;
	state.pred = Math.min(32767, Math.max(-32768, state.pred));
	state.index = Math.min(88, Math.max(0, state.index + (IMA_INDEX[nibble & 7] ?? 0)));
	return nibble;
}

function imaSample(nibble: number, state: { pred: number; index: number }) {
	const step = IMA_STEP[state.index] ?? 7;
	let diff = step >> 3;
	if (nibble & 4) diff += step;
	if (nibble & 2) diff += step >> 1;
	if (nibble & 1) diff += step >> 2;
	state.pred += nibble & 8 ? -diff : diff;
	state.pred = Math.min(32767, Math.max(-32768, state.pred));
	state.index = Math.min(88, Math.max(0, state.index + (IMA_INDEX[nibble & 7] ?? 0)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	}
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(text: string): Uint8Array | null {
	try {
		const padded = text.replaceAll("-", "+").replaceAll("_", "/");
		const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
		return bytes;
	} catch {
		return null;
	}
}

/** Compact copy of a take so the recording can travel in the link. */
function packAudio(audio: SlotAudio | null): string {
	if (!audio) return ".";
	const samples = monoAt(audio, SHARE_RATE);
	if (!samples || samples.length < 2) return ".";
	const first = Math.round(clampSample(samples[0] ?? 0) * 32767);
	const state = { pred: first, index: 0 };
	const packed = new Uint8Array(8 + Math.ceil((samples.length - 1) / 2));
	const view = new DataView(packed.buffer);
	view.setUint16(0, SHARE_RATE, true);
	view.setUint32(2, samples.length, true);
	view.setInt16(6, first, true);
	for (let index = 1; index < samples.length; index++) {
		const nibble = imaNibble(Math.round(clampSample(samples[index] ?? 0) * 32767), state);
		const at = 8 + ((index - 1) >> 1);
		const byte = packed[at] ?? 0;
		packed[at] = (index - 1) % 2 === 0 ? (nibble << 4) | (byte & 0x0f) : (byte & 0xf0) | nibble;
	}
	return bytesToBase64Url(packed);
}

function unpackAudio(text: string): SlotAudio | null {
	const bytes = base64UrlToBytes(text);
	if (!bytes || bytes.length < 8) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const sampleRate = view.getUint16(0, true);
	const length = view.getUint32(2, true);
	const first = view.getInt16(6, true);
	if (sampleRate < 8000 || sampleRate > 96000 || length < 2 || length > 1_500_000) return null;
	if (bytes.length < 8 + Math.ceil((length - 1) / 2)) return null;
	const samples = new Float32Array(length);
	samples[0] = first / 32767;
	const state = { pred: first, index: 0 };
	for (let index = 0; index < length - 1; index++) {
		const byte = bytes[8 + (index >> 1)] ?? 0;
		imaSample(index % 2 === 0 ? byte >> 4 : byte & 0x0f, state);
		samples[index + 1] = state.pred / 32767;
	}
	return { sampleRate, channels: [samples] };
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
		audio: version === 2 && fields[8] && fields[8] !== "." ? unpackAudio(fields[8]) : null,
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
