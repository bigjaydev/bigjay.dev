import type { ModulePower, ModuleType } from "./modules";

type Wire = {
	fromId: string;
	fromPort: string;
	toId: string;
	toPort: string;
};

type BuiltModule = {
	type: ModuleType;
	params: Record<string, number>;
	inputs: Record<string, AudioNode>;
	outputs: Record<string, AudioNode>;
	cvTargets: Record<string, AudioParam>;
	dispose: () => void;
	setParam: (key: string, value: number) => void;
	noteOn?: (freq: number) => void;
	noteOff?: () => void;
	trigger?: () => void;
};

type ModuleInstance = BuiltModule & {
	setPower: (power: ModulePower) => void;
};

const THRU_TYPES = new Set<ModuleType>([
	"vcf",
	"vca",
	"delay",
	"reverb",
	"distortion",
	"chorus",
	"phaser",
	"bitcrush",
]);

function waveType(n: number): OscillatorType {
	return (["sine", "square", "sawtooth", "triangle"] as const)[Math.round(n)] ?? "sine";
}

function filterType(n: number): BiquadFilterType {
	return (["lowpass", "highpass", "bandpass"] as const)[Math.round(n)] ?? "lowpass";
}

function makeNoiseBuffer(ctx: AudioContext, color: number): AudioBuffer {
	const length = ctx.sampleRate * 2;
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	let last = 0;
	for (let i = 0; i < length; i++) {
		const white = Math.random() * 2 - 1;
		if (color < 0.5) {
			data[i] = white;
		} else if (color < 1.5) {
			last = (last + 0.02 * white) / 1.02;
			data[i] = last * 3.5;
		} else {
			last = (last + 0.02 * white) / 1.02;
			const brown = (last + 0.02 * white) / 1.02;
			last = brown;
			data[i] = brown * 3.5;
		}
	}
	return buffer;
}

function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
	const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
	const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const data = buffer.getChannelData(ch);
		for (let i = 0; i < length; i++) {
			data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.2);
		}
	}
	return buffer;
}

function makeShaper(amount: number): Float32Array<ArrayBuffer> {
	const n = 256;
	const curve = new Float32Array(new ArrayBuffer(n * 4));
	const k = Math.max(1, amount);
	for (let i = 0; i < n; i++) {
		const x = (i * 2) / n - 1;
		curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
	}
	return curve;
}

function makeBitcrushCurve(bits: number): Float32Array<ArrayBuffer> {
	const n = 256;
	const curve = new Float32Array(new ArrayBuffer(n * 4));
	const steps = Math.pow(2, Math.max(2, Math.round(bits))) - 1;
	for (let i = 0; i < n; i++) {
		const x = (i * 2) / n - 1;
		curve[i] = Math.round(x * steps) / steps;
	}
	return curve;
}

export class AudioEngine {
	ctx: AudioContext | null = null;
	private modules = new Map<string, ModuleInstance>();
	private wires: Wire[] = [];
	private live = new Map<string, AudioNode[]>();
	master: GainNode | null = null;

	async resume(): Promise<void> {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			this.master = this.ctx.createGain();
			this.master.gain.value = 1;
			this.master.connect(this.ctx.destination);
		}
		if (this.ctx.state !== "running") await this.ctx.resume();
	}

	async suspend(): Promise<void> {
		if (this.ctx?.state === "running") await this.ctx.suspend();
	}

	get running(): boolean {
		return this.ctx?.state === "running";
	}

	has(id: string): boolean {
		return this.modules.has(id);
	}

	ids(): string[] {
		return [...this.modules.keys()];
	}

	create(
		id: string,
		type: ModuleType,
		params: Record<string, number>,
		power: ModulePower = "on",
	): void {
		if (!this.ctx || !this.master) return;
		if (this.modules.has(id)) this.remove(id);
		const instance = this.installPower(this.build(type, params), power);
		this.modules.set(id, instance);
		this.rewire();
	}

	remove(id: string): void {
		const mod = this.modules.get(id);
		if (!mod) return;
		this.wires = this.wires.filter((w) => w.fromId !== id && w.toId !== id);
		mod.dispose();
		this.modules.delete(id);
		this.rewire();
	}

	sync(
		nodes: {
			id: string;
			type: ModuleType;
			params: Record<string, number>;
			power: ModulePower;
		}[],
		wires: Wire[],
	): void {
		if (!this.ctx || !this.master) return;
		const keep = new Set(nodes.map((n) => n.id));
		for (const id of this.ids()) {
			if (!keep.has(id)) this.remove(id);
		}
		for (const node of nodes) {
			if (!this.modules.has(node.id)) {
				this.create(node.id, node.type, node.params, node.power);
			} else {
				this.setPower(node.id, node.power);
			}
		}
		this.setWires(wires);
	}

	setParam(id: string, key: string, value: number): void {
		const mod = this.modules.get(id);
		if (!mod) return;
		mod.params[key] = value;
		mod.setParam(key, value);
	}

	setPower(id: string, power: ModulePower): void {
		this.modules.get(id)?.setPower(power);
	}

	/** Wrap a raw module with ON / THRU / OFF gains. */
	private installPower(raw: BuiltModule, power: ModulePower): ModuleInstance {
		const ctx = this.ctx!;

		if (raw.type === "output" && raw.inputs.in) {
			const gate = ctx.createGain();
			gate.gain.value = power === "on" ? 1 : 0;
			gate.connect(raw.inputs.in);
			return {
				...raw,
				inputs: { in: gate },
				setPower: (next) => {
					gate.gain.setTargetAtTime(next === "on" ? 1 : 0, ctx.currentTime, 0.01);
				},
				dispose: () => {
					gate.disconnect();
					raw.dispose();
				},
			};
		}

		if (THRU_TYPES.has(raw.type) && raw.inputs.in && raw.outputs.out) {
			const input = ctx.createGain();
			const dry = ctx.createGain();
			const wet = ctx.createGain();
			const output = ctx.createGain();
			const apply = (next: ModulePower) => {
				const t = ctx.currentTime;
				dry.gain.setTargetAtTime(next === "thru" ? 1 : 0, t, 0.01);
				wet.gain.setTargetAtTime(next === "on" ? 1 : 0, t, 0.01);
			};
			apply(power);
			input.connect(dry);
			dry.connect(output);
			input.connect(raw.inputs.in);
			raw.outputs.out.connect(wet);
			wet.connect(output);
			return {
				...raw,
				inputs: { ...raw.inputs, in: input },
				outputs: { ...raw.outputs, out: output },
				setPower: apply,
				dispose: () => {
					input.disconnect();
					dry.disconnect();
					wet.disconnect();
					output.disconnect();
					raw.dispose();
				},
			};
		}

		const gates: GainNode[] = [];
		const outputs: Record<string, AudioNode> = {};
		for (const [key, node] of Object.entries(raw.outputs)) {
			const gate = ctx.createGain();
			gate.gain.value = power === "on" ? 1 : 0;
			node.connect(gate);
			gates.push(gate);
			outputs[key] = gate;
		}

		return {
			...raw,
			outputs: Object.keys(outputs).length > 0 ? outputs : raw.outputs,
			setPower: (next) => {
				const t = ctx.currentTime;
				for (const gate of gates) gate.gain.setTargetAtTime(next === "on" ? 1 : 0, t, 0.01);
			},
			dispose: () => {
				for (const gate of gates) gate.disconnect();
				raw.dispose();
			},
		};
	}

	setWires(wires: Wire[]): void {
		this.wires = wires;
		this.rewire();
	}

	noteOn(id: string, freq: number): void {
		this.modules.get(id)?.noteOn?.(freq);
	}

	noteOff(id: string): void {
		this.modules.get(id)?.noteOff?.();
	}

	trigger(id: string): void {
		this.modules.get(id)?.trigger?.();
	}

	private rewire(): void {
		for (const nodes of this.live.values()) {
			for (const n of nodes) {
				try {
					n.disconnect();
				} catch {
					/* already disconnected */
				}
			}
		}
		this.live.clear();

		for (const wire of this.wires) {
			const from = this.modules.get(wire.fromId);
			const to = this.modules.get(wire.toId);
			if (!from || !to) continue;
			const src = from.outputs[wire.fromPort];
			if (!src) continue;

			const audioIn = to.inputs[wire.toPort];
			const cv = to.cvTargets[wire.toPort];
			try {
				if (audioIn) {
					src.connect(audioIn);
					this.track(wire.fromId, src);
				} else if (cv) {
					src.connect(cv);
					this.track(wire.fromId, src);
				}
			} catch {
				/* invalid graph edge */
			}
		}
	}

	private track(id: string, node: AudioNode): void {
		const list = this.live.get(id) ?? [];
		list.push(node);
		this.live.set(id, list);
	}

	private build(type: ModuleType, params: Record<string, number>): BuiltModule {
		const ctx = this.ctx!;
		const p = { ...params };

		switch (type) {
			case "output":
				return this.buildOutput(p);
			case "vco":
				return this.buildVco(ctx, p);
			case "lfo":
				return this.buildLfo(ctx, p);
			case "vcf":
				return this.buildVcf(ctx, p);
			case "vca":
				return this.buildVca(ctx, p);
			case "noise":
				return this.buildNoise(ctx, p);
			case "envelope":
				return this.buildEnvelope(ctx, p);
			case "mixer":
				return this.buildMixer(ctx, p);
			case "delay":
				return this.buildDelay(ctx, p);
			case "reverb":
				return this.buildReverb(ctx, p);
			case "distortion":
				return this.buildDistortion(ctx, p);
			case "chorus":
				return this.buildChorus(ctx, p);
			case "phaser":
				return this.buildPhaser(ctx, p);
			case "bitcrush":
				return this.buildBitcrush(ctx, p);
			case "ringmod":
				return this.buildRingmod(ctx, p);
			case "samplehold":
				return this.buildSampleHold(ctx, p);
			case "keyboard":
				return this.buildKeyboard(ctx, p, "keyboard");
			case "pianoroll":
				return this.buildKeyboard(ctx, p, "pianoroll");
		}
	}

	private buildOutput(p: Record<string, number>): BuiltModule {
		const ctx = this.ctx!;
		const gain = ctx.createGain();
		gain.gain.value = p.gain ?? 0.35;
		gain.connect(this.master!);
		return {
			type: "output",
			params: p,
			inputs: { in: gain },
			outputs: {},
			cvTargets: {},
			dispose: () => gain.disconnect(),
			setParam: (key, value) => {
				if (key === "gain") gain.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
			},
		};
	}

	private buildVco(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const osc = ctx.createOscillator();
		const out = ctx.createGain();
		out.gain.value = 0.35;
		osc.type = waveType(p.wave ?? 0);
		osc.frequency.value = p.freq ?? 220;
		osc.detune.value = p.fine ?? 0;
		osc.connect(out);
		osc.start();

		const pwGain = ctx.createGain();
		pwGain.gain.value = 0;

		return {
			type: "vco",
			params: p,
			inputs: {},
			outputs: { out },
			cvTargets: { fm: osc.frequency, pw: pwGain.gain },
			dispose: () => {
				osc.stop();
				osc.disconnect();
				out.disconnect();
				pwGain.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "freq") osc.frequency.setTargetAtTime(value, t, 0.01);
				if (key === "fine") osc.detune.setTargetAtTime(value, t, 0.01);
				if (key === "wave") osc.type = waveType(value);
			},
		};
	}

	private buildLfo(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const osc = ctx.createOscillator();
		const depth = ctx.createGain();
		const audio = ctx.createGain();
		osc.type = waveType(p.wave ?? 0);
		osc.frequency.value = p.rate ?? 2;
		depth.gain.value = (p.depth ?? 0.5) * 400;
		audio.gain.value = 0.2;
		osc.connect(depth);
		osc.connect(audio);
		osc.start();

		return {
			type: "lfo",
			params: p,
			inputs: {},
			outputs: { out: depth, audio },
			cvTargets: { fm: osc.frequency },
			dispose: () => {
				osc.stop();
				osc.disconnect();
				depth.disconnect();
				audio.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "rate") osc.frequency.setTargetAtTime(value, t, 0.02);
				if (key === "depth") depth.gain.setTargetAtTime(value * 400, t, 0.02);
				if (key === "wave") osc.type = waveType(value);
			},
		};
	}

	private buildVcf(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const filter = ctx.createBiquadFilter();
		filter.type = filterType(p.type ?? 0);
		filter.frequency.value = p.cutoff ?? 1800;
		filter.Q.value = p.q ?? 4;
		return {
			type: "vcf",
			params: p,
			inputs: { in: filter },
			outputs: { out: filter },
			cvTargets: { cutoff: filter.frequency, q: filter.Q },
			dispose: () => filter.disconnect(),
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "cutoff") filter.frequency.setTargetAtTime(value, t, 0.01);
				if (key === "q") filter.Q.setTargetAtTime(value, t, 0.01);
				if (key === "type") filter.type = filterType(value);
			},
		};
	}

	private buildVca(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const gain = ctx.createGain();
		const bias = ctx.createConstantSource();
		bias.offset.value = p.bias ?? 0;
		gain.gain.value = p.gain ?? 0.7;
		bias.connect(gain.gain);
		bias.start();
		return {
			type: "vca",
			params: p,
			inputs: { in: gain },
			outputs: { out: gain },
			cvTargets: { cv: gain.gain },
			dispose: () => {
				bias.stop();
				bias.disconnect();
				gain.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "gain") gain.gain.setTargetAtTime(value, t, 0.01);
				if (key === "bias") bias.offset.setTargetAtTime(value, t, 0.01);
			},
		};
	}

	private buildNoise(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const src = ctx.createBufferSource();
		const gain = ctx.createGain();
		src.buffer = makeNoiseBuffer(ctx, p.color ?? 0);
		src.loop = true;
		gain.gain.value = p.level ?? 0.4;
		src.connect(gain);
		src.start();
		return {
			type: "noise",
			params: p,
			inputs: {},
			outputs: { out: gain },
			cvTargets: {},
			dispose: () => {
				src.stop();
				src.disconnect();
				gain.disconnect();
			},
			setParam: (key, value) => {
				if (key === "level") gain.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
				if (key === "color") {
					src.buffer = makeNoiseBuffer(ctx, value);
				}
			},
		};
	}

	private buildEnvelope(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const out = ctx.createConstantSource();
		const gateIn = ctx.createGain();
		out.offset.value = 0;
		gateIn.gain.value = 0;
		out.start();

		const fire = (on: boolean) => {
			const t = ctx.currentTime;
			const a = p.attack ?? 0.02;
			const d = p.decay ?? 0.2;
			const s = p.sustain ?? 0.6;
			const r = p.release ?? 0.4;
			out.offset.cancelScheduledValues(t);
			out.offset.setValueAtTime(Math.max(0.0001, out.offset.value), t);
			if (on) {
				out.offset.linearRampToValueAtTime(1, t + a);
				out.offset.linearRampToValueAtTime(s, t + a + d);
			} else {
				out.offset.linearRampToValueAtTime(0.0001, t + r);
			}
		};

		return {
			type: "envelope",
			params: p,
			inputs: { gate: gateIn },
			outputs: { out },
			cvTargets: {},
			dispose: () => {
				out.stop();
				out.disconnect();
				gateIn.disconnect();
			},
			setParam: (key, value) => {
				p[key] = value;
			},
			trigger: () => {
				fire(true);
				const hold = (p.attack ?? 0.02) + (p.decay ?? 0.2) + 0.15;
				window.setTimeout(() => fire(false), hold * 1000);
			},
			noteOn: () => fire(true),
			noteOff: () => fire(false),
		};
	}

	private buildMixer(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const a = ctx.createGain();
		const b = ctx.createGain();
		const c = ctx.createGain();
		const master = ctx.createGain();
		a.gain.value = p.a ?? 0.7;
		b.gain.value = p.b ?? 0.7;
		c.gain.value = p.c ?? 0.7;
		master.gain.value = p.master ?? 0.8;
		a.connect(master);
		b.connect(master);
		c.connect(master);
		return {
			type: "mixer",
			params: p,
			inputs: { a, b, c },
			outputs: { out: master },
			cvTargets: {},
			dispose: () => {
				a.disconnect();
				b.disconnect();
				c.disconnect();
				master.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "a") a.gain.setTargetAtTime(value, t, 0.01);
				if (key === "b") b.gain.setTargetAtTime(value, t, 0.01);
				if (key === "c") c.gain.setTargetAtTime(value, t, 0.01);
				if (key === "master") master.gain.setTargetAtTime(value, t, 0.01);
			},
		};
	}

	private buildDelay(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const input = ctx.createGain();
		const delay = ctx.createDelay(2);
		const feedback = ctx.createGain();
		const wet = ctx.createGain();
		const dry = ctx.createGain();
		const out = ctx.createGain();
		delay.delayTime.value = p.time ?? 0.25;
		feedback.gain.value = p.feedback ?? 0.4;
		const mix = p.mix ?? 0.35;
		wet.gain.value = mix;
		dry.gain.value = 1 - mix;
		input.connect(dry);
		input.connect(delay);
		delay.connect(feedback);
		feedback.connect(delay);
		delay.connect(wet);
		dry.connect(out);
		wet.connect(out);
		return {
			type: "delay",
			params: p,
			inputs: { in: input },
			outputs: { out },
			cvTargets: { time: delay.delayTime },
			dispose: () => {
				input.disconnect();
				delay.disconnect();
				feedback.disconnect();
				wet.disconnect();
				dry.disconnect();
				out.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "time") delay.delayTime.setTargetAtTime(value, t, 0.02);
				if (key === "feedback") feedback.gain.setTargetAtTime(value, t, 0.02);
				if (key === "mix") {
					wet.gain.setTargetAtTime(value, t, 0.02);
					dry.gain.setTargetAtTime(1 - value, t, 0.02);
				}
			},
		};
	}

	private buildReverb(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const input = ctx.createGain();
		const convolver = ctx.createConvolver();
		const wet = ctx.createGain();
		const dry = ctx.createGain();
		const out = ctx.createGain();
		convolver.buffer = makeImpulse(ctx, p.decay ?? 1.6);
		const mix = p.mix ?? 0.3;
		wet.gain.value = mix;
		dry.gain.value = 1 - mix;
		input.connect(dry);
		input.connect(convolver);
		convolver.connect(wet);
		dry.connect(out);
		wet.connect(out);
		return {
			type: "reverb",
			params: p,
			inputs: { in: input },
			outputs: { out },
			cvTargets: {},
			dispose: () => {
				input.disconnect();
				convolver.disconnect();
				wet.disconnect();
				dry.disconnect();
				out.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "decay") convolver.buffer = makeImpulse(ctx, value);
				if (key === "mix") {
					wet.gain.setTargetAtTime(value, t, 0.02);
					dry.gain.setTargetAtTime(1 - value, t, 0.02);
				}
			},
		};
	}

	private buildDistortion(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const input = ctx.createGain();
		const shaper = ctx.createWaveShaper();
		const tone = ctx.createBiquadFilter();
		const wet = ctx.createGain();
		const dry = ctx.createGain();
		const out = ctx.createGain();
		shaper.curve = makeShaper(p.drive ?? 8);
		tone.type = "lowpass";
		tone.frequency.value = p.tone ?? 2400;
		const mix = p.mix ?? 0.55;
		wet.gain.value = mix;
		dry.gain.value = 1 - mix;
		input.connect(dry);
		input.connect(shaper);
		shaper.connect(tone);
		tone.connect(wet);
		dry.connect(out);
		wet.connect(out);
		return {
			type: "distortion",
			params: p,
			inputs: { in: input },
			outputs: { out },
			cvTargets: {},
			dispose: () => {
				input.disconnect();
				shaper.disconnect();
				tone.disconnect();
				wet.disconnect();
				dry.disconnect();
				out.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "drive") shaper.curve = makeShaper(value);
				if (key === "tone") tone.frequency.setTargetAtTime(value, t, 0.02);
				if (key === "mix") {
					wet.gain.setTargetAtTime(value, t, 0.02);
					dry.gain.setTargetAtTime(1 - value, t, 0.02);
				}
			},
		};
	}

	private buildChorus(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const input = ctx.createGain();
		const delay = ctx.createDelay(0.05);
		const lfo = ctx.createOscillator();
		const depth = ctx.createGain();
		const wet = ctx.createGain();
		const dry = ctx.createGain();
		const out = ctx.createGain();
		delay.delayTime.value = 0.012;
		lfo.frequency.value = p.rate ?? 1.4;
		depth.gain.value = p.depth ?? 0.006;
		const mix = p.mix ?? 0.45;
		wet.gain.value = mix;
		dry.gain.value = 1 - mix;
		lfo.connect(depth);
		depth.connect(delay.delayTime);
		input.connect(dry);
		input.connect(delay);
		delay.connect(wet);
		dry.connect(out);
		wet.connect(out);
		lfo.start();
		return {
			type: "chorus",
			params: p,
			inputs: { in: input },
			outputs: { out },
			cvTargets: {},
			dispose: () => {
				lfo.stop();
				lfo.disconnect();
				input.disconnect();
				delay.disconnect();
				depth.disconnect();
				wet.disconnect();
				dry.disconnect();
				out.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "rate") lfo.frequency.setTargetAtTime(value, t, 0.02);
				if (key === "depth") depth.gain.setTargetAtTime(value, t, 0.02);
				if (key === "mix") {
					wet.gain.setTargetAtTime(value, t, 0.02);
					dry.gain.setTargetAtTime(1 - value, t, 0.02);
				}
			},
		};
	}

	private buildPhaser(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const input = ctx.createGain();
		const stages: BiquadFilterNode[] = [];
		let prev: AudioNode = input;
		for (let i = 0; i < 4; i++) {
			const ap = ctx.createBiquadFilter();
			ap.type = "allpass";
			ap.frequency.value = 300 + i * 200;
			prev.connect(ap);
			stages.push(ap);
			prev = ap;
		}
		const lfo = ctx.createOscillator();
		const depth = ctx.createGain();
		const feedback = ctx.createGain();
		const wet = ctx.createGain();
		const dry = ctx.createGain();
		const out = ctx.createGain();
		lfo.frequency.value = p.rate ?? 0.6;
		depth.gain.value = p.depth ?? 800;
		feedback.gain.value = p.feedback ?? 0.4;
		const mix = p.mix ?? 0.5;
		wet.gain.value = mix;
		dry.gain.value = 1 - mix;
		lfo.connect(depth);
		for (const stage of stages) depth.connect(stage.frequency);
		stages[stages.length - 1].connect(feedback);
		feedback.connect(stages[0]);
		stages[stages.length - 1].connect(wet);
		input.connect(dry);
		dry.connect(out);
		wet.connect(out);
		lfo.start();
		return {
			type: "phaser",
			params: p,
			inputs: { in: input },
			outputs: { out },
			cvTargets: {},
			dispose: () => {
				lfo.stop();
				lfo.disconnect();
				input.disconnect();
				for (const s of stages) s.disconnect();
				depth.disconnect();
				feedback.disconnect();
				wet.disconnect();
				dry.disconnect();
				out.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "rate") lfo.frequency.setTargetAtTime(value, t, 0.02);
				if (key === "depth") depth.gain.setTargetAtTime(value, t, 0.02);
				if (key === "feedback") feedback.gain.setTargetAtTime(value, t, 0.02);
				if (key === "mix") {
					wet.gain.setTargetAtTime(value, t, 0.02);
					dry.gain.setTargetAtTime(1 - value, t, 0.02);
				}
			},
		};
	}

	private buildBitcrush(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const input = ctx.createGain();
		const crush = ctx.createWaveShaper();
		const hold = ctx.createGain();
		const wet = ctx.createGain();
		const dry = ctx.createGain();
		const out = ctx.createGain();
		crush.curve = makeBitcrushCurve(p.bits ?? 6);
		hold.gain.value = p.rate ?? 0.35;
		const mix = p.mix ?? 0.7;
		wet.gain.value = mix;
		dry.gain.value = 1 - mix;
		input.connect(dry);
		input.connect(crush);
		crush.connect(hold);
		hold.connect(wet);
		dry.connect(out);
		wet.connect(out);
		return {
			type: "bitcrush",
			params: p,
			inputs: { in: input },
			outputs: { out },
			cvTargets: {},
			dispose: () => {
				input.disconnect();
				crush.disconnect();
				hold.disconnect();
				wet.disconnect();
				dry.disconnect();
				out.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "bits") crush.curve = makeBitcrushCurve(value);
				if (key === "rate") hold.gain.setTargetAtTime(value, t, 0.02);
				if (key === "mix") {
					wet.gain.setTargetAtTime(value, t, 0.02);
					dry.gain.setTargetAtTime(1 - value, t, 0.02);
				}
			},
		};
	}

	private buildRingmod(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const carrier = ctx.createGain();
		const mod = ctx.createGain();
		const ring = ctx.createGain();
		ring.gain.value = 0;
		const wet = ctx.createGain();
		const dry = ctx.createGain();
		const out = ctx.createGain();
		const mix = p.mix ?? 1;
		wet.gain.value = mix;
		dry.gain.value = 1 - mix;
		carrier.connect(ring);
		mod.connect(ring.gain);
		carrier.connect(dry);
		ring.connect(wet);
		dry.connect(out);
		wet.connect(out);
		return {
			type: "ringmod",
			params: p,
			inputs: { carrier, mod },
			outputs: { out },
			cvTargets: {},
			dispose: () => {
				carrier.disconnect();
				mod.disconnect();
				ring.disconnect();
				wet.disconnect();
				dry.disconnect();
				out.disconnect();
			},
			setParam: (key, value) => {
				const t = ctx.currentTime;
				if (key === "mix") {
					wet.gain.setTargetAtTime(value, t, 0.02);
					dry.gain.setTargetAtTime(1 - value, t, 0.02);
				}
			},
		};
	}

	private buildSampleHold(ctx: AudioContext, p: Record<string, number>): BuiltModule {
		const out = ctx.createConstantSource();
		const clock = ctx.createOscillator();
		const clockGain = ctx.createGain();
		out.offset.value = 0;
		clock.type = "square";
		clock.frequency.value = p.rate ?? 4;
		clockGain.gain.value = 0;
		clock.connect(clockGain);
		out.start();
		clock.start();

		let timer = window.setInterval(() => {
			const glide = p.smooth ?? 0.02;
			const next = Math.random() * 2 - 1;
			out.offset.setTargetAtTime(next * 400, ctx.currentTime, Math.max(0.001, glide / 3));
		}, 1000 / Math.max(0.5, p.rate ?? 4));

		return {
			type: "samplehold",
			params: p,
			inputs: { in: clockGain, clock: clockGain },
			outputs: { out },
			cvTargets: {},
			dispose: () => {
				window.clearInterval(timer);
				out.stop();
				clock.stop();
				out.disconnect();
				clock.disconnect();
				clockGain.disconnect();
			},
			setParam: (key, value) => {
				p[key] = value;
				if (key === "rate") {
					clock.frequency.setTargetAtTime(value, ctx.currentTime, 0.02);
					window.clearInterval(timer);
					timer = window.setInterval(() => {
						const glide = p.smooth ?? 0.02;
						const next = Math.random() * 2 - 1;
						out.offset.setTargetAtTime(next * 400, ctx.currentTime, Math.max(0.001, glide / 3));
					}, 1000 / Math.max(0.5, value));
				}
			},
		};
	}

	private buildKeyboard(
		ctx: AudioContext,
		p: Record<string, number>,
		type: "keyboard" | "pianoroll" = "keyboard",
	): BuiltModule {
		const cv = ctx.createConstantSource();
		const gate = ctx.createConstantSource();
		cv.offset.value = 0;
		gate.offset.value = 0;
		cv.start();
		gate.start();
		return {
			type,
			params: p,
			inputs: {},
			outputs: { cv, gate },
			cvTargets: {},
			dispose: () => {
				cv.stop();
				gate.stop();
				cv.disconnect();
				gate.disconnect();
			},
			setParam: (key, value) => {
				p[key] = value;
			},
			noteOn: (freq) => {
				const t = ctx.currentTime;
				cv.offset.cancelScheduledValues(t);
				cv.offset.setValueAtTime(freq, t);
				gate.offset.cancelScheduledValues(t);
				gate.offset.setValueAtTime(1, t);
			},
			noteOff: () => {
				const t = ctx.currentTime;
				gate.offset.cancelScheduledValues(t);
				gate.offset.setValueAtTime(0, t);
			},
		};
	}
}
