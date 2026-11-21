type SpeechRecognitionLike = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	maxAlternatives: number;
	onresult: ((event: SpeechRecognitionEventLike) => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
	abort: () => void;
};

type SpeechRecognitionEventLike = {
	results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
	if (typeof window === "undefined") return null;
	const w = window as Window & {
		SpeechRecognition?: SpeechRecognitionCtor;
		webkitSpeechRecognition?: SpeechRecognitionCtor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
	return recognitionCtor() !== null;
}

export function speak(text: string): void {
	if (typeof window === "undefined" || !window.speechSynthesis) return;
	window.speechSynthesis.cancel();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.rate = 1.02;
	utterance.pitch = 1;
	utterance.lang = "en-AU";
	window.speechSynthesis.speak(utterance);
}

/** One-shot listen. Returns the final transcript or throws a short reason. */
export function listenOnce(): Promise<string> {
	const Ctor = recognitionCtor();
	if (!Ctor) {
		return Promise.reject(new Error("Speech recognition isn’t available in this browser."));
	}

	return new Promise((resolve, reject) => {
		const recognition = new Ctor();
		recognition.lang = "en-AU";
		recognition.continuous = false;
		recognition.interimResults = true;
		recognition.maxAlternatives = 3;

		let settled = false;
		let interim = "";

		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			fn();
		};

		recognition.onresult = (event) => {
			let finalText = "";
			for (let i = 0; i < event.results.length; i++) {
				const result = event.results[i]!;
				const transcript = result[0]?.transcript ?? "";
				if (result.isFinal) finalText += transcript;
				else interim = transcript;
			}
			if (finalText.trim()) {
				finish(() => resolve(finalText.trim()));
			}
		};

		recognition.onerror = (event) => {
			const error = event.error;
			if (error === "aborted" || error === "no-speech") {
				finish(() => reject(new Error(error === "no-speech" ? "No speech heard." : "Listening cancelled.")));
				return;
			}
			finish(() => reject(new Error(error === "not-allowed" ? "Microphone permission denied." : `Listen failed: ${error}`)));
		};

		recognition.onend = () => {
			if (settled) return;
			if (interim.trim()) {
				finish(() => resolve(interim.trim()));
				return;
			}
			finish(() => reject(new Error("No speech heard.")));
		};

		try {
			recognition.start();
		} catch {
			finish(() => reject(new Error("Couldn’t start the microphone.")));
		}
	});
}
