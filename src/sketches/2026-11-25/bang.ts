type SpeechRecognitionLike = {
	lang: string;
	interimResults: boolean;
	continuous: boolean;
	maxAlternatives: number;
	onresult: ((event: SpeechRecognitionEventLike) => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	onend: (() => void) | null;
	onstart: (() => void) | null;
	start: () => void;
	stop: () => void;
	abort: () => void;
};

type SpeechRecognitionEventLike = {
	resultIndex: number;
	results: ArrayLike<{
		isFinal: boolean;
		length: number;
		[index: number]: { transcript: string; confidence: number };
	}>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const BANG_EXACT = new Set([
	"bang",
	"bangs",
	"bangbang",
	"bank",
	"ban",
	"bann",
	"ben",
	"rang",
	"rank",
	"hang",
	"dang",
	"pang",
	"peng",
	"bong",
	"bung",
	"fang",
	"gang",
	"lang",
	"sang",
	"tang",
	"vang",
	"wang",
	"yang",
	"bean",
	"been",
	"bing",
	"bam",
	"bamm",
	"boom",
	"pew",
	"peww",
	"pow",
	"fire",
	"shot",
	"shoot",
]);

const BANG_NEAR = ["bang", "bank", "rang", "pew", "boom", "bam", "pow", "shot", "fire"];

function recognitionCtor(): SpeechRecognitionCtor | null {
	const w = window as Window & {
		SpeechRecognition?: SpeechRecognitionCtor;
		webkitSpeechRecognition?: SpeechRecognitionCtor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function bangSupported(): boolean {
	return Boolean(recognitionCtor()) || Boolean(navigator.mediaDevices?.getUserMedia);
}

export type BangListener = {
	start: () => Promise<void>;
	stop: () => void;
	active: () => boolean;
};

export type BangHooks = {
	onBang: () => void;
	onHeard?: (text: string) => void;
	onListening?: (listening: boolean) => void;
};

function normalizeToken(raw: string): string {
	return raw.toLowerCase().replace(/[^a-z]/g, "");
}

function editDistance(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	const row = new Array<number>(b.length + 1);
	for (let j = 0; j <= b.length; j++) row[j] = j;
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0]!;
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = row[j]!;
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
			prev = tmp;
		}
	}
	return row[b.length]!;
}

function tokenIsBang(tok: string): boolean {
	if (!tok) return false;
	if (BANG_EXACT.has(tok)) return true;
	if (/^b+a+n+g+$/.test(tok) || /^p+e+w+$/.test(tok) || /^b+o+m+$/.test(tok)) return true;
	for (const target of BANG_NEAR) {
		if (Math.abs(tok.length - target.length) <= 1 && editDistance(tok, target) <= 1) return true;
	}
	return false;
}

/** True if the latest word (not the whole buffered phrase) is bang-like. */
export function isBangUtterance(text: string): boolean {
	const tokens = text
		.trim()
		.toLowerCase()
		.split(/[\s,./!?]+/)
		.map(normalizeToken)
		.filter(Boolean);
	if (!tokens.length) return false;
	// Only the last word — avoids firing on old buffered junk.
	return tokenIsBang(tokens[tokens.length - 1]!);
}

function lastWord(text: string): string {
	const tokens = text.trim().split(/[\s,./!?]+/).filter(Boolean);
	return tokens[tokens.length - 1] ?? "";
}

/**
 * Short non-buffering speech cycles + mic shout detector.
 * Continuous SpeechRecognition was queuing results and dumping them late.
 */
export function createBangListener(hooks: BangHooks | (() => void)): BangListener {
	const onBang = typeof hooks === "function" ? hooks : hooks.onBang;
	const onHeard = typeof hooks === "function" ? undefined : hooks.onHeard;
	const onListening = typeof hooks === "function" ? undefined : hooks.onListening;

	const Ctor = recognitionCtor();
	let rec: SpeechRecognitionLike | null = null;
	let running = false;
	let lastFire = 0;
	let restartTimer = 0;
	let starting = false;

	let micStream: MediaStream | null = null;
	let analyser: AnalyserNode | null = null;
	let shoutRaf = 0;
	let baseline = 0.02;

	function fire(source: string) {
		const now = performance.now();
		if (now - lastFire < 520) return;
		lastFire = now;
		onHeard?.(source);
		onBang();
		// Drop any in-flight speech buffer immediately after a shot.
		bumpSpeech();
	}

	function clearRestart() {
		if (restartTimer) {
			window.clearTimeout(restartTimer);
			restartTimer = 0;
		}
	}

	function scheduleSpeech(delay = 90) {
		if (!running || !Ctor) return;
		clearRestart();
		restartTimer = window.setTimeout(() => {
			restartTimer = 0;
			if (running) beginSpeech();
		}, delay);
	}

	function killSpeech() {
		const active = rec;
		rec = null;
		if (!active) return;
		try {
			active.onresult = null;
			active.onerror = null;
			active.onend = null;
			active.onstart = null;
			active.abort();
		} catch {
			/* ignore */
		}
	}

	function bumpSpeech() {
		killSpeech();
		onListening?.(false);
		scheduleSpeech(140);
	}

	function beginSpeech() {
		if (!Ctor || !running || starting) return;
		starting = true;
		killSpeech();

		const next = new Ctor();
		rec = next;
		next.lang = "en-US";
		// One utterance at a time — continuous mode was the buffer dump.
		next.continuous = false;
		next.interimResults = true;
		next.maxAlternatives = 3;

		next.onstart = () => {
			starting = false;
			onListening?.(true);
		};

		next.onresult = (event) => {
			const piece = event.results[event.results.length - 1];
			if (!piece) return;

			let matched = false;
			let shown = "";
			for (let a = 0; a < Math.min(piece.length, 3); a++) {
				const alt = piece[a]?.transcript ?? "";
				if (a === 0) shown = lastWord(alt) || alt.trim();
				if (isBangUtterance(alt)) {
					matched = true;
					shown = lastWord(alt) || alt.trim();
					break;
				}
			}
			if (shown) onHeard?.(shown);
			if (matched) {
				fire(`“${shown}”`);
				return;
			}
			// Finished a non-bang phrase — clear and listen again.
			if (piece.isFinal) bumpSpeech();
		};

		next.onerror = (event) => {
			starting = false;
			onListening?.(false);
			if (event.error === "not-allowed" || event.error === "service-not-allowed") {
				// Shout detector may still work.
				return;
			}
			if (event.error === "aborted") return;
			scheduleSpeech(event.error === "no-speech" ? 40 : 160);
		};

		next.onend = () => {
			starting = false;
			onListening?.(false);
			if (!running) return;
			// Fresh session; never keep an old result list around.
			scheduleSpeech(70);
		};

		try {
			next.start();
		} catch {
			starting = false;
			scheduleSpeech(280);
		}
	}

	function stopShout() {
		if (shoutRaf) {
			cancelAnimationFrame(shoutRaf);
			shoutRaf = 0;
		}
		analyser = null;
		micStream?.getTracks().forEach((t) => t.stop());
		micStream = null;
	}

	async function startShout() {
		stopShout();
		const ctx = audioCtx();
		if (!ctx || !navigator.mediaDevices?.getUserMedia) return;

		micStream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
			video: false,
		});
		const source = ctx.createMediaStreamSource(micStream);
		analyser = ctx.createAnalyser();
		analyser.fftSize = 512;
		analyser.smoothingTimeConstant = 0.35;
		source.connect(analyser);

		const buf = new Float32Array(analyser.fftSize);
		let prev = 0;

		const tick = () => {
			if (!running || !analyser) return;
			analyser.getFloatTimeDomainData(buf);
			let sum = 0;
			for (let i = 0; i < buf.length; i++) {
				const v = buf[i]!;
				sum += v * v;
			}
			const rms = Math.sqrt(sum / buf.length);
			baseline = baseline * 0.96 + rms * 0.04;
			const rise = rms - prev;
			prev = rms * 0.6 + prev * 0.4;

			// Sharp plosive / shout above room baseline — works when ASR stalls.
			const hot = rms > Math.max(0.085, baseline * 3.4) && rise > 0.028;
			if (hot && performance.now() - lastFire > 520) {
				fire("shout");
			}
			shoutRaf = requestAnimationFrame(tick);
		};
		shoutRaf = requestAnimationFrame(tick);
	}

	return {
		async start() {
			if (running) return;
			running = true;
			lastFire = performance.now(); // ignore boot noise
			try {
				await startShout();
			} catch {
				/* mic denied — speech-only */
			}
			beginSpeech();
		},
		stop() {
			running = false;
			starting = false;
			clearRestart();
			killSpeech();
			stopShout();
			onListening?.(false);
		},
		active: () => running,
	};
}

let sharedAudio: AudioContext | null = null;

function audioCtx(): AudioContext | null {
	try {
		if (!sharedAudio || sharedAudio.state === "closed") {
			sharedAudio = new AudioContext();
		}
		if (sharedAudio.state === "suspended") void sharedAudio.resume();
		return sharedAudio;
	} catch {
		return null;
	}
}

export function playBangSound() {
	const ctx = audioCtx();
	if (!ctx) return;
	try {
		const now = ctx.currentTime;
		const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
		const data = noiseBuf.getChannelData(0);
		for (let i = 0; i < data.length; i++) {
			data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
		}
		const noise = ctx.createBufferSource();
		noise.buffer = noiseBuf;
		const filter = ctx.createBiquadFilter();
		filter.type = "bandpass";
		filter.frequency.value = 980;
		filter.Q.value = 0.7;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.55, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
		noise.connect(filter);
		filter.connect(gain);
		gain.connect(ctx.destination);
		noise.start(now);
		noise.stop(now + 0.18);

		const osc = ctx.createOscillator();
		osc.type = "triangle";
		osc.frequency.setValueAtTime(180, now);
		osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
		const og = ctx.createGain();
		og.gain.setValueAtTime(0.22, now);
		og.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
		osc.connect(og);
		og.connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.13);
	} catch {
		/* ignore */
	}
}
