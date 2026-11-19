// Original 171 BPM synthwave loop. Gated drums, a saw bass in A minor,
// and a bright arpeggio written for this sketch.

const BPM = 171;
const STEP = 60 / BPM / 4;
const LOOP = 128;

const BASS = [
	[45, 0, 45, 0, 52, 0, 45, 48, 0, 45, 0, 40, 0, 45, 52, 0],
	[41, 0, 41, 45, 0, 48, 0, 41, 0, 45, 41, 0, 48, 0, 41, 0],
	[38, 0, 38, 0, 45, 41, 0, 38, 0, 50, 0, 45, 0, 41, 38, 0],
	[40, 0, 40, 0, 47, 0, 40, 44, 0, 40, 0, 47, 40, 0, 50, 0],
];

const BASS_B = [
	[45, 0, 52, 0, 45, 57, 0, 48, 45, 0, 40, 0, 45, 0, 52, 45],
	[41, 48, 0, 41, 0, 53, 0, 45, 0, 41, 48, 0, 41, 0, 36, 0],
	[38, 0, 45, 0, 38, 50, 0, 41, 38, 0, 45, 0, 50, 0, 38, 43],
	[40, 47, 0, 52, 0, 40, 44, 0, 47, 0, 40, 0, 56, 0, 47, 40],
];

const ARP = [
	[69, 72, 76, 79, 0, 72, 81, 76, 72, 0, 76, 79, 84, 79, 0, 72],
	[76, 72, 69, 65, 69, 72, 0, 81, 76, 72, 69, 0, 65, 69, 72, 76],
	[62, 65, 69, 72, 74, 72, 69, 0, 69, 72, 76, 72, 0, 65, 62, 65],
	[64, 68, 71, 76, 0, 68, 64, 71, 76, 80, 76, 0, 68, 71, 64, 68],
];

const ARP_B = [
	[81, 79, 76, 72, 76, 0, 84, 79, 76, 72, 69, 72, 0, 76, 81, 84],
	[81, 76, 72, 69, 65, 69, 0, 76, 72, 69, 65, 0, 72, 76, 69, 65],
	[74, 72, 69, 65, 62, 65, 69, 0, 72, 69, 65, 62, 0, 69, 72, 74],
	[80, 76, 71, 68, 64, 0, 71, 76, 80, 83, 80, 76, 0, 71, 68, 64],
];

const CHORDS = [
	[57, 60, 64, 67],
	[53, 57, 60, 64],
	[50, 53, 57, 60],
	[52, 56, 59, 62],
];

function midi(note: number): number {
	return 440 * 2 ** ((note - 69) / 12);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export class Score {
	volume = 0.72;
	unlocked = false;
	mode: "synth" | "file" = "synth";
	fileName = "";
	error = "";

	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private music: GainNode | null = null;
	private duck: GainNode | null = null;
	private sfx: GainNode | null = null;
	private analyser: AnalyserNode | null = null;
	private noise: AudioBuffer | null = null;
	private wave = new Uint8Array(32);
	private timer: ReturnType<typeof setTimeout> | null = null;
	private nextTime = 0;
	private step = 0;
	private synthOn = false;
	private fileEl: HTMLAudioElement | null = null;
	private fileSrc: MediaElementAudioSourceNode | null = null;
	private fileUrl = "";

	setVolume(value: number) {
		this.volume = clamp(value, 0, 1);
		this.applyVolume();
	}

	unlock() {
		const ctx = this.ensure();
		void ctx.resume();
		if (!this.unlocked) {
			this.unlocked = true;
			this.master?.gain.setValueAtTime(0, ctx.currentTime);
			this.master?.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 0.45);
		} else this.applyVolume();
		if (this.mode === "file") void this.fileEl?.play();
		else this.startSynth();
	}

	loadFile(file: File) {
		this.unlock();
		const ctx = this.ctx;
		const music = this.music;
		if (!ctx || !music) return;
		this.error = "";
		if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
		const url = URL.createObjectURL(file);
		this.fileUrl = url;
		this.fileName = file.name;
		if (!this.fileEl) {
			const audio = new Audio();
			audio.loop = true;
			audio.volume = 1;
			this.fileEl = audio;
			this.fileSrc = ctx.createMediaElementSource(audio);
			this.fileSrc.connect(music);
			audio.addEventListener("error", () => {
				this.error = "That file won't play.";
			});
		}
		this.stopSynth();
		this.mode = "file";
		this.fileEl.src = url;
		void this.fileEl.play().catch(() => {
			this.error = "That file won't play.";
			this.useSynth();
		});
	}

	useSynth() {
		this.fileEl?.pause();
		this.mode = "synth";
		this.error = "";
		if (this.unlocked) this.startSynth();
	}

	play(name: string) {
		if (!this.unlocked || !this.ctx || !this.sfx) return;
		const time = this.ctx.currentTime;
		if (name === "ring") {
			this.tone(time, 880, 0.08, "sine", 0.08);
			this.tone(time + 0.1, 1318, 0.1, "sine", 0.07);
		} else if (name === "steal") this.tone(time, 520, 0.07, "square", 0.05);
		else if (name === "job") {
			[523, 659, 784, 1046].forEach((freq, index) => {
				this.tone(time + index * 0.07, freq, 0.12, "triangle", 0.08);
			});
		} else if (name === "crush") this.noiseHit(time, 240, 0.28, 0.2);
		else if (name === "bust") this.noiseHit(time, 140, 0.4, 0.22);
	}

	levels(): number[] {
		const analyser = this.analyser;
		if (!analyser || !this.unlocked) return [0, 0, 0, 0, 0];
		analyser.getByteFrequencyData(this.wave);
		const bars: number[] = [];
		const size = this.wave.length;
		for (let i = 0; i < 5; i++) {
			const from = Math.floor((i / 5) * size);
			const to = Math.max(from + 1, Math.floor(((i + 1) / 5) * size));
			let sum = 0;
			for (let bin = from; bin < to; bin++) sum += this.wave[bin] ?? 0;
			bars.push(sum / (to - from) / 255);
		}
		return bars;
	}

	close() {
		this.stopSynth();
		if (this.fileEl) {
			this.fileEl.pause();
			this.fileEl.src = "";
		}
		if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
		this.fileUrl = "";
		void this.ctx?.close();
		this.ctx = null;
		this.master = null;
		this.music = null;
		this.duck = null;
		this.sfx = null;
		this.analyser = null;
		this.noise = null;
		this.fileEl = null;
		this.fileSrc = null;
	}

	private applyVolume() {
		if (!this.unlocked || !this.ctx || !this.master) return;
		this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04);
	}

	private ensure(): AudioContext {
		if (this.ctx) {
			if (this.ctx.state === "suspended") void this.ctx.resume();
			return this.ctx;
		}
		const ctx = new AudioContext();
		const master = ctx.createGain();
		master.gain.value = 0;
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -14;
		comp.knee.value = 12;
		comp.ratio.value = 3;
		comp.attack.value = 0.005;
		comp.release.value = 0.18;
		master.connect(comp);
		comp.connect(ctx.destination);

		const music = ctx.createGain();
		music.gain.value = 1;
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 64;
		music.connect(analyser);
		analyser.connect(master);

		const duck = ctx.createGain();
		duck.gain.value = 1;
		duck.connect(music);

		const sfx = ctx.createGain();
		sfx.gain.value = 0.8;
		sfx.connect(master);

		const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

		this.ctx = ctx;
		this.master = master;
		this.music = music;
		this.duck = duck;
		this.sfx = sfx;
		this.analyser = analyser;
		this.noise = noise;
		this.wave = new Uint8Array(analyser.frequencyBinCount);
		return ctx;
	}

	private startSynth() {
		if (this.synthOn || !this.ctx) return;
		this.synthOn = true;
		this.step = 0;
		this.nextTime = this.ctx.currentTime + 0.06;
		this.pump();
	}

	private stopSynth() {
		this.synthOn = false;
		if (this.timer != null) clearTimeout(this.timer);
		this.timer = null;
	}

	private pump = () => {
		if (!this.synthOn || !this.ctx) return;
		const now = this.ctx.currentTime;
		if (this.nextTime < now - 0.05) {
			const missed = Math.floor((now - this.nextTime) / STEP);
			this.step = (this.step + missed) % LOOP;
			this.nextTime += missed * STEP;
		}
		while (this.nextTime < now + 0.18) {
			this.schedule(this.step, this.nextTime);
			this.step = (this.step + 1) % LOOP;
			this.nextTime += STEP;
		}
		this.timer = setTimeout(this.pump, 25);
	};

	private schedule(step: number, time: number) {
		const bar = Math.floor(step / 16) % 8;
		const index = step % 16;
		const bassRow = (bar < 4 ? BASS : BASS_B)[bar % 4];
		const bassNote = bassRow?.[index] ?? 0;
		if (bassNote) this.bass(time, midi(bassNote));
		const arpRow = (bar < 4 ? ARP : ARP_B)[bar % 4];
		const arpNote = arpRow?.[index] ?? 0;
		if (arpNote) this.lead(time, midi(arpNote));
		if (index % 4 === 0) {
			this.kick(time);
			this.duckAt(time);
		}
		if (index % 8 === 4) this.clap(time);
		if (index === 10 || index === 14) this.hat(time, true);
		else if (index % 2 === 0) this.hat(time, false);
		if (index === 0) this.pad(time, CHORDS[bar % 4] ?? CHORDS[0]);
	}

	private bass(time: number, freq: number) {
		const ctx = this.ctx;
		const duck = this.duck;
		if (!ctx || !duck) return;
		const osc = ctx.createOscillator();
		const filter = ctx.createBiquadFilter();
		const gain = ctx.createGain();
		osc.type = "sawtooth";
		osc.frequency.setValueAtTime(freq, time);
		filter.type = "lowpass";
		filter.Q.value = 7;
		filter.frequency.setValueAtTime(240, time);
		filter.frequency.exponentialRampToValueAtTime(1200, time + 0.03);
		filter.frequency.exponentialRampToValueAtTime(280, time + 0.15);
		gain.gain.setValueAtTime(0.0001, time);
		gain.gain.exponentialRampToValueAtTime(0.2, time + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
		osc.connect(filter);
		filter.connect(gain);
		gain.connect(duck);
		osc.start(time);
		osc.stop(time + 0.18);

		const sub = ctx.createOscillator();
		const subGain = ctx.createGain();
		sub.type = "sine";
		sub.frequency.setValueAtTime(freq / 2, time);
		subGain.gain.setValueAtTime(0.14, time);
		subGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
		sub.connect(subGain);
		subGain.connect(duck);
		sub.start(time);
		sub.stop(time + 0.16);
	}

	private lead(time: number, freq: number) {
		const ctx = this.ctx;
		const music = this.music;
		if (!ctx || !music) return;
		const osc = ctx.createOscillator();
		const filter = ctx.createBiquadFilter();
		const gain = ctx.createGain();
		osc.type = "square";
		osc.frequency.setValueAtTime(freq, time);
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(2400, time);
		filter.frequency.exponentialRampToValueAtTime(900, time + 0.08);
		gain.gain.setValueAtTime(0.0001, time);
		gain.gain.exponentialRampToValueAtTime(0.055, time + 0.008);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
		osc.connect(filter);
		filter.connect(gain);
		gain.connect(music);
		osc.start(time);
		osc.stop(time + 0.1);
	}

	private pad(time: number, chord: number[]) {
		const ctx = this.ctx;
		const duck = this.duck;
		if (!ctx || !duck) return;
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(880, time);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, time);
		gain.gain.exponentialRampToValueAtTime(0.035, time + 0.18);
		gain.gain.setValueAtTime(0.035, time + 1.05);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.35);
		filter.connect(gain);
		gain.connect(duck);
		for (const note of chord) {
			for (const detune of [-7, 7]) {
				const osc = ctx.createOscillator();
				osc.type = "sawtooth";
				osc.frequency.setValueAtTime(midi(note), time);
				osc.detune.setValueAtTime(detune, time);
				osc.connect(filter);
				osc.start(time);
				osc.stop(time + 1.4);
			}
		}
	}

	private kick(time: number) {
		const ctx = this.ctx;
		const music = this.music;
		if (!ctx || !music) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(148, time);
		osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);
		gain.gain.setValueAtTime(0.72, time);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
		osc.connect(gain);
		gain.connect(music);
		osc.start(time);
		osc.stop(time + 0.22);
	}

	private clap(time: number) {
		this.noiseHit(time, 1700, 0.09, 0.16, "bandpass");
		this.noiseHit(time + 0.012, 1700, 0.08, 0.1, "bandpass");
	}

	private hat(time: number, open: boolean) {
		this.noiseHit(time, 7200, open ? 0.12 : 0.035, open ? 0.07 : 0.045, "highpass");
	}

	private duckAt(time: number) {
		const duck = this.duck;
		if (!duck) return;
		duck.gain.setValueAtTime(0.32, time);
		duck.gain.linearRampToValueAtTime(1, time + 0.15);
	}

	private noiseHit(
		time: number,
		freq: number,
		decay: number,
		level: number,
		type: BiquadFilterType = "lowpass",
	) {
		const ctx = this.ctx;
		const noise = this.noise;
		const dest = type === "lowpass" ? this.sfx : this.music;
		if (!ctx || !noise || !dest) return;
		const source = ctx.createBufferSource();
		source.buffer = noise;
		const filter = ctx.createBiquadFilter();
		filter.type = type;
		filter.frequency.setValueAtTime(freq, time);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(level, time);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
		source.connect(filter);
		filter.connect(gain);
		gain.connect(dest);
		source.start(time);
		source.stop(time + decay + 0.02);
	}

	private tone(time: number, freq: number, decay: number, type: OscillatorType, level: number) {
		const ctx = this.ctx;
		const sfx = this.sfx;
		if (!ctx || !sfx) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, time);
		gain.gain.setValueAtTime(level, time);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
		osc.connect(gain);
		gain.connect(sfx);
		osc.start(time);
		osc.stop(time + decay + 0.02);
	}
}
