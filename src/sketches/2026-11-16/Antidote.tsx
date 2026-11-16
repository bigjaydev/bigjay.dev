import {
	Activity,
	ChevronLeft,
	ChevronRight,
	Dna,
	Hexagon,
	Lock,
	Notebook,
	RotateCcw,
	Spline,
	Thermometer,
	type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Glyph, LoadChart, SpecimenArt, SpectrumChart, ViabilityChart } from "./art";
import {
	CLIMATES,
	NOTES,
	READINGS,
	SLOTS,
	SPECIMENS,
	applyChoice,
	cardsFor,
	choiceLabel,
	emptyFormula,
	evaluate,
	filledCount,
	firstEmpty,
	fringesOf,
	isSelected,
	readingFor,
	slotFor,
	spectrumFor,
	statFor,
	type Assay,
	type Card,
	type Formula,
	type ReadingId,
	type Slot,
	type Specimen,
} from "./lab";

const INTRO = "Read the specimen. Set all five parts, then run the assay.";

const GAP: Record<Slot, string> = {
	solvent: "Choose a solvent.",
	active: "Choose an active.",
	decoy: "Choose a decoy.",
	climate: "Set a climate.",
	dose: "Set a dose.",
};

const FOCUS_ICON: Record<ReadingId, LucideIcon> = {
	coat: Hexagon,
	genome: Dna,
	dock: Spline,
	climate: Thermometer,
	dose: Activity,
};

function cn(...parts: (string | false | null | undefined)[]): string {
	return parts.filter(Boolean).join(" ");
}

function spectrumLabel(specimen: Specimen): string {
	if (specimen.dose === 1) return "one cluster";
	if (specimen.dose === 2) return "two clusters";
	return "a broad smear";
}

export default function Antidote() {
	const [index, setIndex] = useState(0);
	const [unlocked, setUnlocked] = useState(1);
	const [focus, setFocus] = useState<ReadingId>("coat");
	const [slot, setSlot] = useState<Slot>("solvent");
	const [formulas, setFormulas] = useState<Formula[]>(() => SPECIMENS.map(() => emptyFormula()));
	const [assays, setAssays] = useState<(Assay | null)[]>(() => SPECIMENS.map(() => null));
	const [runs, setRuns] = useState<number[]>(() => SPECIMENS.map(() => 0));
	const [notes, setNotes] = useState<string[]>([]);
	const [notesOpen, setNotesOpen] = useState(false);
	const [message, setMessage] = useState(INTRO);
	const notesRef = useRef<HTMLDivElement>(null);
	const assayRef = useRef<HTMLDivElement>(null);

	const specimen = SPECIMENS[index] ?? SPECIMENS[0];
	const formula = formulas[index] ?? emptyFormula();
	const assay = assays[index] ?? null;
	const runCount = runs[index] ?? 0;
	const stat = statFor(specimen, focus);
	const bars = CLIMATES.map((climate, climateIndex) => ({
		id: climate.id,
		label: climate.label,
		value: specimen.bars[climateIndex] ?? 0,
	}));

	useEffect(() => {
		if (!notesOpen) return;
		const onPointer = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (notesRef.current?.contains(target)) return;
			setNotesOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setNotesOpen(false);
		};
		window.addEventListener("pointerdown", onPointer);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointerdown", onPointer);
			window.removeEventListener("keydown", onKey);
		};
	}, [notesOpen]);

	function focusReading(reading: ReadingId) {
		setFocus(reading);
		setSlot(slotFor(reading));
	}

	function go(next: number) {
		if (next < 0 || next >= SPECIMENS.length || next >= unlocked) return;
		setIndex(next);
		setFocus("coat");
		setSlot("solvent");
		setMessage(assays[next]?.summary ?? INTRO);
	}

	function choose(card: Card) {
		setFormulas((prev) =>
			prev.map((item, itemIndex) => (itemIndex === index ? applyChoice(item, card) : item)),
		);
		setAssays((prev) => prev.map((item, itemIndex) => (itemIndex === index ? null : item)));
		setMessage(INTRO);
	}

	function resetFormula() {
		setFormulas((prev) =>
			prev.map((item, itemIndex) => (itemIndex === index ? emptyFormula() : item)),
		);
		setAssays((prev) => prev.map((item, itemIndex) => (itemIndex === index ? null : item)));
		setMessage(INTRO);
	}

	function runAssay() {
		const gap = firstEmpty(formula);
		if (gap) {
			setSlot(gap);
			setFocus(readingFor(gap));
			setMessage(GAP[gap]);
			return;
		}
		const result = evaluate(specimen, formula);
		setAssays((prev) => prev.map((item, itemIndex) => (itemIndex === index ? result : item)));
		setRuns((prev) => prev.map((item, itemIndex) => (itemIndex === index ? item + 1 : item)));
		setNotes((prev) => {
			const next = [...prev];
			for (const axis of result.axes) {
				if (axis.noteId && !next.includes(axis.noteId)) next.push(axis.noteId);
			}
			return next;
		});
		if (result.cleared) setUnlocked((value) => Math.max(value, index + 2));
		setMessage(result.summary);
		requestAnimationFrame(() => {
			assayRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
		});
	}

	function onAction() {
		if (assay?.cleared) {
			if (index + 1 < SPECIMENS.length) go(index + 1);
			return;
		}
		runAssay();
	}

	const clearedCount = assays.filter((item) => item?.cleared).length;
	const actionLabel = assay?.cleared ? (index + 1 < SPECIMENS.length ? "Next" : "Clear") : "Run";
	const actionFoot = assay?.cleared
		? index + 1 < SPECIMENS.length
			? `${specimen.name} is down`
			: "Five cultures down"
		: `${filledCount(formula)} of 5 set`;

	return (
		<div className="bg-[#e6e9ee] px-3 py-5 sm:px-6 sm:py-8" data-antidote data-case={specimen.id}>
			<style>{`
				@keyframes antidote-float { 50% { transform: translateY(-8px); } }
				@keyframes antidote-draw { to { stroke-dashoffset: 0; } }
				[data-antidote] button:not(:disabled) { cursor: pointer; }
				[data-antidote] button:focus-visible { outline: 2px solid #f25c1d; outline-offset: 2px; }
			`}</style>
			<div
				className="mx-auto max-w-6xl rounded-[28px] bg-white p-4 text-[#1c1d21] shadow-[0_24px_60px_rgba(28,29,33,0.06)] sm:p-6"
				data-cleared={assay?.cleared ? "true" : "false"}
				data-unlocked={unlocked}
				data-solved={clearedCount}
			>
				<header className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2.5">
						<Mark />
						<div>
							<p className="font-space-grotesk text-lg leading-none">antidote</p>
							<p className="mt-1 text-[10px] tracking-[0.18em] text-[#9aa1ab]">TOY ASSAY</p>
						</div>
					</div>
					<nav className="hidden gap-2 sm:flex" aria-label="Readings">
						{READINGS.map((reading) => {
							const Icon = FOCUS_ICON[reading.id];
							const active = focus === reading.id;
							return (
								<button
									key={reading.id}
									type="button"
									aria-label={reading.label}
									aria-pressed={active}
									title={reading.label}
									onClick={() => focusReading(reading.id)}
									className={cn(
										"flex size-10 items-center justify-center rounded-full",
										active
											? "bg-primary-light text-[#1c1d21]"
											: "bg-[#f3f5f7] text-[#1c1d21] hover:bg-[#e8ecf1]",
									)}
								>
									<Icon className="size-4" strokeWidth={1.75} />
								</button>
							);
						})}
					</nav>
					<div className="flex items-center gap-2">
						<div className="relative" ref={notesRef}>
							<button
								type="button"
								aria-label="Bench notes"
								aria-expanded={notesOpen}
								onClick={() => setNotesOpen((open) => !open)}
								className={cn(
									"flex size-10 items-center justify-center rounded-full",
									notesOpen ? "bg-primary-light" : "bg-[#f3f5f7] hover:bg-[#e8ecf1]",
								)}
							>
								<Notebook className="size-4" strokeWidth={1.75} />
							</button>
							{notesOpen && (
								<div className="absolute top-12 right-0 z-30 w-[min(18rem,calc(100vw-2.5rem))] rounded-3xl bg-white p-4 shadow-[0_16px_50px_rgba(28,29,33,0.12)] ring-1 ring-[#e6e9ee]">
									<p className="font-space-grotesk text-lg">Notes</p>
									{notes.length === 0 ? (
										<p className="mt-2 text-sm leading-6 text-[#5c6370]">
											Prove an axis and the rule you used lands here.
										</p>
									) : (
										<ul className="mt-2 space-y-2">
											{notes.map((id) => (
												<li key={id} className="text-sm leading-5 text-[#1c1d21]">
													{NOTES[id]}
												</li>
											))}
										</ul>
									)}
								</div>
							)}
						</div>
						<button
							type="button"
							aria-label="Reset this formula"
							onClick={resetFormula}
							className="flex size-10 items-center justify-center rounded-full bg-[#f3f5f7] hover:bg-[#e8ecf1]"
						>
							<RotateCcw className="size-4" strokeWidth={1.75} />
						</button>
						<div className="ml-1 hidden text-right sm:block">
							<p className="text-sm leading-none font-medium">{specimen.name}</p>
							<p className="mt-1 text-[11px] text-[#9aa1ab]">
								Case {String(index + 1).padStart(2, "0")}
							</p>
						</div>
					</div>
				</header>

				<div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.86fr)_minmax(0,1.12fr)] lg:gap-5">
					<section className="order-2 min-w-0 lg:order-1">
						<div className="flex items-center gap-3">
							<button
								type="button"
								aria-label="Previous specimen"
								disabled={index === 0}
								onClick={() => go(index - 1)}
								className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f3f5f7] hover:bg-[#e8ecf1] disabled:opacity-30"
							>
								<ChevronLeft className="size-5" strokeWidth={1.75} />
							</button>
							<h2 className="font-space-grotesk text-3xl leading-none tracking-tight sm:text-4xl">
								Specimen
							</h2>
						</div>
						<div className="mt-4 flex flex-wrap gap-1.5">
							{READINGS.map((reading) => (
								<button
									key={reading.id}
									type="button"
									aria-pressed={focus === reading.id}
									onClick={() => focusReading(reading.id)}
									className={cn(
										"rounded-full px-2.5 py-1 text-[13px]",
										focus === reading.id
											? "bg-primary-light text-[#1c1d21]"
											: "bg-[#f3f5f7] text-[#5c6370] hover:bg-[#e8ecf1]",
									)}
								>
									{reading.label}
								</button>
							))}
						</div>
						<div className="mt-5">
							<p className="font-space-grotesk text-5xl leading-none tracking-tight sm:text-6xl">
								{stat.mark}
							</p>
							<p className="mt-3 text-sm text-[#8b919a]">{stat.kicker}</p>
							<p className="text-xl leading-tight font-medium">{stat.value}</p>
							<p className="text-sm text-[#8b919a]">{stat.unit}</p>
							<p className="mt-3 max-w-sm text-sm leading-6 text-[#3c424c]">{stat.detail}</p>
						</div>
						<div className="mt-5 grid gap-2">
							<figure
								className={cn(
									"rounded-3xl px-3 pt-3 pb-1",
									focus === "climate" ? "bg-primary-light" : "bg-[#f3f5f7]",
								)}
							>
								<figcaption className="text-[11px] tracking-wide text-[#6a7180] uppercase">
									Viability · incubate where it collapses
								</figcaption>
								<ViabilityChart bars={bars} picked={formula.climate} />
							</figure>
							<figure
								className={cn(
									"rounded-3xl px-3 pt-3 pb-2",
									focus === "dose" ? "bg-primary-light" : "bg-[#f3f5f7]",
								)}
							>
								<figcaption className="text-[11px] tracking-wide text-[#6a7180] uppercase">
									Spectrum · cover every hump, and no more
								</figcaption>
								<SpectrumChart
									bins={spectrumFor(specimen.dose)}
									doseLabel={spectrumLabel(specimen)}
								/>
							</figure>
						</div>
					</section>

					<section className="order-1 min-w-0 lg:order-2 lg:pt-4">
						<div className="flex items-center justify-center gap-2 sm:gap-4">
							<div className="w-full max-w-[230px] motion-safe:animate-[antidote-float_7s_ease-in-out_infinite] sm:max-w-[280px]">
								<SpecimenArt
									shape={specimen.shape}
									fringes={fringesOf(specimen.shell)}
									focus={focus}
									onFocus={focusReading}
								/>
							</div>
							<div className="flex flex-col gap-2">
								{(["climate", "dose"] as const).map((reading) => {
									const Icon = FOCUS_ICON[reading];
									const active = focus === reading;
									return (
										<button
											key={reading}
											type="button"
											aria-label={reading === "climate" ? "Climate" : "Dose"}
											aria-pressed={active}
											onClick={() => focusReading(reading)}
											className={cn(
												"flex size-10 items-center justify-center rounded-full",
												active
													? "bg-primary-light text-[#1c1d21]"
													: "bg-[#f3f5f7] text-[#1c1d21] hover:bg-[#e8ecf1]",
											)}
										>
											<Icon className="size-4" strokeWidth={1.75} />
										</button>
									);
								})}
							</div>
						</div>
						<p className="mt-2 text-center text-xs tracking-wide text-[#9aa1ab] uppercase">
							Case {String(index + 1).padStart(2, "0")} · {specimen.name}
						</p>
					</section>

					<section className="order-3 min-w-0">
						<div className="flex items-center justify-between gap-3">
							<h2 className="font-space-grotesk text-3xl leading-none tracking-tight sm:text-4xl">
								Formulation
							</h2>
							<button
								type="button"
								aria-label="Next specimen"
								disabled={index + 1 >= unlocked}
								onClick={() => go(index + 1)}
								className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f3f5f7] hover:bg-[#e8ecf1] disabled:opacity-30"
							>
								<ChevronRight className="size-5" strokeWidth={1.75} />
							</button>
						</div>
						<p className="mt-3 max-w-sm text-sm leading-6 text-[#5c6370]">
							One choice from each group. The cards say what they do.
						</p>
						<div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Formula groups">
							{SLOTS.map((item) => {
								const filled = choiceLabel(formula, item.id) != null;
								return (
									<button
										key={item.id}
										type="button"
										role="tab"
										data-slot={item.id}
										aria-selected={slot === item.id}
										onClick={() => {
											setSlot(item.id);
											setFocus(readingFor(item.id));
										}}
										className={cn(
											"rounded-full px-2.5 py-1 text-[13px]",
											slot === item.id
												? "bg-primary-light text-[#1c1d21]"
												: "bg-[#f3f5f7] text-[#5c6370] hover:bg-[#e8ecf1]",
										)}
									>
										{item.label}
										{filled && (
											<span className="ml-1.5 inline-block size-1.5 rounded-full bg-[#f25c1d]" />
										)}
									</button>
								);
							})}
						</div>
						<div className="mt-3 grid grid-cols-2 gap-2">
							{cardsFor(slot).map((card) => {
								const selected = isSelected(formula, card);
								return (
									<button
										key={card.id}
										type="button"
										data-card={card.id}
										aria-pressed={selected}
										onClick={() => choose(card)}
										className={cn(
											"flex min-h-[9.25rem] flex-col rounded-[22px] p-3 text-left",
											selected
												? "bg-[#fff1ea] ring-2 ring-[#f25c1d]"
												: "bg-[#f3f5f7] hover:bg-[#e8ecf1]",
										)}
									>
										<div className="flex items-start justify-between gap-2">
											<span className="text-[11px] text-[#9aa1ab]">{card.index}</span>
											<Glyph id={card.id} />
										</div>
										<p className="mt-1 text-sm leading-tight font-medium">{card.name}</p>
										<p className="mt-0.5 text-[11px] text-[#8b919a]">{card.meta}</p>
										<p className="mt-1.5 text-[11px] leading-4 text-[#4a5160]">{card.blurb}</p>
									</button>
								);
							})}
						</div>
					</section>
				</div>

				<div
					ref={assayRef}
					className="mt-6 grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_13.5rem]"
				>
					<section className="rounded-[28px] bg-[#f3f5f7] p-4 sm:p-5">
						<div className="flex items-end justify-between gap-3">
							<div>
								<h3 className="font-space-grotesk text-2xl leading-none">Assay</h3>
								<p className="mt-2 text-sm text-[#5c6370]" aria-live="polite">
									{assay ? assay.summary : message}
								</p>
							</div>
							<div className="text-right">
								<p className="font-space-grotesk text-4xl leading-none">
									{assay ? assay.load[assay.load.length - 1] : "–"}
								</p>
								<p className="mt-1 text-[11px] text-[#9aa1ab]">
									{runCount > 0 ? `load at 8 h · run ${runCount}` : "load at 8 h"}
								</p>
							</div>
						</div>
						<div className="mt-3">
							<LoadChart series={assay?.load ?? null} drawKey={runCount} />
						</div>
					</section>
					<button
						type="button"
						data-action={actionLabel.toLowerCase()}
						onClick={onAction}
						className="flex min-h-40 flex-col items-start justify-between rounded-[28px] bg-[#f25c1d] p-5 text-left text-white"
					>
						<span className="text-sm font-medium text-white/80">Assay</span>
						<span className="font-space-grotesk text-5xl leading-none">{actionLabel}</span>
						<span className="text-sm font-medium">{actionFoot}</span>
					</button>
					{assay && (
						<ul className="space-y-1.5 lg:col-span-2">
							{assay.axes.map((axis) => (
								<li
									key={axis.reading}
									data-axis={axis.reading}
									data-ok={String(axis.ok)}
									className="flex gap-3 rounded-2xl bg-[#f3f5f7] px-3 py-2"
								>
									<p className="flex w-16 shrink-0 items-center gap-1.5 text-[10px] tracking-wide text-[#9aa1ab] uppercase">
										<span
											className={cn(
												"size-1.5 rounded-full",
												axis.ok ? "bg-[#7ea2ff]" : "bg-[#f25c1d]",
											)}
										/>
										{axis.label}
									</p>
									<p className="text-sm leading-5 text-[#1c1d21]">{axis.detail}</p>
								</li>
							))}
						</ul>
					)}
				</div>

				<div className="mt-5">
					<div className="mb-2 flex items-center justify-between px-1">
						<p className="text-sm font-medium">Bench</p>
						<p className="text-[11px] text-[#9aa1ab]">
							{clearedCount} of {SPECIMENS.length} cleared
						</p>
					</div>
					<div className="flex gap-2 overflow-x-auto pb-1">
						{SPECIMENS.map((item, itemIndex) => {
							const locked = itemIndex >= unlocked;
							const current = itemIndex === index;
							const cleared = assays[itemIndex]?.cleared ?? false;
							return (
								<button
									key={item.id}
									type="button"
									data-case-tab={item.id}
									disabled={locked}
									aria-current={current ? "true" : undefined}
									onClick={() => go(itemIndex)}
									className={cn(
										"w-[7.4rem] shrink-0 rounded-3xl p-3 text-left",
										current ? "bg-primary-light" : "bg-[#f3f5f7]",
										locked && "opacity-45",
									)}
								>
									<p className="font-space-grotesk text-2xl leading-none">
										{String(itemIndex + 1).padStart(2, "0")}
									</p>
									<p className="mt-2 text-sm font-medium">{item.name}</p>
									<p className="mt-1 flex items-center gap-1 text-[11px] text-[#5c6370]">
										{locked ? (
											<>
												<Lock className="size-3" /> Locked
											</>
										) : cleared ? (
											"Cleared"
										) : current ? (
											"On the bench"
										) : (
											"Open"
										)}
									</p>
								</button>
							);
						})}
					</div>
				</div>

				<p className="mt-4 px-1 text-[11px] leading-4 text-[#9aa1ab]">
					Fictional specimens and a fictional assay. Not medical advice, and not how viruses work.
				</p>
			</div>
		</div>
	);
}

function Mark() {
	return (
		<svg viewBox="0 0 32 32" className="size-9" aria-hidden>
			<circle cx="16" cy="16" r="5.5" fill="#1c1d21" />
			<circle cx="16" cy="5.5" r="2.1" fill="#1c1d21" />
			<circle cx="25.5" cy="21" r="2.1" fill="#1c1d21" />
			<circle cx="6.5" cy="21" r="2.1" fill="#1c1d21" />
		</svg>
	);
}
