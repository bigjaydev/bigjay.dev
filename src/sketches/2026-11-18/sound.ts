import type { Sfx } from "./store";

type Heard = Sfx;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
	const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	return buffer;
}

function burst(
	ctx: AudioContext,
	buffer: AudioBuffer,
	when: number,
	duration: number,
	frequency: number,
	gainValue: number,
	type: BiquadFilterType,
) {
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	const filter = ctx.createBiquadFilter();
	filter.type = type;
	filter.frequency.value = frequency;
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(gainValue, when);
	gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
	source.connect(filter);
	filter.connect(gain);
	gain.connect(ctx.destination);
	source.start(when);
	source.stop(when + duration + 0.02);
}

export function createScore() {
	let ctx: AudioContext | null = null;
	let engine: GainNode | null = null;
	let osc: OscillatorNode | null = null;
	let buffer: AudioBuffer | null = null;
	const heard: Heard = { cannon: 0, missile: 0, boom: 0, hurt: 0, incoming: 0 };

	function ensure(): AudioContext | null {
		if (typeof AudioContext === "undefined") return null;
		if (ctx) return ctx;
		const audio = new AudioContext();
		ctx = audio;
		buffer = noiseBuffer(audio);
		osc = audio.createOscillator();
		osc.type = "sawtooth";
		osc.frequency.value = 46;
		const filter = audio.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 160;
		engine = audio.createGain();
		engine.gain.value = 0;
		osc.connect(filter);
		filter.connect(engine);
		engine.connect(audio.destination);
		osc.start();
		return audio;
	}

	return {
		unlock() {
			const audio = ensure();
			if (audio && audio.state === "suspended") void audio.resume();
		},
		update(speed: number, boost: number, live: boolean, sfx: Sfx) {
			const audio = ctx;
			if (!audio || !engine || !osc || !buffer) return;
			const target = live
				? Math.min(0.07, speed * 0.0009 + (boost > 0.2 && speed > 20 ? 0.02 : 0))
				: 0;
			engine.gain.setTargetAtTime(target, audio.currentTime, 0.08);
			osc.frequency.setTargetAtTime(40 + speed * 0.7, audio.currentTime, 0.08);
			const now = audio.currentTime;
			if (sfx.cannon > heard.cannon) burst(audio, buffer, now, 0.12, 180, 0.35, "lowpass");
			if (sfx.missile > heard.missile) burst(audio, buffer, now, 0.28, 900, 0.12, "bandpass");
			if (sfx.boom > heard.boom) burst(audio, buffer, now, 0.45, 120, 0.4, "lowpass");
			if (sfx.hurt > heard.hurt) burst(audio, buffer, now, 0.18, 420, 0.18, "highpass");
			if (sfx.incoming > heard.incoming) burst(audio, buffer, now, 0.08, 240, 0.08, "lowpass");
			heard.cannon = sfx.cannon;
			heard.missile = sfx.missile;
			heard.boom = sfx.boom;
			heard.hurt = sfx.hurt;
			heard.incoming = sfx.incoming;
		},
	};
}

export type Score = ReturnType<typeof createScore>;

let singleton: Score | null = null;

export function getScore(): Score {
	singleton ??= createScore();
	return singleton;
}
