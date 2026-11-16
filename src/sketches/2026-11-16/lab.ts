// Fictional assay. Readings map to a formula by the mechanisms on the cards.

export type Shell = "naked" | "single" | "double";
export type Genome = "plus" | "minus" | "dna" | "dsrna";
export type Dock = "sialic" | "integrin" | "scavenger" | "fusion";
export type Climate = "chill" | "warm" | "acid" | "alkali";
export type Dose = 1 | 2 | 3;
export type Solvent = "saline" | "surfactant" | "delipidant";
export type Active = "ribose" | "polymerase" | "nuclease" | "helicase";
export type Decoy = "glycan" | "peptide" | "lectin" | "clamp";
export type Shape = "sphere" | "helix" | "phage";
export type Voice = "full" | "short" | "terse";
export type ReadingId = "coat" | "genome" | "dock" | "climate" | "dose";
export type Slot = "solvent" | "active" | "decoy" | "climate" | "dose";

export type Stat = {
	mark: string;
	kicker: string;
	value: string;
	unit: string;
	detail: string;
};

export type Specimen = {
	id: string;
	name: string;
	shape: Shape;
	shell: Shell;
	genome: Genome;
	dock: Dock;
	weak: Climate;
	dose: Dose;
	voice: Voice;
	bars: [number, number, number, number];
	coatStat: Stat;
	genomeStat: Stat;
	dockStat: Stat;
};

export type Formula = {
	solvent: Solvent | null;
	active: Active | null;
	decoy: Decoy | null;
	climate: Climate | null;
	dose: Dose | null;
};

export type Card = {
	id: string;
	slot: Slot;
	index: string;
	name: string;
	meta: string;
	blurb: string;
	dose?: Dose;
};

export type AxisReport = {
	reading: ReadingId;
	label: string;
	ok: boolean;
	detail: string;
	noteId: string | null;
};

export type Assay = {
	correct: number;
	total: 5;
	cleared: boolean;
	load: number[];
	axes: AxisReport[];
	summary: string;
};

export const CLIMATES: { id: Climate; label: string }[] = [
	{ id: "chill", label: "Chill" },
	{ id: "warm", label: "Warm" },
	{ id: "acid", label: "Acid" },
	{ id: "alkali", label: "Alkali" },
];

export const READINGS: { id: ReadingId; label: string }[] = [
	{ id: "coat", label: "Coat" },
	{ id: "genome", label: "Genome" },
	{ id: "dock", label: "Dock" },
	{ id: "climate", label: "Climate" },
	{ id: "dose", label: "Dose" },
];

export const SLOTS: { id: Slot; label: string }[] = [
	{ id: "solvent", label: "Solvent" },
	{ id: "active", label: "Active" },
	{ id: "decoy", label: "Decoy" },
	{ id: "climate", label: "Climate" },
	{ id: "dose", label: "Dose" },
];

export const CLIMATE_STAT: Stat = {
	mark: "V",
	kicker: "Climate",
	value: "4-way",
	unit: "viability",
	detail: "Incubate where the bar collapses. Tall bars are the specimen at ease.",
};

export const DOSE_STAT: Stat = {
	mark: "Σ",
	kicker: "Dose",
	value: "spectrum",
	unit: "variants",
	detail: "Each hump is a cluster. Cover every hump, and no more.",
};

export const NOTES: Record<string, string> = {
	"coat:naked": "No lipid. Saline leaves a protein coat intact, and either soap damages it.",
	"coat:single":
		"One lipid fringe. The mild surfactant lifts it. The delipidant goes on into the protein.",
	"coat:double": "Two fringes. Only the delipidant opens the inner one.",
	"genome:plus": "RNA that translates on entry stops under the ribose clamp.",
	"genome:minus": "A packaged polymerase takes the polymerase bait.",
	"genome:dna": "Nuclear DNA falls to the nuclease chip.",
	"genome:dsrna": "A long RNA duplex opens to the helicase wedge.",
	"dock:sialic": "Spikes that clump red cells bind the glycan decoy.",
	"dock:integrin": "RGD spikes take the peptide lock.",
	"dock:scavenger": "Anionic spikes are masked by the lectin cap.",
	"dock:fusion": "A buried fusion peptide stays shut under the loop clamp.",
	climate: "Incubate on the bar that collapses. Tall bars are the specimen at ease.",
	dose: "Cover the humps you can see, and no further. Extra dose blanks the readout.",
};

const SOLVENT_FOR: Record<Shell, Solvent> = {
	naked: "saline",
	single: "surfactant",
	double: "delipidant",
};

const ACTIVE_FOR: Record<Genome, Active> = {
	plus: "ribose",
	minus: "polymerase",
	dna: "nuclease",
	dsrna: "helicase",
};

const DECOY_FOR: Record<Dock, Decoy> = {
	sialic: "glycan",
	integrin: "peptide",
	scavenger: "lectin",
	fusion: "clamp",
};

const LOADS: number[][] = [
	[100, 99, 98, 100, 101, 100, 99, 100],
	[100, 90, 78, 74, 76, 78, 77, 76],
	[100, 84, 66, 54, 50, 52, 51, 50],
	[100, 76, 52, 36, 30, 28, 27, 26],
	[100, 68, 40, 22, 14, 12, 10, 9],
	[100, 60, 32, 16, 7, 3, 1, 0],
];

export const CARDS: Card[] = [
	{
		id: "saline",
		slot: "solvent",
		index: "01",
		name: "Saline",
		meta: "aqueous",
		blurb: "Isotonic wash. Leaves lipid in place and does not harm bare protein.",
	},
	{
		id: "surfactant",
		slot: "solvent",
		index: "02",
		name: "Surfactant",
		meta: "mild",
		blurb: "Mild micelles that strip one lipid bilayer, then stop.",
	},
	{
		id: "delipidant",
		slot: "solvent",
		index: "03",
		name: "Delipidant",
		meta: "harsh",
		blurb: "Strips two bilayers. Too harsh when there is only one, or none.",
	},
	{
		id: "ribose",
		slot: "active",
		index: "01",
		name: "Ribose clamp",
		meta: "ribosome",
		blurb: "Blocks ribosomes, so a strand that translates on entry never starts.",
	},
	{
		id: "polymerase",
		slot: "active",
		index: "02",
		name: "Polymerase bait",
		meta: "enzyme",
		blurb: "Decoy substrate for a polymerase packed inside the virion.",
	},
	{
		id: "nuclease",
		slot: "active",
		index: "03",
		name: "Nuclease chip",
		meta: "DNA",
		blurb: "Cuts DNA on the way to the nucleus. RNA passes through.",
	},
	{
		id: "helicase",
		slot: "active",
		index: "04",
		name: "Helicase wedge",
		meta: "duplex",
		blurb: "Unwinds a long RNA duplex. Single strands have nothing to open.",
	},
	{
		id: "glycan",
		slot: "decoy",
		index: "01",
		name: "Glycan decoy",
		meta: "sialic",
		blurb: "Free sialic acid for spikes that agglutinate red cells.",
	},
	{
		id: "peptide",
		slot: "decoy",
		index: "02",
		name: "Peptide lock",
		meta: "RGD",
		blurb: "An RGD peptide for spikes that bind fibronectin.",
	},
	{
		id: "lectin",
		slot: "decoy",
		index: "03",
		name: "Lectin cap",
		meta: "anion",
		blurb: "Masks anionic spikes so scavenger receptors ignore them.",
	},
	{
		id: "clamp",
		slot: "decoy",
		index: "04",
		name: "Loop clamp",
		meta: "fusion",
		blurb: "Holds a buried fusion peptide shut inside the endosome.",
	},
	{
		id: "chill",
		slot: "climate",
		index: "01",
		name: "Chill",
		meta: "4°",
		blurb: "Cold incubation.",
	},
	{
		id: "warm",
		slot: "climate",
		index: "02",
		name: "Warm",
		meta: "41°",
		blurb: "Heat incubation.",
	},
	{
		id: "acid",
		slot: "climate",
		index: "03",
		name: "Acid",
		meta: "pH 5",
		blurb: "Acid buffer.",
	},
	{
		id: "alkali",
		slot: "climate",
		index: "04",
		name: "Alkali",
		meta: "pH 9",
		blurb: "Alkali buffer.",
	},
	{
		id: "one",
		slot: "dose",
		index: "01",
		name: "One",
		meta: "single",
		blurb: "Covers one cluster. Further peaks escape.",
		dose: 1,
	},
	{
		id: "two",
		slot: "dose",
		index: "02",
		name: "Two",
		meta: "pair",
		blurb: "Covers two clusters. A smear escapes. A single peak blanks.",
		dose: 2,
	},
	{
		id: "smear",
		slot: "dose",
		index: "03",
		name: "Smear",
		meta: "broad",
		blurb: "Covers a broad smear, and blanks anything narrower.",
		dose: 3,
	},
];

export const SPECIMENS: Specimen[] = [
	{
		id: "mote",
		name: "Mote",
		shape: "sphere",
		shell: "single",
		genome: "plus",
		dock: "sialic",
		weak: "warm",
		dose: 1,
		voice: "full",
		bars: [88, 6, 79, 91],
		coatStat: {
			mark: "1×",
			kicker: "Coat",
			value: "8 nm",
			unit: "OsO₄ +",
			detail: "Osmium stain positive. One lipid fringe, about 8 nm thick.",
		},
		genomeStat: {
			mark: "+",
			kicker: "Genome",
			value: "ssRNA",
			unit: "sense +",
			detail: "Positive-sense RNA. Ribosomes translate it as soon as it enters.",
		},
		dockStat: {
			mark: "HA",
			kicker: "Dock",
			value: "4°",
			unit: "red cells",
			detail: "The spikes agglutinate red cells when the dish is cold.",
		},
	},
	{
		id: "spindle",
		name: "Spindle",
		shape: "helix",
		shell: "naked",
		genome: "minus",
		dock: "integrin",
		weak: "acid",
		dose: 2,
		voice: "full",
		bars: [84, 77, 8, 90],
		coatStat: {
			mark: "0×",
			kicker: "Coat",
			value: "protein",
			unit: "OsO₄ −",
			detail: "Osmium stain negative. Protein only, wound as a helix.",
		},
		genomeStat: {
			mark: "−",
			kicker: "Genome",
			value: "ssRNA",
			unit: "sense −",
			detail:
				"Negative-sense RNA. It cannot translate until the polymerase packed in the virion copies it.",
		},
		dockStat: {
			mark: "RGD",
			kicker: "Dock",
			value: "Fn",
			unit: "spread",
			detail: "Spikes display an RGD motif, and cells spread on fibronectin.",
		},
	},
	{
		id: "stack",
		name: "Stack",
		shape: "sphere",
		shell: "double",
		genome: "dna",
		dock: "scavenger",
		weak: "chill",
		dose: 1,
		voice: "short",
		bars: [5, 86, 73, 81],
		coatStat: {
			mark: "2×",
			kicker: "Coat",
			value: "8 + 6",
			unit: "nm rings",
			detail: "Cryo-EM shows two dark rings. The inner ring sits 6 nm under the outer.",
		},
		genomeStat: {
			mark: "D",
			kicker: "Genome",
			value: "dsDNA",
			unit: "nuclear",
			detail: "Double-stranded DNA. Copies are made in the nucleus, not the cytosol.",
		},
		dockStat: {
			mark: "−",
			kicker: "Dock",
			value: "anion",
			unit: "scavenger",
			detail:
				"Surface charge is strongly negative. Uptake is blocked by scavenger-receptor ligands.",
		},
	},
	{
		id: "lantern",
		name: "Lantern",
		shape: "sphere",
		shell: "single",
		genome: "dsrna",
		dock: "fusion",
		weak: "alkali",
		dose: 3,
		voice: "short",
		bars: [82, 74, 93, 7],
		coatStat: {
			mark: "1×",
			kicker: "Coat",
			value: "Sudan",
			unit: "one fringe",
			detail: "A single membrane fringe. Sudan dye takes it up.",
		},
		genomeStat: {
			mark: "ds",
			kicker: "Genome",
			value: "RNA",
			unit: "duplex",
			detail:
				"Both RNA strands are present, paired along the length. They have to be unwound before copying.",
		},
		dockStat: {
			mark: "F",
			kicker: "Dock",
			value: "endo",
			unit: "buried",
			detail: "A fusion peptide hides in the spike and snaps open once the endosome acidifies.",
		},
	},
	{
		id: "knurl",
		name: "Knurl",
		shape: "phage",
		shell: "naked",
		genome: "dsrna",
		dock: "integrin",
		weak: "warm",
		dose: 2,
		voice: "terse",
		bars: [70, 9, 88, 66],
		coatStat: {
			mark: "0×",
			kicker: "Coat",
			value: "protein",
			unit: "no lipid",
			detail: "No lipid density in the map. Head and tail are protein.",
		},
		genomeStat: {
			mark: "ds",
			kicker: "Genome",
			value: "RNA",
			unit: "no enzyme",
			detail: "The particle holds a blunt RNA duplex and no enzyme of its own.",
		},
		dockStat: {
			mark: "RGD",
			kicker: "Dock",
			value: "Fn",
			unit: "blocked",
			detail: "Infection fails on fibronectin-blocked plates. The spike sequence contains RGD.",
		},
	},
];

export function emptyFormula(): Formula {
	return { solvent: null, active: null, decoy: null, climate: null, dose: null };
}

export function fringesOf(shell: Shell): 0 | 1 | 2 {
	if (shell === "naked") return 0;
	if (shell === "single") return 1;
	return 2;
}

export function spectrumFor(dose: Dose): number[] {
	if (dose === 1) return [0, 0.12, 0.48, 1, 0.5, 0.14, 0];
	if (dose === 2) return [0.1, 1, 0.28, 0, 0.16, 0.92, 0.22];
	return [0.48, 0.66, 0.84, 1, 0.9, 0.74, 0.58];
}

export function slotFor(reading: ReadingId): Slot {
	if (reading === "coat") return "solvent";
	if (reading === "genome") return "active";
	if (reading === "dock") return "decoy";
	if (reading === "climate") return "climate";
	return "dose";
}

export function readingFor(slot: Slot): ReadingId {
	if (slot === "solvent") return "coat";
	if (slot === "active") return "genome";
	if (slot === "decoy") return "dock";
	if (slot === "climate") return "climate";
	return "dose";
}

export function statFor(specimen: Specimen, reading: ReadingId): Stat {
	if (reading === "coat") return specimen.coatStat;
	if (reading === "genome") return specimen.genomeStat;
	if (reading === "dock") return specimen.dockStat;
	if (reading === "climate") return CLIMATE_STAT;
	return DOSE_STAT;
}

export function cardsFor(slot: Slot): Card[] {
	return CARDS.filter((card) => card.slot === slot);
}

export function isSelected(formula: Formula, card: Card): boolean {
	switch (card.slot) {
		case "solvent":
			return formula.solvent === card.id;
		case "active":
			return formula.active === card.id;
		case "decoy":
			return formula.decoy === card.id;
		case "climate":
			return formula.climate === card.id;
		case "dose":
			return formula.dose === card.dose;
	}
}

export function applyChoice(formula: Formula, card: Card): Formula {
	const next: Formula = { ...formula };
	const selected = isSelected(formula, card);
	switch (card.slot) {
		case "solvent":
			next.solvent = selected ? null : (card.id as Solvent);
			break;
		case "active":
			next.active = selected ? null : (card.id as Active);
			break;
		case "decoy":
			next.decoy = selected ? null : (card.id as Decoy);
			break;
		case "climate":
			next.climate = selected ? null : (card.id as Climate);
			break;
		case "dose":
			next.dose = selected ? null : (card.dose ?? null);
			break;
	}
	return next;
}

export function choiceLabel(formula: Formula, slot: Slot): string | null {
	const card = cardsFor(slot).find((item) => isSelected(formula, item));
	return card?.name ?? null;
}

export function filledCount(formula: Formula): number {
	return [formula.solvent, formula.active, formula.decoy, formula.climate, formula.dose].filter(
		(value) => value != null,
	).length;
}

export function firstEmpty(formula: Formula): Slot | null {
	if (!formula.solvent) return "solvent";
	if (!formula.active) return "active";
	if (!formula.decoy) return "decoy";
	if (!formula.climate) return "climate";
	if (!formula.dose) return "dose";
	return null;
}

export function answer(specimen: Specimen): Formula {
	return {
		solvent: SOLVENT_FOR[specimen.shell],
		active: ACTIVE_FOR[specimen.genome],
		decoy: DECOY_FOR[specimen.dock],
		climate: specimen.weak,
		dose: specimen.dose,
	};
}

function pick(voice: Voice, full: string, short: string, terse: string): string {
	if (voice === "full") return full;
	if (voice === "short") return short;
	return terse;
}

function coatDetail(
	shell: Shell,
	solvent: Solvent | null,
	voice: Voice,
): { ok: boolean; detail: string; noteId: string | null } {
	if (solvent == null) {
		return {
			ok: false,
			detail: pick(
				voice,
				"No solvent loaded. The coat is untouched.",
				"No solvent loaded.",
				"Empty.",
			),
			noteId: null,
		};
	}
	const ok = solvent === SOLVENT_FOR[shell];
	const copy: Record<Shell, Record<Solvent, [string, string, string]>> = {
		naked: {
			saline: [
				"Coat opened cleanly. Saline left the protein shell intact.",
				"Coat clear.",
				"Clear.",
			],
			surfactant: [
				"There was no bilayer to strip. The micelles nicked the protein coat.",
				"Protein coat nicked.",
				"Damaged.",
			],
			delipidant: [
				"No lipid was there. The harsh mix wrecked the protein coat.",
				"Protein coat wrecked.",
				"Damaged.",
			],
		},
		single: {
			saline: [
				"The fringe is still there. An isotonic wash does not touch lipid.",
				"Fringe still there.",
				"Sealed.",
			],
			surfactant: [
				"Coat opened cleanly. The single fringe came away, and the mix stopped.",
				"Coat clear.",
				"Clear.",
			],
			delipidant: [
				"The single fringe is gone, and the protein under it went too. One fringe does not want the harsh mix.",
				"Too harsh for one fringe.",
				"Damaged.",
			],
		},
		double: {
			saline: [
				"Both fringes are untouched. Water does not open lipid.",
				"Both fringes intact.",
				"Sealed.",
			],
			surfactant: [
				"The outer fringe lifted. The inner fringe is still sealed.",
				"Inner fringe remains.",
				"Sealed.",
			],
			delipidant: ["Coat opened cleanly. Both fringes came away.", "Coat clear.", "Clear."],
		},
	};
	const [full, short, terse] = copy[shell][solvent];
	return { ok, detail: pick(voice, full, short, terse), noteId: ok ? `coat:${shell}` : null };
}

function genomeDetail(
	genome: Genome,
	active: Active | null,
	voice: Voice,
): { ok: boolean; detail: string; noteId: string | null } {
	if (active == null) {
		return {
			ok: false,
			detail: pick(
				voice,
				"No active loaded. Replication never slowed.",
				"No active loaded.",
				"Empty.",
			),
			noteId: null,
		};
	}
	const ok = active === ACTIVE_FOR[genome];
	const success: Record<Genome, string> = {
		plus: "Replication stopped. Ribosomes never started on the incoming strand.",
		minus: "Replication stopped. The packaged polymerase took the bait.",
		dna: "Replication stopped. The DNA was cut before the nucleus.",
		dsrna: "Replication stopped. The duplex came unwound.",
	};
	const failure: Record<Genome, string> = {
		plus: "Replication is ongoing. This genome translates on entry, and the active does not block ribosomes.",
		minus:
			"Replication is ongoing. This genome copies only with its packaged polymerase, and the active does not feed that enzyme.",
		dna: "Replication is ongoing. This genome is DNA bound for the nucleus, and the active does not cut DNA.",
		dsrna:
			"Replication is ongoing. This genome is a long RNA duplex, and the active does not unwind one.",
	};
	return {
		ok,
		detail: ok
			? pick(voice, success[genome], "Replication stopped.", "Clear.")
			: pick(voice, failure[genome], "Still replicating.", "Replicating."),
		noteId: ok ? `genome:${genome}` : null,
	};
}

function dockDetail(
	dock: Dock,
	decoy: Decoy | null,
	voice: Voice,
): { ok: boolean; detail: string; noteId: string | null } {
	if (decoy == null) {
		return {
			ok: false,
			detail: pick(
				voice,
				"No decoy loaded. Spikes are free to bind.",
				"No decoy loaded.",
				"Empty.",
			),
			noteId: null,
		};
	}
	const ok = decoy === DECOY_FOR[dock];
	const success: Record<Dock, string> = {
		sialic: "Entry blocked. The spikes bound the free sialic acid instead of the red cells.",
		integrin: "Entry blocked. The RGD peptide occupied the fibronectin-binding spikes.",
		scavenger:
			"Entry blocked. The anionic patches are masked, and the scavenger receptors passed on.",
		fusion: "Entry blocked. The fusion peptide stayed shut in the endosome.",
	};
	const failure: Record<Dock, string> = {
		sialic:
			"Spikes are still binding. They agglutinate red cells, and this decoy is not sialic acid.",
		integrin:
			"Spikes are still binding. They want fibronectin, and this decoy is not an RGD peptide.",
		scavenger:
			"Spikes are still binding. Scavenger receptors are still taking up the anionic surface.",
		fusion:
			"Spikes are still binding. The fusion peptide is still free to spring open in the endosome.",
	};
	return {
		ok,
		detail: ok
			? pick(voice, success[dock], "Entry blocked.", "Clear.")
			: pick(voice, failure[dock], "Still binding.", "Binding."),
		noteId: ok ? `dock:${dock}` : null,
	};
}

function climateDetail(
	weak: Climate,
	climate: Climate | null,
	voice: Voice,
): { ok: boolean; detail: string; noteId: string | null } {
	if (climate == null) {
		return {
			ok: false,
			detail: pick(
				voice,
				"No incubation set. The specimen is sitting at ease.",
				"No incubation set.",
				"Empty.",
			),
			noteId: null,
		};
	}
	const ok = climate === weak;
	return {
		ok,
		detail: ok
			? pick(
					voice,
					"Incubation lands on the collapse. Viability fell away.",
					"Collapse matched.",
					"Clear.",
				)
			: pick(
					voice,
					"Viability held at this setting. Incubate where the bar collapses.",
					"Viability held.",
					"Holding.",
				),
		noteId: ok ? "climate" : null,
	};
}

function doseDetail(
	needed: Dose,
	dose: Dose | null,
	voice: Voice,
): { ok: boolean; detail: string; noteId: string | null } {
	if (dose == null) {
		return {
			ok: false,
			detail: pick(voice, "No dose set. Coverage is zero.", "No dose set.", "Empty."),
			noteId: null,
		};
	}
	if (dose === needed) {
		return {
			ok: true,
			detail: pick(
				voice,
				"Coverage matches the spectrum, and the culture is still readable.",
				"Coverage matched.",
				"Clear.",
			),
			noteId: "dose",
		};
	}
	if (dose < needed) {
		return {
			ok: false,
			detail: pick(
				voice,
				"A hump is still uncovered. Escape mutants are positive.",
				"Escapees remain.",
				"Escapees.",
			),
			noteId: null,
		};
	}
	return {
		ok: false,
		detail: pick(
			voice,
			"The dose blanks the culture. The spectrum is narrower than this coverage.",
			"Culture blanked.",
			"Blank.",
		),
		noteId: null,
	};
}

export function evaluate(specimen: Specimen, formula: Formula): Assay {
	const coat = coatDetail(specimen.shell, formula.solvent, specimen.voice);
	const genome = genomeDetail(specimen.genome, formula.active, specimen.voice);
	const dock = dockDetail(specimen.dock, formula.decoy, specimen.voice);
	const climate = climateDetail(specimen.weak, formula.climate, specimen.voice);
	const dose = doseDetail(specimen.dose, formula.dose, specimen.voice);
	const axes: AxisReport[] = [
		{ reading: "coat", label: "Coat", ...coat },
		{ reading: "genome", label: "Genome", ...genome },
		{ reading: "dock", label: "Dock", ...dock },
		{ reading: "climate", label: "Climate", ...climate },
		{ reading: "dose", label: "Dose", ...dose },
	];
	const correct = axes.filter((axis) => axis.ok).length;
	const load = LOADS[correct] ?? LOADS[0];
	const summary =
		correct === 5
			? "Culture cleared. Every axis held."
			: correct === 0
				? "Nothing held. The load stayed at the top of the chart."
				: `${correct} of 5 held. The load fell, then leveled near ${load[load.length - 1]}.`;
	return { correct, total: 5, cleared: correct === 5, load, axes, summary };
}
