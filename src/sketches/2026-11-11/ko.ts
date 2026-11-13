/**
 * Pocket sampler. YouTube will not hand its audio to Web Audio, so a take
 * listens to this tab (or the microphone) while the video plays, then chops
 * the recording onto the pads.
 */

export const PADS = 16;
export const STEPS = 16;
export const SLOTS = 8;

export const PAD_KEYS = [
	"1",
	"2",
	"3",
	"4",
	"q",
	"w",
	"e",
	"r",
	"a",
	"s",
	"d",
	"f",
	"z",
	"x",
	"c",
	"v",
];

export const PAD_CODES = [
	"Digit1",
	"Digit2",
	"Digit3",
	"Digit4",
	"KeyQ",
	"KeyW",
	"KeyE",
	"KeyR",
	"KeyA",
	"KeyS",
	"KeyD",
	"KeyF",
	"KeyZ",
	"KeyX",
	"KeyC",
	"KeyV",
];

const TONE_MIN = 180;
const TONE_MAX = 16000;
const LEAD_SILENCE = 0.02;
const CAPTURE_SLACK = 0.75;

export type ListenMode = "tab" | "mic";
export type PlayMode = "chop" | "keys";
export type SampleFailure = "denied" | "no-audio" | "silent" | "decode";

export type Hit = {
	step: number;
	pads: number[];
	time: number;
};

export type Cue = {
	start: number;
	duration: number;
};

export type TakeWindow = {
	start: number;
	duration: number;
};

export type SlotAudio = {
	sampleRate: number;
	channels: Float32Array[];
};

/** One slot, with the recording when it lives in this browser. */
export type SlotRecord = {
	pattern: boolean[][];
	mode: PlayMode;
	pitch: number;
	transpose: number;
	window: TakeWindow | null;
	audio: SlotAudio | null;
};

type Tape = {
	buffer: AudioBuffer | null;
	cues: Cue[] | null;
	pattern: boolean[][];
	mode: PlayMode;
	pitch: number;
	transpose: number;
	window: TakeWindow | null;
	audio: SlotAudio | null;
};

export class SampleError extends Error {
	readonly code: SampleFailure;

	constructor(code: SampleFailure) {
		super(code);
		this.name = "SampleError";
		this.code = code;
	}
}

export type YouTubePlayer = {
	seekTo: (seconds: number, allowSeekAhead: boolean) => void;
	playVideo: () => void;
	pauseVideo: () => void;
	unMute: () => void;
	setVolume: (volume: number) => void;
	setPlaybackRate: (rate: number) => void;
	getCurrentTime: () => number;
	getDuration: () => number;
	getPlayerState: () => number;
	destroy: () => void;
};

type YouTubeNamespace = {
	Player: new (
		element: HTMLElement,
		options: {
			videoId: string;
			width?: string;
			height?: string;
			playerVars?: Record<string, string | number>;
			events?: {
				onReady?: (event: { target: YouTubePlayer }) => void;
				onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
				onError?: (event: { data: number; target: YouTubePlayer }) => void;
			};
		},
	) => YouTubePlayer;
};

declare global {
	interface Window {
		YT?: YouTubeNamespace;
		onYouTubeIframeAPIReady?: () => void;
	}
}

let youtubeLoader: Promise<void> | null = null;

export function loadYouTube(): Promise<void> {
	if (window.YT?.Player) return Promise.resolve();
	if (youtubeLoader) return youtubeLoader;
	youtubeLoader = new Promise((resolve, reject) => {
		const previous = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			previous?.();
			resolve();
		};
		const script = document.createElement("script");
		script.src = "https://www.youtube.com/iframe_api";
		script.onerror = () => reject(new Error("youtube-script"));
		document.head.appendChild(script);
	});
	return youtubeLoader;
}

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export function padFromCode(code: string): number | null {
	const index = PAD_CODES.indexOf(code);
	return index === -1 ? null : index;
}

const ID = /^[\w-]{11}$/;

export function youtubeId(input: string): string | null {
	const trimmed = input.trim();
	if (ID.test(trimmed)) return trimmed;
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}
	const host = url.hostname.replace(/^www\./, "");
	if (host === "youtu.be") {
		const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
		return ID.test(id) ? id : null;
	}
	if (
		host === "youtube.com" ||
		host === "m.youtube.com" ||
		host === "music.youtube.com" ||
		host === "youtube-nocookie.com"
	) {
		const fromQuery = url.searchParams.get("v");
		if (fromQuery && ID.test(fromQuery)) return fromQuery;
		const parts = url.pathname.split("/").filter(Boolean);
		const marker = parts.findIndex(
			(part) => part === "embed" || part === "shorts" || part === "live" || part === "v",
		);
		const id = marker >= 0 ? (parts[marker + 1] ?? "") : "";
		return ID.test(id) ? id : null;
	}
	return null;
}

export function youtubeStart(input: string): number {
	try {
		const url = new URL(input.trim());
		const stamp = url.searchParams.get("t") ?? url.searchParams.get("start");
		return stamp ? parseTimestamp(stamp) : 0;
	} catch {
		return 0;
	}
}

function parseTimestamp(value: string): number {
	if (/^\d+$/.test(value)) return Number(value);
	const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
	if (!match || (!match[1] && !match[2] && !match[3])) return 0;
	return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export function barsToSeconds(bars: number, bpm: number): number {
	return (bars * 4 * 60) / Math.max(1, bpm);
}

export function formatClock(seconds: number): string {
	const safe = Math.max(0, Math.floor(seconds));
	return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, "0")}`;
}

export function toneToHz(amount: number): number {
	const t = Math.min(1, Math.max(0, amount));
	return TONE_MIN * (TONE_MAX / TONE_MIN) ** t;
}

/** Knob position 0–1. The midpoint is unity playback rate. */
export function pitchToRate(amount: number): number {
	const t = Math.min(1, Math.max(0, amount));
	return 0.5 * 4 ** t;
}

export function emptyPattern(): boolean[][] {
	return Array.from({ length: PADS }, () => Array<boolean>(STEPS).fill(false));
}

function blankTape(): Tape {
	return {
		buffer: null,
		cues: null,
		pattern: emptyPattern(),
		mode: "chop",
		pitch: 0.5,
		transpose: 0,
		window: null,
		audio: null,
	};
}

function cuesFrom(take: TakeWindow): Cue[] {
	const slice = take.duration / PADS;
	return Array.from({ length: PADS }, (_, pad) => ({
		start: take.start + pad * slice,
		duration: slice,
	}));
}

function tapeFrom(record: SlotRecord | undefined, ctx: AudioContext | null): Tape {
	const tape = blankTape();
	if (!record) return tape;
	tape.pattern = Array.from({ length: PADS }, (_, pad) => {
		const row = record.pattern[pad];
		const next = Array<boolean>(STEPS).fill(false);
		if (!row) return next;
		for (let step = 0; step < STEPS; step++) next[step] = row[step] === true;
		return next;
	});
	tape.mode = record.mode === "keys" ? "keys" : "chop";
	tape.pitch = Math.min(1, Math.max(0, record.pitch));
	tape.transpose = Math.min(12, Math.max(-12, Math.round(record.transpose)));
	if (record.window && record.window.duration > 0) {
		tape.window = { start: Math.max(0, record.window.start), duration: record.window.duration };
		tape.cues = cuesFrom(tape.window);
	}
	const audio = record.audio;
	const channels = audio?.channels ?? [];
	const length = channels[0]?.length ?? 0;
	if (ctx && audio && length > 0 && audio.sampleRate > 0) {
		tape.audio = audio;
		const buffer = ctx.createBuffer(channels.length, length, audio.sampleRate);
		channels.forEach((channel, index) => {
			buffer.getChannelData(index).set(channel.subarray(0, length));
		});
		tape.buffer = buffer;
	}
	return tape;
}

function audioFrom(buffer: AudioBuffer): SlotAudio {
	return {
		sampleRate: buffer.sampleRate,
		channels: Array.from({ length: buffer.numberOfChannels }, (_, index) =>
			buffer.getChannelData(index).slice(),
		),
	};
}

export function emptySlots(): SlotRecord[] {
	return Array.from({ length: SLOTS }, () => ({
		pattern: emptyPattern(),
		mode: "chop" as const,
		pitch: 0.5,
		transpose: 0,
		window: null,
		audio: null,
	}));
}

export function formatSemitone(steps: number): string {
	if (steps > 0) return `+${steps}`;
	return `${steps}`;
}

export function formatHz(hz: number): string {
	if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k`;
	return `${Math.round(hz)}`;
}

type CaptureOptions = DisplayMediaStreamOptions & {
	preferCurrentTab?: boolean;
	selfBrowserSurface?: "include" | "exclude";
	systemAudio?: "include" | "exclude";
	surfaceSwitching?: "include" | "exclude";
	monitorTypeSurfaces?: "include" | "exclude";
};

export class Ko {
	bpm = 120;
	swing = 0;
	pitch = 0.5;
	transpose = 0;
	cutoff = TONE_MAX;
	mode: PlayMode = "chop";
	pattern: boolean[][] = emptyPattern();
	playing = false;

	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private filter: BiquadFilterNode | null = null;
	private buffer: AudioBuffer | null = null;
	private cues: Cue[] | null = null;
	private tapes: Tape[] = Array.from({ length: SLOTS }, blankTape);
	private slot = 0;
	private tabStream: MediaStream | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private nextTime = 0;
	private step = 0;
	private queue: Hit[] = [];

	private context(): AudioContext {
		if (this.ctx) return this.ctx;

		const ctx = new AudioContext();
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = this.cutoff;
		filter.Q.value = 0.9;
		const master = ctx.createGain();
		master.gain.value = 0.9;
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -14;
		comp.knee.value = 16;
		comp.ratio.value = 3;
		comp.attack.value = 0.004;
		comp.release.value = 0.16;
		filter.connect(master);
		master.connect(comp);
		comp.connect(ctx.destination);

		this.ctx = ctx;
		this.filter = filter;
		this.master = master;
		return ctx;
	}

	ensure(): AudioContext {
		const ctx = this.context();
		if (ctx.state === "suspended") void ctx.resume();
		return ctx;
	}

	setCutoff(hz: number) {
		if (Math.abs(hz - this.cutoff) < 0.5) return;
		this.cutoff = hz;
		if (!this.filter || !this.ctx) return;
		this.filter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
	}

	setOutput(audible: boolean) {
		if (!this.master || !this.ctx) return;
		const now = this.ctx.currentTime;
		this.master.gain.cancelScheduledValues(now);
		this.master.gain.setValueAtTime(audible ? 0.9 : 0, now);
	}

	hasBuffer(): boolean {
		return this.buffer != null;
	}

	hasCues(): boolean {
		return this.cues != null && !this.buffer;
	}

	audioBuffer(): AudioBuffer | null {
		return this.buffer;
	}

	/**
	 * Remember the editor on this slot. Playback reads every slot, so this
	 * only changes which tape the pads and knobs are writing.
	 */
	sync(
		index: number,
		editor: { pattern: boolean[][]; mode: PlayMode; pitch: number; transpose: number },
	) {
		const tape = this.tapes[index];
		if (!tape) return;
		tape.pattern = editor.pattern;
		tape.mode = editor.mode;
		tape.pitch = editor.pitch;
		tape.transpose = editor.transpose;
		this.slot = index;
		this.buffer = tape.buffer;
		this.cues = tape.cues;
		this.pattern = tape.pattern;
		this.mode = tape.mode;
		this.pitch = tape.pitch;
		this.transpose = tape.transpose;
	}

	read(index: number): Tape | null {
		const tape = this.tapes[index];
		if (!tape) return null;
		return {
			...tape,
			pattern: tape.pattern.map((row) => row.slice()),
			window: tape.window ? { ...tape.window } : null,
		};
	}

	occupied(): boolean[] {
		return this.tapes.map((tape) => tape.buffer != null || tape.cues != null);
	}

	private tapeHasBuffer(index: number): boolean {
		return this.tapes[index]?.buffer != null;
	}

	loadRecording(buffer: AudioBuffer, index = this.slot, take?: TakeWindow) {
		const tape = this.tapes[index];
		if (tape) {
			tape.buffer = buffer;
			tape.audio = audioFrom(buffer);
			if (take && take.duration > 0) {
				tape.window = { start: Math.max(0, take.start), duration: take.duration };
				tape.cues = cuesFrom(tape.window);
			}
		}
		if (index === this.slot) {
			this.buffer = buffer;
			this.cues = tape?.cues ?? null;
		}
	}

	setCues(start: number, total: number, index = this.slot) {
		if (this.tapeHasBuffer(index)) return;
		const take = { start: Math.max(0, start), duration: total };
		const cues = cuesFrom(take);
		const tape = this.tapes[index];
		if (tape) {
			tape.cues = cues;
			tape.window = take;
		}
		if (index === this.slot) {
			this.buffer = null;
			this.cues = cues;
		}
	}

	capture(): SlotRecord[] {
		return this.tapes.map((tape) => ({
			pattern: tape.pattern.map((row) => row.slice()),
			mode: tape.mode,
			pitch: tape.pitch,
			transpose: tape.transpose,
			window: tape.window ? { ...tape.window } : null,
			audio: tape.audio ?? (tape.buffer ? audioFrom(tape.buffer) : null),
		}));
	}

	install(records: SlotRecord[], index: number) {
		const needsAudio = records.some((record) => (record?.audio?.channels[0]?.length ?? 0) > 0);
		const ctx = needsAudio ? this.context() : null;
		this.tapes = Array.from({ length: SLOTS }, (_, slot) => tapeFrom(records[slot], ctx));
		this.slot = Math.min(SLOTS - 1, Math.max(0, index));
		const current = this.tapes[this.slot];
		this.buffer = current?.buffer ?? null;
		this.cues = current?.cues ?? null;
		this.pattern = current?.pattern ?? emptyPattern();
		this.mode = current?.mode ?? "chop";
		this.pitch = current?.pitch ?? 0.5;
		this.transpose = current?.transpose ?? 0;
	}

	cueFor(pad: number): Cue | null {
		if (!this.cues || this.buffer) return null;
		if (this.mode === "keys") {
			const first = this.cues[0];
			const last = this.cues[PADS - 1];
			if (!first || !last) return null;
			return {
				start: first.start,
				duration: Math.max(0.1, last.start + last.duration - first.start),
			};
		}
		return this.cues[pad] ?? null;
	}

	rateFor(pad: number): number {
		if (this.mode === "keys") return 2 ** ((pad + this.transpose) / 12);
		return pitchToRate(this.pitch);
	}

	async openInput(kind: ListenMode): Promise<MediaStream> {
		if (kind === "mic") {
			this.releaseTab();
			try {
				return await navigator.mediaDevices.getUserMedia({
					audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
				});
			} catch {
				throw new SampleError("denied");
			}
		}
		return this.openTab();
	}

	private async openTab(): Promise<MediaStream> {
		const live = this.tabStream?.getAudioTracks().some((track) => track.readyState === "live");
		if (this.tabStream && live) return this.tabStream;
		this.releaseTab();

		let stream: MediaStream;
		try {
			const options: CaptureOptions = {
				video: { displaySurface: "browser" },
				audio: true,
				preferCurrentTab: true,
				selfBrowserSurface: "include",
				systemAudio: "exclude",
				surfaceSwitching: "exclude",
				monitorTypeSurfaces: "exclude",
			};
			stream = await navigator.mediaDevices.getDisplayMedia(options);
		} catch {
			throw new SampleError("denied");
		}

		if (stream.getAudioTracks().length === 0) {
			stream.getTracks().forEach((track) => track.stop());
			throw new SampleError("no-audio");
		}

		stream.getVideoTracks()[0]?.addEventListener("ended", () => {
			if (this.tabStream === stream) this.tabStream = null;
		});
		this.tabStream = stream;
		return stream;
	}

	releaseTab() {
		this.tabStream?.getTracks().forEach((track) => track.stop());
		this.tabStream = null;
	}

	async record(stream: MediaStream, seconds: number): Promise<AudioBuffer> {
		if (typeof MediaRecorder === "undefined") throw new SampleError("decode");
		const ctx = this.ensure();
		const audio = new MediaStream(stream.getAudioTracks());
		if (audio.getAudioTracks().length === 0) throw new SampleError("no-audio");

		const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
		const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
		const rec = new MediaRecorder(audio, mimeType ? { mimeType } : undefined);
		const chunks: Blob[] = [];
		const stopped = new Promise<void>((resolve) => {
			rec.addEventListener("stop", () => resolve(), { once: true });
		});
		rec.addEventListener("dataavailable", (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		});
		rec.start(250);
		await delay((seconds + CAPTURE_SLACK) * 1000);
		if (rec.state === "recording") rec.stop();
		await Promise.race([stopped, delay(2500)]);
		if (chunks.length === 0) throw new SampleError("decode");

		let decoded: AudioBuffer;
		try {
			decoded = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
		} catch {
			throw new SampleError("decode");
		}

		const prepared = prepareTake(ctx, decoded, seconds);
		if (peakOf(prepared) < 0.008) throw new SampleError("silent");
		return prepared;
	}

	start() {
		const ctx = this.ensure();
		this.playing = true;
		this.step = 0;
		this.queue = [];
		this.nextTime = ctx.currentTime + 0.05;
		this.pump();
	}

	stop() {
		this.playing = false;
		if (this.timer != null) clearTimeout(this.timer);
		this.timer = null;
		this.queue = [];
	}

	close() {
		this.stop();
		this.releaseTab();
		void this.ctx?.close();
		this.ctx = null;
		this.master = null;
		this.filter = null;
	}

	trigger(pad: number) {
		const ctx = this.ensure();
		const tape = this.tapes[this.slot];
		if (tape?.buffer) this.voice(tape, pad, ctx.currentTime);
	}

	now(): number | null {
		return this.ctx?.currentTime ?? null;
	}

	consume(now: number): Hit | null {
		let latest: Hit | null = null;
		while (this.queue.length > 0 && this.queue[0].time <= now) {
			latest = this.queue.shift() ?? null;
		}
		if (!latest) return null;
		if (now - latest.time > 0.12) return { step: latest.step, pads: [], time: latest.time };
		return latest;
	}

	private pump = () => {
		if (!this.playing || !this.ctx) return;
		const interval = 60 / this.bpm / 4;
		const now = this.ctx.currentTime;

		if (this.nextTime < now - 0.05) {
			const missed = Math.floor((now - this.nextTime) / interval);
			this.step = (this.step + missed) % STEPS;
			this.nextTime += missed * interval;
		}

		while (this.nextTime < now + 0.12) {
			const when = this.nextTime + (this.step % 2 === 1 ? interval * this.swing : 0);
			this.fire(this.step, when);
			this.nextTime += interval;
			this.step = (this.step + 1) % STEPS;
		}

		this.timer = setTimeout(this.pump, 25);
	};

	private fire(step: number, time: number) {
		const pads: number[] = [];
		for (let index = 0; index < this.tapes.length; index++) {
			const tape = this.tapes[index];
			if (!tape) continue;
			for (let pad = 0; pad < PADS; pad++) {
				if (!tape.pattern[pad]?.[step]) continue;
				if (index === this.slot) pads.push(pad);
				if (tape.buffer) this.voice(tape, pad, time);
			}
		}
		this.queue.push({ step, pads, time });
	}

	private voice(tape: Tape, pad: number, time: number) {
		const buffer = tape.buffer;
		const ctx = this.ctx;
		const filter = this.filter;
		if (!buffer || !ctx || !filter || buffer.duration < 0.01) return;

		const slice = buffer.duration / PADS;
		const offset =
			tape.mode === "chop" ? Math.min(pad * slice, Math.max(0, buffer.duration - 0.01)) : 0;
		const duration =
			tape.mode === "chop"
				? Math.min(slice, buffer.duration - offset)
				: Math.min(buffer.duration, 1.25);
		if (duration < 0.01) return;

		const raw = tape.mode === "keys" ? 2 ** ((pad + tape.transpose) / 12) : pitchToRate(tape.pitch);
		const rate = Math.min(4, Math.max(0.25, raw));
		const playFor = Math.max(0.04, duration / rate);
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.playbackRate.setValueAtTime(rate, time);

		const gain = ctx.createGain();
		const attack = Math.min(0.005, playFor * 0.25);
		const release = Math.min(0.02, playFor * 0.3);
		const stopAt = time + playFor;
		const attackAt = time + attack;
		const releaseAt = stopAt - release;
		gain.gain.setValueAtTime(0.0001, time);
		gain.gain.exponentialRampToValueAtTime(0.55, attackAt);
		if (releaseAt > attackAt + 0.005) gain.gain.setValueAtTime(0.55, releaseAt);
		gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(stopAt, attackAt + 0.01));

		source.connect(gain);
		gain.connect(filter);
		source.start(time, offset, duration);
		source.stop(stopAt + 0.03);
	}
}

function prepareTake(ctx: AudioContext, buffer: AudioBuffer, seconds: number): AudioBuffer {
	const start = firstLoud(buffer, CAPTURE_SLACK);
	const remain = buffer.length - start;
	const want = Math.min(remain, Math.max(1, Math.floor(seconds * buffer.sampleRate)));
	const sliced =
		start === 0 && want === buffer.length ? buffer : copySpan(ctx, buffer, start, want);
	const peak = peakOf(sliced);
	if (peak >= 0.008 && peak > 0.95) {
		const gain = 0.92 / peak;
		for (let channel = 0; channel < sliced.numberOfChannels; channel++) {
			const data = sliced.getChannelData(channel);
			for (let i = 0; i < data.length; i++) data[i] *= gain;
		}
	}
	return sliced;
}

function firstLoud(buffer: AudioBuffer, windowSeconds: number): number {
	const limit = Math.min(buffer.length, Math.floor(windowSeconds * buffer.sampleRate));
	for (let i = 0; i < limit; i++) {
		for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
			if (Math.abs(buffer.getChannelData(channel)[i] ?? 0) > LEAD_SILENCE) return i;
		}
	}
	return 0;
}

function peakOf(buffer: AudioBuffer): number {
	let peak = 0;
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		const data = buffer.getChannelData(channel);
		for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] ?? 0));
	}
	return peak;
}

function copySpan(
	ctx: AudioContext,
	buffer: AudioBuffer,
	start: number,
	length: number,
): AudioBuffer {
	const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		out.getChannelData(channel).set(buffer.getChannelData(channel).subarray(start, start + length));
	}
	return out;
}

export function paintSample(
	canvas: HTMLCanvasElement,
	buffer: AudioBuffer | null,
	selected: number,
	mode: PlayMode,
) {
	const dpr = window.devicePixelRatio || 1;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (width < 2 || height < 2) return;
	canvas.width = Math.floor(width * dpr);
	canvas.height = Math.floor(height * dpr);
	const g = canvas.getContext("2d");
	if (!g) return;
	g.setTransform(dpr, 0, 0, dpr, 0, 0);
	g.clearRect(0, 0, width, height);
	if (!buffer) return;

	const data = buffer.getChannelData(0);
	const step = Math.max(1, Math.floor(data.length / width));
	g.fillStyle = "#4a1c08";
	for (let x = 0; x < width; x++) {
		let min = 1;
		let max = -1;
		const from = x * step;
		for (let i = 0; i < step; i += 8) {
			const sample = data[from + i] ?? 0;
			if (sample < min) min = sample;
			if (sample > max) max = sample;
		}
		const y1 = (1 - max) * 0.5 * height;
		const y2 = (1 - min) * 0.5 * height;
		g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
	}

	if (mode === "chop") {
		const slice = width / PADS;
		g.fillStyle = "rgba(255, 244, 230, 0.28)";
		g.fillRect(selected * slice, 0, slice, height);
		g.strokeStyle = "rgba(74, 28, 8, 0.35)";
		g.beginPath();
		for (let i = 1; i < PADS; i++) {
			g.moveTo(Math.round(i * slice) + 0.5, 0);
			g.lineTo(Math.round(i * slice) + 0.5, height);
		}
		g.stroke();
	}
}
