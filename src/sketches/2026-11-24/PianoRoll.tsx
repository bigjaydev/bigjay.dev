import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";

export type RollNote = {
	id: string;
	pitch: number;
	start: number;
	length: number;
};

/** Full usable synth range: C1 (24) … B6 (95) */
const MIDI_LO = 24;
const MIDI_HI = 95;
const ROW_COUNT = MIDI_HI - MIDI_LO + 1;

const STEPS_PER_BAR = 16;
const MIN_BARS = 1;
const MAX_BARS = 8;
const DEFAULT_BARS = 2;
const DEFAULT_BPM = 110;

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

function midiToFreq(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiLabel(midi: number): string {
	const name = NOTE_NAMES[midi % 12];
	const oct = Math.floor(midi / 12) - 1;
	if (name === "C") return `C${oct}`;
	if (name.includes("♯")) return "";
	return name;
}

function pitchAtStep(notes: RollNote[], step: number): number | null {
	let best: number | null = null;
	for (const note of notes) {
		if (step >= note.start && step < note.start + note.length) {
			if (best == null || note.pitch > best) best = note.pitch;
		}
	}
	return best;
}

function noteAtCell(notes: RollNote[], pitch: number, step: number): RollNote | undefined {
	return notes.find((n) => n.pitch === pitch && step >= n.start && step < n.start + n.length);
}

function seedNotes(): RollNote[] {
	const base = 60; // C4
	const pattern = [
		{ pitch: 0, start: 0, length: 2 },
		{ pitch: 3, start: 2, length: 2 },
		{ pitch: 7, start: 4, length: 2 },
		{ pitch: 3, start: 6, length: 2 },
		{ pitch: 0, start: 8, length: 2 },
		{ pitch: 7, start: 10, length: 2 },
		{ pitch: 12, start: 12, length: 4 },
		{ pitch: 7, start: 16, length: 2 },
		{ pitch: 3, start: 18, length: 2 },
		{ pitch: 0, start: 20, length: 4 },
		{ pitch: 12, start: 24, length: 8 },
	];
	return pattern.map((n, i) => ({
		id: `seed-${i}`,
		pitch: base + n.pitch,
		start: n.start,
		length: n.length,
	}));
}

function formatLoopTime(bpm: number, steps: number): string {
	const seconds = (steps * (60 / bpm)) / 4; // 16th notes
	if (seconds < 10) return `${seconds.toFixed(2)}s`;
	return `${seconds.toFixed(1)}s`;
}

function formatPlayhead(step: number): string {
	const bar = Math.floor(step / STEPS_PER_BAR) + 1;
	const beat = Math.floor((step % STEPS_PER_BAR) / 4) + 1;
	const sixteenth = (step % 4) + 1;
	return `${bar}.${beat}.${sixteenth}`;
}

type Props = {
	onNote: (freq: number | null) => void;
};

let noteSeq = 1;

export default function PianoRoll({ onNote }: Props) {
	const [notes, setNotes] = useState<RollNote[]>(seedNotes);
	const [bpm, setBpm] = useState(DEFAULT_BPM);
	const [bars, setBars] = useState(DEFAULT_BARS);
	const [playing, setPlaying] = useState(false);
	const [step, setStep] = useState(0);

	const steps = bars * STEPS_PER_BAR;
	const loopSeconds = formatLoopTime(bpm, steps);

	const paintRef = useRef<{ mode: "add" | "erase"; pitch: number; origin: number } | null>(null);
	const notesRef = useRef(notes);
	const stepRef = useRef(0);
	const stepsRef = useRef(steps);
	const onNoteRef = useRef(onNote);
	const lastPitchRef = useRef<number | null>(null);
	const scrollerRef = useRef<HTMLDivElement>(null);

	notesRef.current = notes;
	onNoteRef.current = onNote;
	stepsRef.current = steps;

	const rows = useMemo(() => {
		const list: number[] = [];
		for (let m = MIDI_HI; m >= MIDI_LO; m--) list.push(m);
		return list;
	}, []);

	useEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		const rowH = 14;
		const c4Index = MIDI_HI - 60;
		const top = Math.max(0, c4Index * rowH - el.clientHeight * 0.45);
		el.scrollTop = top;
	}, []);

	useEffect(() => {
		setNotes((prev) =>
			prev
				.map((n) => {
					if (n.start >= steps) return null;
					const end = Math.min(n.start + n.length, steps);
					return { ...n, length: Math.max(1, end - n.start) };
				})
				.filter((n): n is RollNote => n != null),
		);
		if (stepRef.current >= steps) {
			stepRef.current = 0;
			setStep(0);
		}
	}, [steps]);

	useEffect(() => {
		if (!playing) {
			onNoteRef.current(null);
			lastPitchRef.current = null;
			return;
		}

		const ms = (60_000 / bpm) / 4; // 16th notes
		const tick = () => {
			const s = stepRef.current;
			const pitch = pitchAtStep(notesRef.current, s);
			if (pitch !== lastPitchRef.current) {
				lastPitchRef.current = pitch;
				onNoteRef.current(pitch == null ? null : midiToFreq(pitch));
			}
			setStep(s);
			stepRef.current = (s + 1) % stepsRef.current;
		};

		tick();
		const id = window.setInterval(tick, ms);
		return () => {
			window.clearInterval(id);
			onNoteRef.current(null);
			lastPitchRef.current = null;
		};
	}, [playing, bpm]);

	const upsertPaint = useCallback(
		(pitch: number, start: number, end: number, mode: "add" | "erase") => {
			const lo = Math.max(0, Math.min(start, end));
			const hi = Math.min(stepsRef.current - 1, Math.max(start, end));
			setNotes((prev) => {
				let next = prev.filter(
					(n) => !(n.pitch === pitch && n.start <= hi && n.start + n.length - 1 >= lo),
				);
				if (mode === "add") {
					next = [...next, { id: `n-${noteSeq++}`, pitch, start: lo, length: hi - lo + 1 }];
				}
				return next;
			});
		},
		[],
	);

	const cellFromPoint = (clientX: number, clientY: number, root: HTMLElement) => {
		const cell = document.elementsFromPoint(clientX, clientY).find(
			(el) => (el as HTMLElement).dataset?.rollPitch != null,
		) as HTMLElement | undefined;
		if (!cell || !root.contains(cell)) return null;
		return {
			pitch: Number(cell.dataset.rollPitch),
			step: Number(cell.dataset.rollStep),
		};
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		const root = event.currentTarget;
		const cell = cellFromPoint(event.clientX, event.clientY, root);
		if (!cell) return;
		event.preventDefault();
		event.stopPropagation();
		const existing = noteAtCell(notes, cell.pitch, cell.step);
		const mode = existing ? "erase" : "add";
		paintRef.current = { mode, pitch: cell.pitch, origin: cell.step };
		root.setPointerCapture(event.pointerId);
		upsertPaint(cell.pitch, cell.step, cell.step, mode);
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const paint = paintRef.current;
		if (!paint) return;
		const cell = cellFromPoint(event.clientX, event.clientY, event.currentTarget);
		if (!cell || cell.pitch !== paint.pitch) return;
		upsertPaint(paint.pitch, paint.origin, cell.step, paint.mode);
	};

	const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		paintRef.current = null;
	};

	const setBpmClamped = (value: number) => {
		if (!Number.isFinite(value)) return;
		setBpm(Math.min(240, Math.max(40, Math.round(value))));
	};

	return (
		<div className="synth-roll nodrag nopan nowheel" onWheel={(e) => e.stopPropagation()}>
			<div className="synth-roll__toolbar">
				<button
					type="button"
					className={`synth-roll__play${playing ? " is-on" : ""}`}
					onClick={() => {
						if (!playing) {
							stepRef.current = 0;
							setStep(0);
						}
						setPlaying((v) => !v);
					}}
				>
					{playing ? "Stop" : "Play"}
				</button>

				<label className="synth-roll__field">
					<span>BPM</span>
					<input
						type="number"
						min={40}
						max={240}
						value={bpm}
						onChange={(e) => setBpmClamped(Number(e.target.value))}
						onPointerDown={(e) => e.stopPropagation()}
					/>
				</label>

				<label className="synth-roll__field">
					<span>Bars</span>
					<input
						type="number"
						min={MIN_BARS}
						max={MAX_BARS}
						value={bars}
						onChange={(e) => {
							const v = Number(e.target.value);
							if (!Number.isFinite(v)) return;
							setBars(Math.min(MAX_BARS, Math.max(MIN_BARS, Math.round(v))));
						}}
						onPointerDown={(e) => e.stopPropagation()}
					/>
				</label>

				<div className="synth-roll__meta" title="Loop length at current BPM">
					<span className="synth-roll__meta-label">Time</span>
					<span className="synth-roll__meta-value">{loopSeconds}</span>
				</div>

				<div className="synth-roll__meta" title="Playhead bar.beat.16th">
					<span className="synth-roll__meta-label">Pos</span>
					<span className="synth-roll__meta-value">{formatPlayhead(step)}</span>
				</div>

				<button
					type="button"
					className="synth-roll__clear"
					onClick={() => {
						setNotes([]);
						setPlaying(false);
						onNote(null);
					}}
				>
					Clear
				</button>
			</div>

			<div className="synth-roll__ruler" style={{ gridTemplateColumns: `36px repeat(${steps}, minmax(0, 1fr))` }}>
				<div className="synth-roll__ruler-gutter" />
				{Array.from({ length: steps }, (_, s) => (
					<div
						key={s}
						className={`synth-roll__ruler-cell${s % 16 === 0 ? " is-bar" : s % 4 === 0 ? " is-beat" : ""}${
							playing && s === step ? " is-playhead" : ""
						}`}
					>
						{s % 16 === 0 ? Math.floor(s / 16) + 1 : s % 4 === 0 ? "." : ""}
					</div>
				))}
			</div>

			<div
				ref={scrollerRef}
				className="synth-roll__scroller nowheel"
				onWheel={(e) => e.stopPropagation()}
			>
				<div
					className="synth-roll__grid"
					style={{ height: ROW_COUNT * 14 }}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				>
					<div className="synth-roll__labels" style={{ gridTemplateRows: `repeat(${ROW_COUNT}, 14px)` }}>
						{rows.map((pitch) => {
							const sharp = NOTE_NAMES[pitch % 12].includes("♯");
							return (
								<div
									key={pitch}
									className={`synth-roll__label${sharp ? " is-sharp" : ""}${
										pitch % 12 === 0 ? " is-c" : ""
									}`}
								>
									{midiLabel(pitch)}
								</div>
							);
						})}
					</div>

					<div
						className="synth-roll__cells"
						style={{
							gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))`,
							gridTemplateRows: `repeat(${ROW_COUNT}, 14px)`,
						}}
					>
						{rows.map((pitch) =>
							Array.from({ length: steps }, (_, s) => {
								const covered = noteAtCell(notes, pitch, s);
								const sharp = NOTE_NAMES[pitch % 12].includes("♯");
								const isHead = covered && covered.start === s;
								return (
									<div
										key={`${pitch}-${s}`}
										data-roll-pitch={pitch}
										data-roll-step={s}
										className={[
											"synth-roll__cell",
											sharp ? "is-sharp" : "",
											s % 16 === 0 ? "is-bar" : "",
											s % 4 === 0 ? "is-beat" : "",
											playing && s === step ? "is-playhead" : "",
											covered ? "is-note" : "",
											isHead ? "is-head" : "",
										]
											.filter(Boolean)
											.join(" ")}
									/>
								);
							}),
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
