export type PortKind = "audio" | "cv";

export type PortDef = {
	id: string;
	label: string;
	kind: PortKind;
};

export type KnobDef = {
	id: string;
	label: string;
	min: number;
	max: number;
	step: number;
	default: number;
	unit?: string;
	/** Discrete choices — rendered as buttons, not a slider */
	options?: readonly string[];
};

export type ModuleType =
	| "output"
	| "vco"
	| "lfo"
	| "vcf"
	| "vca"
	| "noise"
	| "envelope"
	| "mixer"
	| "delay"
	| "reverb"
	| "distortion"
	| "chorus"
	| "phaser"
	| "bitcrush"
	| "ringmod"
	| "samplehold"
	| "keyboard"
	| "pianoroll";

export type ModuleGroupId = "sources" | "modulation" | "routing" | "effects";

export type ModuleDef = {
	type: ModuleType;
	label: string;
	short: string;
	about: string;
	group: ModuleGroupId;
	tint: string;
	width: number;
	inputs: PortDef[];
	outputs: PortDef[];
	knobs: KnobDef[];
};

export const MODULE_GROUPS: { id: ModuleGroupId; label: string }[] = [
	{ id: "sources", label: "Sources" },
	{ id: "modulation", label: "Modulation" },
	{ id: "routing", label: "Filter & Mix" },
	{ id: "effects", label: "Effects" },
];

export const MODULES: Record<ModuleType, ModuleDef> = {
	output: {
		type: "output",
		label: "Output",
		short: "OUT",
		about: "Master speaker level for the rack.",
		group: "routing",
		tint: "#3d4a3a",
		width: 140,
		inputs: [{ id: "in", label: "IN", kind: "audio" }],
		outputs: [],
		knobs: [
			{ id: "gain", label: "LVL", min: 0, max: 1, step: 0.01, default: 0.35 },
		],
	},
	vco: {
		type: "vco",
		label: "VCO",
		short: "VCO",
		about: "Audio oscillator — the main tone source.",
		group: "sources",
		tint: "#4a3d32",
		width: 168,
		inputs: [
			{ id: "fm", label: "FM", kind: "cv" },
			{ id: "pw", label: "PW", kind: "cv" },
		],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "freq", label: "FREQ", min: 0, max: 2000, step: 1, default: 220, unit: "Hz" },
			{ id: "fine", label: "FINE", min: -100, max: 100, step: 1, default: 0, unit: "¢" },
			{ id: "wave", label: "WAVE", min: 0, max: 3, step: 1, default: 0, options: ["SIN", "SQR", "SAW", "TRI"] },
			{ id: "pw", label: "PW", min: 0.05, max: 0.95, step: 0.01, default: 0.5 },
		],
	},
	lfo: {
		type: "lfo",
		label: "LFO",
		short: "LFO",
		about: "Slow oscillator for sweeping filters and pitch.",
		group: "modulation",
		tint: "#32404a",
		width: 160,
		inputs: [{ id: "fm", label: "FM", kind: "cv" }],
		outputs: [
			{ id: "out", label: "OUT", kind: "cv" },
			{ id: "audio", label: "AUD", kind: "audio" },
		],
		knobs: [
			{ id: "rate", label: "RATE", min: 0.05, max: 30, step: 0.01, default: 2, unit: "Hz" },
			{ id: "depth", label: "DEPTH", min: 0, max: 1, step: 0.01, default: 0.5 },
			{ id: "wave", label: "WAVE", min: 0, max: 3, step: 1, default: 0, options: ["SIN", "SQR", "SAW", "TRI"] },
		],
	},
	vcf: {
		type: "vcf",
		label: "VCF",
		short: "VCF",
		about: "Filter that shapes brightness and resonance.",
		group: "routing",
		tint: "#3a3d4a",
		width: 168,
		inputs: [
			{ id: "in", label: "IN", kind: "audio" },
			{ id: "cutoff", label: "CV", kind: "cv" },
			{ id: "q", label: "Q", kind: "cv" },
		],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "cutoff", label: "CUT", min: 40, max: 12000, step: 1, default: 1800, unit: "Hz" },
			{ id: "q", label: "RES", min: 0.1, max: 24, step: 0.1, default: 4 },
			{ id: "type", label: "TYPE", min: 0, max: 2, step: 1, default: 0, options: ["LP", "HP", "BP"] },
		],
	},
	vca: {
		type: "vca",
		label: "VCA",
		short: "VCA",
		about: "Volume gate — open and close amplitude with CV.",
		group: "routing",
		tint: "#3d3a32",
		width: 148,
		inputs: [
			{ id: "in", label: "IN", kind: "audio" },
			{ id: "cv", label: "CV", kind: "cv" },
		],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "gain", label: "GAIN", min: 0, max: 1, step: 0.01, default: 0.7 },
			{ id: "bias", label: "BIAS", min: 0, max: 1, step: 0.01, default: 0 },
		],
	},
	noise: {
		type: "noise",
		label: "Noise",
		short: "NOIS",
		about: "White, pink, or brown noise for texture and hats.",
		group: "sources",
		tint: "#3a3532",
		width: 140,
		inputs: [],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "color", label: "COLOR", min: 0, max: 2, step: 1, default: 0, options: ["WHT", "PNK", "BRN"] },
			{ id: "level", label: "LVL", min: 0, max: 1, step: 0.01, default: 0.4 },
		],
	},
	envelope: {
		type: "envelope",
		label: "Envelope",
		short: "ENV",
		about: "ADSR contour for plucks, pads, and fades.",
		group: "modulation",
		tint: "#463a32",
		width: 168,
		inputs: [{ id: "gate", label: "GATE", kind: "cv" }],
		outputs: [{ id: "out", label: "OUT", kind: "cv" }],
		knobs: [
			{ id: "attack", label: "A", min: 0.001, max: 2, step: 0.001, default: 0.02, unit: "s" },
			{ id: "decay", label: "D", min: 0.001, max: 2, step: 0.001, default: 0.2, unit: "s" },
			{ id: "sustain", label: "S", min: 0, max: 1, step: 0.01, default: 0.6 },
			{ id: "release", label: "R", min: 0.001, max: 3, step: 0.001, default: 0.4, unit: "s" },
		],
	},
	mixer: {
		type: "mixer",
		label: "Mixer",
		short: "MIX",
		about: "Blend up to three audio signals together.",
		group: "routing",
		tint: "#323a3d",
		width: 160,
		inputs: [
			{ id: "a", label: "A", kind: "audio" },
			{ id: "b", label: "B", kind: "audio" },
			{ id: "c", label: "C", kind: "audio" },
		],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "a", label: "A", min: 0, max: 1, step: 0.01, default: 0.7 },
			{ id: "b", label: "B", min: 0, max: 1, step: 0.01, default: 0.7 },
			{ id: "c", label: "C", min: 0, max: 1, step: 0.01, default: 0.7 },
			{ id: "master", label: "MST", min: 0, max: 1, step: 0.01, default: 0.8 },
		],
	},
	delay: {
		type: "delay",
		label: "Delay",
		short: "DLY",
		about: "Echo repeats with feedback and wet/dry mix.",
		group: "effects",
		tint: "#3a4632",
		width: 160,
		inputs: [
			{ id: "in", label: "IN", kind: "audio" },
			{ id: "time", label: "TIME", kind: "cv" },
		],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "time", label: "TIME", min: 0.01, max: 1, step: 0.01, default: 0.25, unit: "s" },
			{ id: "feedback", label: "FB", min: 0, max: 0.95, step: 0.01, default: 0.4 },
			{ id: "mix", label: "MIX", min: 0, max: 1, step: 0.01, default: 0.35 },
		],
	},
	reverb: {
		type: "reverb",
		label: "Reverb",
		short: "RVB",
		about: "Room wash that places the sound in a space.",
		group: "effects",
		tint: "#32463a",
		width: 160,
		inputs: [{ id: "in", label: "IN", kind: "audio" }],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "decay", label: "DEC", min: 0.2, max: 4, step: 0.05, default: 1.6, unit: "s" },
			{ id: "mix", label: "MIX", min: 0, max: 1, step: 0.01, default: 0.3 },
		],
	},
	distortion: {
		type: "distortion",
		label: "Distort",
		short: "DST",
		about: "Drive and grit with a tone control.",
		group: "effects",
		tint: "#4a3232",
		width: 148,
		inputs: [{ id: "in", label: "IN", kind: "audio" }],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "drive", label: "DRV", min: 1, max: 40, step: 0.5, default: 8 },
			{ id: "tone", label: "TONE", min: 200, max: 8000, step: 10, default: 2400, unit: "Hz" },
			{ id: "mix", label: "MIX", min: 0, max: 1, step: 0.01, default: 0.55 },
		],
	},
	chorus: {
		type: "chorus",
		label: "Chorus",
		short: "CHO",
		about: "Detuned doubling for width and shimmer.",
		group: "effects",
		tint: "#323a46",
		width: 160,
		inputs: [{ id: "in", label: "IN", kind: "audio" }],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "rate", label: "RATE", min: 0.1, max: 8, step: 0.05, default: 1.4, unit: "Hz" },
			{ id: "depth", label: "DEPTH", min: 0.001, max: 0.02, step: 0.001, default: 0.006, unit: "s" },
			{ id: "mix", label: "MIX", min: 0, max: 1, step: 0.01, default: 0.45 },
		],
	},
	phaser: {
		type: "phaser",
		label: "Phaser",
		short: "PHS",
		about: "Sweeping notches for that classic swirl.",
		group: "effects",
		tint: "#3a3246",
		width: 160,
		inputs: [{ id: "in", label: "IN", kind: "audio" }],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "rate", label: "RATE", min: 0.05, max: 6, step: 0.05, default: 0.6, unit: "Hz" },
			{ id: "depth", label: "DEPTH", min: 100, max: 2000, step: 10, default: 800, unit: "Hz" },
			{ id: "feedback", label: "FB", min: 0, max: 0.9, step: 0.01, default: 0.4 },
			{ id: "mix", label: "MIX", min: 0, max: 1, step: 0.01, default: 0.5 },
		],
	},
	bitcrush: {
		type: "bitcrush",
		label: "Bitcrush",
		short: "BIT",
		about: "Lo-fi crunch by crushing bits and rate.",
		group: "effects",
		tint: "#463246",
		width: 148,
		inputs: [{ id: "in", label: "IN", kind: "audio" }],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "bits", label: "BITS", min: 2, max: 16, step: 1, default: 6 },
			{ id: "rate", label: "RATE", min: 0.05, max: 1, step: 0.01, default: 0.35 },
			{ id: "mix", label: "MIX", min: 0, max: 1, step: 0.01, default: 0.7 },
		],
	},
	ringmod: {
		type: "ringmod",
		label: "Ring Mod",
		short: "RNG",
		about: "Multiply two signals for metallic clang.",
		group: "effects",
		tint: "#463a3a",
		width: 148,
		inputs: [
			{ id: "carrier", label: "CAR", kind: "audio" },
			{ id: "mod", label: "MOD", kind: "audio" },
		],
		outputs: [{ id: "out", label: "OUT", kind: "audio" }],
		knobs: [
			{ id: "mix", label: "MIX", min: 0, max: 1, step: 0.01, default: 1 },
		],
	},
	samplehold: {
		type: "samplehold",
		label: "S&H",
		short: "S&H",
		about: "Stepped random voltages for chaotic CV.",
		group: "modulation",
		tint: "#3a463a",
		width: 148,
		inputs: [
			{ id: "in", label: "IN", kind: "cv" },
			{ id: "clock", label: "CLK", kind: "cv" },
		],
		outputs: [{ id: "out", label: "OUT", kind: "cv" }],
		knobs: [
			{ id: "rate", label: "RATE", min: 0.5, max: 20, step: 0.1, default: 4, unit: "Hz" },
			{ id: "smooth", label: "GLIDE", min: 0.001, max: 0.5, step: 0.001, default: 0.02, unit: "s" },
		],
	},
	keyboard: {
		type: "keyboard",
		label: "Keys",
		short: "KEY",
		about: "Play pitch CV and gate from on-screen keys.",
		group: "sources",
		tint: "#323232",
		width: 300,
		inputs: [],
		outputs: [
			{ id: "cv", label: "CV", kind: "cv" },
			{ id: "gate", label: "GATE", kind: "cv" },
		],
		knobs: [
			{ id: "octave", label: "OCT", min: 1, max: 5, step: 1, default: 3, options: ["1", "2", "3", "4", "5"] },
		],
	},
	pianoroll: {
		type: "pianoroll",
		label: "Piano Roll",
		short: "ROLL",
		about: "Full-range looping piano roll with BPM and bar length.",
		group: "sources",
		tint: "#2e3230",
		width: 480,
		inputs: [],
		outputs: [
			{ id: "cv", label: "CV", kind: "cv" },
			{ id: "gate", label: "GATE", kind: "cv" },
		],
		knobs: [],
	},
};

export type ModulePower = "on" | "thru" | "off";

/** Effects get ON / THRU / OFF; sources and utilities get ON / OFF. */
export function powerOptions(type: ModuleType): ModulePower[] {
	switch (type) {
		case "vcf":
		case "vca":
		case "delay":
		case "reverb":
		case "distortion":
		case "chorus":
		case "phaser":
		case "bitcrush":
			return ["on", "thru", "off"];
		default:
			return ["on", "off"];
	}
}

export function powerLabel(power: ModulePower): string {
	if (power === "on") return "ON";
	if (power === "thru") return "THRU";
	return "OFF";
}

export const ADDABLE: ModuleType[] = [
	"vco",
	"lfo",
	"vcf",
	"vca",
	"noise",
	"envelope",
	"mixer",
	"delay",
	"reverb",
	"distortion",
	"chorus",
	"phaser",
	"bitcrush",
	"ringmod",
	"samplehold",
	"keyboard",
	"pianoroll",
];

export function modulesInGroup(group: ModuleGroupId): ModuleDef[] {
	return ADDABLE.map((type) => MODULES[type]).filter((m) => m.group === group);
}

export const WAVE_LABELS = ["SIN", "SQR", "SAW", "TRI"] as const;
export const FILTER_LABELS = ["LP", "HP", "BP"] as const;
export const NOISE_LABELS = ["WHT", "PNK", "BRN"] as const;

export function defaultParams(type: ModuleType): Record<string, number> {
	const out: Record<string, number> = {};
	for (const knob of MODULES[type].knobs) out[knob.id] = knob.default;
	return out;
}

export function formatKnob(type: ModuleType, id: string, value: number): string {
	const knob = MODULES[type].knobs.find((k) => k.id === id);
	if (!knob) return String(value);
	if (id === "wave") return WAVE_LABELS[Math.round(value)] ?? "SIN";
	if (id === "type" && type === "vcf") return FILTER_LABELS[Math.round(value)] ?? "LP";
	if (id === "color" && type === "noise") return NOISE_LABELS[Math.round(value)] ?? "WHT";
	if (knob.unit === "Hz") {
		if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
		return value < 10 ? value.toFixed(2) : String(Math.round(value));
	}
	if (knob.unit === "s") return value < 0.1 ? value.toFixed(3) : value.toFixed(2);
	if (knob.step < 0.1) return value.toFixed(2);
	if (Number.isInteger(knob.step)) return String(Math.round(value));
	return value.toFixed(2);
}
