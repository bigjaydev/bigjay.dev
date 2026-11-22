type SpeechRecognitionLike = {
	lang: string;
	interimResults: boolean;
	continuous: boolean;
	maxAlternatives: number;
	onresult: ((event: SpeechRecognitionEventLike) => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
	abort: () => void;
};

type SpeechRecognitionEventLike = {
	resultIndex: number;
	results: ArrayLike<{
		isFinal: boolean;
		0: { transcript: string };
	}>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechVoice = SpeechSynthesisVoice;

let cachedVoice: SpeechVoice | null | undefined;

function recognitionCtor(): SpeechRecognitionCtor | null {
	const w = window as Window & {
		SpeechRecognition?: SpeechRecognitionCtor;
		webkitSpeechRecognition?: SpeechRecognitionCtor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
	return Boolean(recognitionCtor()) && "speechSynthesis" in window;
}

export function listenOnce(onInterim?: (text: string) => void): Promise<string> {
	const Ctor = recognitionCtor();
	if (!Ctor) return Promise.reject(new Error("Speech recognition is not available here."));

	return new Promise((resolve, reject) => {
		const rec = new Ctor();
		rec.lang = "en-US";
		rec.interimResults = true;
		rec.continuous = false;
		rec.maxAlternatives = 1;

		let finalText = "";
		let settled = false;

		const finish = (ok: boolean, value: string, error?: Error) => {
			if (settled) return;
			settled = true;
			try {
				rec.onresult = null;
				rec.onerror = null;
				rec.onend = null;
				rec.stop();
			} catch {
				/* already stopped */
			}
			if (ok) resolve(value);
			else reject(error ?? new Error("Listen failed."));
		};

		rec.onresult = (event) => {
			let interim = "";
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const piece = event.results[i]![0]!.transcript;
				if (event.results[i]!.isFinal) finalText += piece;
				else interim += piece;
			}
			onInterim?.(finalText || interim);
		};

		rec.onerror = (event) => {
			const map: Record<string, string> = {
				"not-allowed": "Microphone permission was denied.",
				"no-speech": "Didn't catch that — try again when the road is quieter.",
				aborted: "Listening cancelled.",
				network: "Speech recognition needs a tiny network hop in this browser.",
			};
			finish(false, "", new Error(map[event.error] ?? `Listen error: ${event.error}`));
		};

		rec.onend = () => {
			const text = finalText.trim();
			if (text) finish(true, text);
			else finish(false, "", new Error("Didn't catch that — try again."));
		};

		try {
			rec.start();
		} catch (error) {
			finish(false, "", error instanceof Error ? error : new Error("Could not start listening."));
		}
	});
}

function scoreVoice(voice: SpeechVoice): number {
	const name = voice.name.toLowerCase();
	const lang = voice.lang.toLowerCase();
	if (!lang.startsWith("en")) return -1000;

	let score = 0;
	if (lang === "en-us" || lang === "en_us") score += 30;
	else if (lang.startsWith("en-gb") || lang.startsWith("en_gb") || lang.startsWith("en-au")) score += 18;
	else score += 8;

	// Prefer neural / online natural voices (Windows Edge / Chrome)
	if (/online\s*\(natural\)|neural|natural|premium|enhanced|wavenet|studio/.test(name)) score += 120;
	if (/\b(aria|jenny|guy|ryan|sonia|andrew|emma|brian|ava|davis|tony|sara)\b/.test(name)) score += 50;
	if (/google\s+us\s+english|google\s+uk\s+english\s+female/.test(name)) score += 40;
	if (/microsoft/.test(name)) score += 15;
	if (voice.localService === false) score += 25; // cloud neural usually sounds far better
	if (voice.default) score += 5;

	// Demote old robotic SAPI voices
	if (/\b(zira|david|mark|hazel|susan|george|helen|sam)\b/.test(name)) score -= 80;
	if (/desktop|sapi|espeak|microsoft\s+david|microsoft\s+zira/.test(name)) score -= 60;

	return score;
}

function pickBestVoice(voices: SpeechVoice[]): SpeechVoice | null {
	if (!voices.length) return null;
	const ranked = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
	const best = ranked[0]!;
	return scoreVoice(best) > -500 ? best : null;
}

async function ensureVoices(): Promise<SpeechVoice[]> {
	if (!("speechSynthesis" in window)) return [];
	const existing = window.speechSynthesis.getVoices();
	if (existing.length) return existing;

	return new Promise((resolve) => {
		const done = () => {
			window.speechSynthesis.removeEventListener("voiceschanged", done);
			resolve(window.speechSynthesis.getVoices());
		};
		window.speechSynthesis.addEventListener("voiceschanged", done);
		window.setTimeout(done, 700);
	});
}

export async function preferredVoiceName(): Promise<string | null> {
	const voice = await resolveVoice();
	return voice?.name ?? null;
}

async function resolveVoice(): Promise<SpeechVoice | null> {
	if (cachedVoice !== undefined) return cachedVoice;
	const voices = await ensureVoices();
	cachedVoice = pickBestVoice(voices);
	return cachedVoice;
}

/** Speak with the best available neural/English voice on this machine. */
export async function speak(text: string): Promise<void> {
	if (!("speechSynthesis" in window)) return;
	const clean = text.replace(/\s+/g, " ").trim();
	if (!clean) return;

	window.speechSynthesis.cancel();
	const voice = await resolveVoice();

	return new Promise((resolve) => {
		const utter = new SpeechSynthesisUtterance(clean);
		utter.rate = 1.02;
		utter.pitch = 1;
		utter.lang = voice?.lang || "en-US";
		if (voice) utter.voice = voice;

		utter.onend = () => resolve();
		utter.onerror = () => resolve();

		// Chrome sometimes drops the first utterance after cancel; nudge the queue.
		window.setTimeout(() => {
			window.speechSynthesis.speak(utter);
		}, 20);
	});
}

export function stopSpeaking() {
	if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
