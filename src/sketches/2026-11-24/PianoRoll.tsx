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
const ROW_H = 14;

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

function clampNote(note: RollNote, steps: number): RollNote {
	const pitch = Math.min(MIDI_HI, Math.max(MIDI_LO, note.pitch));
	const start = Math.min(steps - 1, Math.max(0, note.start));
	const maxLen = steps - start;
	const length = Math.min(maxLen, Math.max(1, note.length));
	return { ...note, pitch, start, length };
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
	const seconds = (steps * (60 / bpm)) / 4;
	if (seconds < 10) return `${seconds.toFixed(2)}s`;
	return `${seconds.toFixed(1)}s`;
}

function formatPlayhead(step: number): string {
	const bar = Math.floor(step / STEPS_PER_BAR) + 1;
	const beat = Math.floor((step % STEPS_PER_BAR) / 4) + 1;
	const sixteenth = (step % 4) + 1;
	return `${bar}.${beat}.${sixteenth}`;
}

type DragState =
	| {
			kind: "create";
			id: string;
			pitch: number;
			origin: number;
	  }
	| {
			kind: "move";
			id: string;
			grabStep: number;
			grabPitch: number;
			origStart: number;
			origPitch: number;
			origLength: number;
	  }
	| {
			kind: "resize-start";
			id: string;
			fixedEnd: number;
	  }
	| {
			kind: "resize-end";
			id: string;
			fixedStart: number;
	  };

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
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const steps = bars * STEPS_PER_BAR;
	const loopSeconds = formatLoopTime(bpm, steps);

	const dragRef = useRef<DragState | null>(null);
	const notesRef = useRef(notes);
	const stepRef = useRef(0);
	const stepsRef = useRef(steps);
	const onNoteRef = useRef(onNote);
	const lastPitchRef = useRef<number | null>(null);
	const selectedIdRef = useRef<string | null>(null);
	const suppressNodeDeleteRef = useRef(false);
	const playingRef = useRef(false);
	const scrollerRef = useRef<HTMLDivElement>(null);
	const cellsRef = useRef<HTMLDivElement>(null);

	notesRef.current = notes;
	onNoteRef.current = onNote;
	stepsRef.current = steps;
	selectedIdRef.current = selectedId;
	playingRef.current = playing;

	const rows = useMemo(() => {
		const list: number[] = [];
		for (let m = MIDI_HI; m >= MIDI_LO; m--) list.push(m);
		return list;
	}, []);

	useEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		const c4Index = MIDI_HI - 60;
		const top = Math.max(0, c4Index * ROW_H - el.clientHeight * 0.45);
		el.scrollTop = top;
	}, []);

	useEffect(() => {
		setNotes((prev) =>
			prev
				.map((n) => {
					if (n.start >= steps) return null;
					return clampNote(n, steps);
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

		const ms = (60_000 / bpm) / 4;
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

	useEffect(() => {
		const blockFlowDelete = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
		};

		const deleteSelectedNote = () => {
			const id = selectedIdRef.current;
			if (!id) return;
			suppressNodeDeleteRef.current = true;
			setNotes((prev) => {
				const next = prev.filter((n) => n.id !== id);
				if (playingRef.current) {
					// stepRef is advanced one ahead of the sounding step
					const sounding =
						(stepRef.current - 1 + stepsRef.current) % stepsRef.current;
					const pitch = pitchAtStep(next, sounding);
					lastPitchRef.current = pitch;
					onNoteRef.current(pitch == null ? null : midiToFreq(pitch));
				}
				return next;
			});
			setSelectedId(null);
		};

		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Delete" && event.key !== "Backspace") return;
			const target = event.target as HTMLElement | null;
			if (target?.matches?.("input, textarea, select")) return;

			// Key-repeat after deleting a note must not fall through to React Flow
			// (that was removing the whole Piano Roll module).
			if (suppressNodeDeleteRef.current) {
				blockFlowDelete(event);
				return;
			}

			if (!selectedIdRef.current) return;
			blockFlowDelete(event);
			if (event.repeat) return;
			deleteSelectedNote();
		};

		const onKeyUp = (event: KeyboardEvent) => {
			if (event.key === "Delete" || event.key === "Backspace") {
				suppressNodeDeleteRef.current = false;
			}
		};

		window.addEventListener("keydown", onKey, true);
		window.addEventListener("keyup", onKeyUp, true);
		return () => {
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("keyup", onKeyUp, true);
		};
	}, []);

	const cellFromPoint = useCallback((clientX: number, clientY: number) => {
		const root = cellsRef.current;
		if (!root) return null;
		const rect = root.getBoundingClientRect();
		if (
			clientX < rect.left ||
			clientX >= rect.right ||
			clientY < rect.top ||
			clientY >= rect.bottom
		) {
			return null;
		}
		const totalSteps = stepsRef.current;
		const relX = clientX - rect.left;
		const relY = clientY - rect.top;
		// Use measured size so React Flow zoom + borders stay aligned
		const stepIdx = Math.min(
			totalSteps - 1,
			Math.max(0, Math.floor((relX / rect.width) * totalSteps)),
		);
		const rowIdx = Math.min(
			ROW_COUNT - 1,
			Math.max(0, Math.floor((relY / rect.height) * ROW_COUNT)),
		);
		const pitch = MIDI_HI - rowIdx;
		return { pitch, step: stepIdx };
	}, []);

	const updateNote = useCallback((id: string, patch: Partial<RollNote>) => {
		setNotes((prev) =>
			prev.map((n) => (n.id === id ? clampNote({ ...n, ...patch }, stepsRef.current) : n)),
		);
	}, []);

	const onPointerDownGrid = (event: ReactPointerEvent<HTMLDivElement>) => {
		if ((event.target as HTMLElement).closest(".synth-roll__note")) return;
		const cell = cellFromPoint(event.clientX, event.clientY);
		if (!cell) return;
		event.preventDefault();
		event.stopPropagation();

		const id = `n-${noteSeq++}`;
		const note = clampNote(
			{ id, pitch: cell.pitch, start: cell.step, length: 1 },
			stepsRef.current,
		);
		setNotes((prev) => [...prev, note]);
		setSelectedId(id);
		dragRef.current = {
			kind: "create",
			id,
			pitch: cell.pitch,
			origin: cell.step,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const onPointerDownNote = (
		event: ReactPointerEvent<HTMLElement>,
		note: RollNote,
		handle: "move" | "start" | "end",
	) => {
		event.preventDefault();
		event.stopPropagation();
		setSelectedId(note.id);

		if (event.detail === 2) {
			setNotes((prev) => {
				const next = prev.filter((n) => n.id !== note.id);
				if (playingRef.current) {
					const sounding =
						(stepRef.current - 1 + stepsRef.current) % stepsRef.current;
					const pitch = pitchAtStep(next, sounding);
					lastPitchRef.current = pitch;
					onNoteRef.current(pitch == null ? null : midiToFreq(pitch));
				}
				return next;
			});
			setSelectedId(null);
			dragRef.current = null;
			return;
		}

		const cell = cellFromPoint(event.clientX, event.clientY);
		if (!cell) return;

		if (handle === "start") {
			dragRef.current = {
				kind: "resize-start",
				id: note.id,
				fixedEnd: note.start + note.length,
			};
		} else if (handle === "end") {
			dragRef.current = {
				kind: "resize-end",
				id: note.id,
				fixedStart: note.start,
			};
		} else {
			dragRef.current = {
				kind: "move",
				id: note.id,
				grabStep: cell.step,
				grabPitch: cell.pitch,
				origStart: note.start,
				origPitch: note.pitch,
				origLength: note.length,
			};
		}

		const grid = event.currentTarget.closest(".synth-roll__grid");
		(grid as HTMLElement | null)?.setPointerCapture(event.pointerId);
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag) return;
		const cell = cellFromPoint(event.clientX, event.clientY);
		if (!cell) return;

		if (drag.kind === "create") {
			const lo = Math.min(drag.origin, cell.step);
			const hi = Math.max(drag.origin, cell.step);
			updateNote(drag.id, {
				pitch: drag.pitch,
				start: lo,
				length: hi - lo + 1,
			});
			return;
		}

		if (drag.kind === "move") {
			const dStep = cell.step - drag.grabStep;
			const dPitch = cell.pitch - drag.grabPitch;
			updateNote(drag.id, {
				start: drag.origStart + dStep,
				pitch: drag.origPitch + dPitch,
				length: drag.origLength,
			});
			return;
		}

		if (drag.kind === "resize-start") {
			const start = Math.min(drag.fixedEnd - 1, cell.step);
			updateNote(drag.id, {
				start,
				length: drag.fixedEnd - start,
			});
			return;
		}

		if (drag.kind === "resize-end") {
			const end = Math.max(drag.fixedStart, cell.step);
			updateNote(drag.id, {
				start: drag.fixedStart,
				length: end - drag.fixedStart + 1,
			});
		}
	};

	const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		dragRef.current = null;
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
						setSelectedId(null);
						setPlaying(false);
						onNote(null);
					}}
				>
					Clear
				</button>
			</div>

			<div
				className="synth-roll__ruler"
				style={{ gridTemplateColumns: `36px repeat(${steps}, minmax(0, 1fr))` }}
			>
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
					style={{ height: ROW_COUNT * ROW_H }}
					onPointerDown={onPointerDownGrid}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				>
					<div
						className="synth-roll__labels"
						style={{ gridTemplateRows: `repeat(${ROW_COUNT}, ${ROW_H}px)` }}
					>
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
						ref={cellsRef}
						className="synth-roll__cells"
						style={{
							gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))`,
							gridTemplateRows: `repeat(${ROW_COUNT}, ${ROW_H}px)`,
						}}
					>
						{rows.map((pitch) =>
							Array.from({ length: steps }, (_, s) => {
								const sharp = NOTE_NAMES[pitch % 12].includes("♯");
								return (
									<div
										key={`${pitch}-${s}`}
										className={[
											"synth-roll__cell",
											sharp ? "is-sharp" : "",
											s % 16 === 0 ? "is-bar" : "",
											s % 4 === 0 ? "is-beat" : "",
											playing && s === step ? "is-playhead" : "",
										]
											.filter(Boolean)
											.join(" ")}
									/>
								);
							}),
						)}

						<div className="synth-roll__notes">
							{notes.map((note) => {
								const top = (MIDI_HI - note.pitch) * ROW_H;
								const left = (note.start / steps) * 100;
								const width = (note.length / steps) * 100;
								const active =
									playing && step >= note.start && step < note.start + note.length;
								return (
									<div
										key={note.id}
										className={`synth-roll__note${note.length <= 1 ? " is-short" : ""}${
											selectedId === note.id ? " is-selected" : ""
										}${active ? " is-playing" : ""}`}
										style={{
											top,
											left: `${left}%`,
											width: `${width}%`,
											height: ROW_H,
										}}
										onPointerDown={(e) => onPointerDownNote(e, note, "move")}
									>
										<span className="synth-roll__note-body" />
										<span
											className="synth-roll__note-handle is-start"
											onPointerDown={(e) => onPointerDownNote(e, note, "start")}
										/>
										<span
											className="synth-roll__note-handle is-end"
											onPointerDown={(e) => onPointerDownNote(e, note, "end")}
										/>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
