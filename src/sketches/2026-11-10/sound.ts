export const STEPS = 16;

/** Fixed pitch for each bass step, as MIDI note numbers. */
export const BASS_MIDI = [36, 40, 43, 48, 36, 38, 40, 43, 45, 43, 40, 38, 36, 40, 38, 36];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteName(midi: number): string {
	const name = NOTE_NAMES[midi % 12] ?? "C";
	const octave = Math.floor(midi / 12) - 1;
	return `${name}${octave}`;
}

function midiToFreq(midi: number): number {
	return 440 * 2 ** ((midi - 69) / 12);
}

type Queued = { step: number; time: number };

/**
 * Schedules drum hits on the audio clock. The pattern is read when each step
 * is scheduled, so edits land on the next pass without restarting playback.
 */
export class Sequencer {
	pattern: boolean[][] = [];
	bpm = 112;
	playing = false;

	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private noise: AudioBuffer | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private nextTime = 0;
	private step = 0;
	private queue: Queued[] = [];

	private ensure(): AudioContext {
		if (this.ctx) {
			if (this.ctx.state === "suspended") void this.ctx.resume();
			return this.ctx;
		}

		const ctx = new AudioContext();
		const master = ctx.createGain();
		master.gain.value = 0.7;
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -16;
		comp.knee.value = 18;
		comp.ratio.value = 3;
		comp.attack.value = 0.004;
		comp.release.value = 0.18;
		master.connect(comp);
		comp.connect(ctx.destination);

		const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

		this.ctx = ctx;
		this.master = master;
		this.noise = noise;
		return ctx;
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
		void this.ctx?.close();
		this.ctx = null;
		this.master = null;
		this.noise = null;
	}

	/** Latest step whose scheduled time has arrived, or null if none have. */
	consume(now: number): number | null {
		let step: number | null = null;
		while (this.queue.length > 0 && this.queue[0].time <= now) {
			step = this.queue.shift()?.step ?? null;
		}
		return step;
	}

	now(): number | null {
		return this.ctx?.currentTime ?? null;
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
			this.fire(this.step, this.nextTime);
			this.queue.push({ step: this.step, time: this.nextTime });
			this.nextTime += interval;
			this.step = (this.step + 1) % STEPS;
		}

		this.timer = setTimeout(this.pump, 25);
	};

	private fire(step: number, time: number) {
		if (this.pattern[0]?.[step]) this.kick(time);
		if (this.pattern[1]?.[step]) this.snare(time);
		if (this.pattern[2]?.[step]) this.hat(time);
		if (this.pattern[3]?.[step]) this.bass(time, BASS_MIDI[step] ?? 36);
	}

	private kick(time: number) {
		const ctx = this.ctx;
		const master = this.master;
		if (!ctx || !master) return;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(156, time);
		osc.frequency.exponentialRampToValueAtTime(46, time + 0.09);
		gain.gain.setValueAtTime(0.85, time);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
		osc.connect(gain);
		gain.connect(master);
		osc.start(time);
		osc.stop(time + 0.34);

		const click = ctx.createOscillator();
		const clickGain = ctx.createGain();
		click.type = "triangle";
		click.frequency.setValueAtTime(240, time);
		clickGain.gain.setValueAtTime(0.18, time);
		clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
		click.connect(clickGain);
		clickGain.connect(master);
		click.start(time);
		click.stop(time + 0.03);
	}

	private snare(time: number) {
		const ctx = this.ctx;
		const master = this.master;
		const buffer = this.noise;
		if (!ctx || !master || !buffer) return;

		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const hp = ctx.createBiquadFilter();
		hp.type = "highpass";
		hp.frequency.setValueAtTime(1400, time);
		const noiseGain = ctx.createGain();
		noiseGain.gain.setValueAtTime(0.38, time);
		noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
		noise.connect(hp);
		hp.connect(noiseGain);
		noiseGain.connect(master);
		noise.start(time);
		noise.stop(time + 0.18);

		const osc = ctx.createOscillator();
		osc.type = "triangle";
		osc.frequency.setValueAtTime(196, time);
		osc.frequency.exponentialRampToValueAtTime(140, time + 0.08);
		const tone = ctx.createGain();
		tone.gain.setValueAtTime(0.28, time);
		tone.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
		osc.connect(tone);
		tone.connect(master);
		osc.start(time);
		osc.stop(time + 0.12);
	}

	private hat(time: number) {
		const ctx = this.ctx;
		const master = this.master;
		const buffer = this.noise;
		if (!ctx || !master || !buffer) return;

		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const hp = ctx.createBiquadFilter();
		hp.type = "highpass";
		hp.frequency.setValueAtTime(7000, time);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.18, time);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
		noise.connect(hp);
		hp.connect(gain);
		gain.connect(master);
		noise.start(time);
		noise.stop(time + 0.06);
	}

	private bass(time: number, midi: number) {
		const ctx = this.ctx;
		const master = this.master;
		if (!ctx || !master) return;

		const freq = midiToFreq(midi);
		const osc = ctx.createOscillator();
		osc.type = "triangle";
		osc.frequency.setValueAtTime(freq, time);
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.Q.setValueAtTime(0.7, time);
		filter.frequency.setValueAtTime(Math.max(200, freq * 6), time);
		filter.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 2), time + 0.18);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.32, time);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
		osc.connect(filter);
		filter.connect(gain);
		gain.connect(master);
		osc.start(time);
		osc.stop(time + 0.28);
	}
}
