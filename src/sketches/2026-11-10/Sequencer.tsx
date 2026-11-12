import { useCallback, useEffect, useRef, useState } from "react";
import { BASS_MIDI, noteName, Sequencer as SequencerEngine, STEPS } from "./sound";

const GROOVE = ["x...x...x..x....", "....x.......x...", "x.x.x.x.x.x.x.x.", "x...x.x.x...x..."];

const ROWS: { label: string; notes?: string[] }[] = [
	{ label: "Kick" },
	{ label: "Snare" },
	{ label: "Hat" },
	{ label: "Bass", notes: BASS_MIDI.map(noteName) },
];

function patternFrom(rows: string[]): boolean[][] {
	return rows.map((row) => [...row].map((cell) => cell === "x"));
}

function emptyPattern(): boolean[][] {
	return ROWS.map(() => Array<boolean>(STEPS).fill(false));
}

function cellTone(on: boolean, current: boolean, downbeat: boolean): string {
	if (on && current) return "bg-[#fecef5] text-[#191b1a]";
	if (on) return "bg-[#fecef5]/80 text-[#191b1a] hover:bg-[#fecef5]";
	if (current) return "bg-white/25 text-[#f4efe8]/70";
	if (downbeat) return "bg-white/10 text-[#f4efe8]/40 hover:bg-white/20";
	return "bg-white/[0.06] text-[#f4efe8]/35 hover:bg-white/15";
}

function stepGap(step: number): string {
	return step % 4 === 0 && step !== 0 ? "ml-2" : "";
}

type Paint = { voice: number; value: boolean };

export default function Sequencer() {
	const engineRef = useRef<SequencerEngine | null>(null);
	const paintRef = useRef<Paint | null>(null);
	const skipClick = useRef(false);
	const [pattern, setPattern] = useState(() => patternFrom(GROOVE));
	const [bpm, setBpm] = useState(112);
	const [playing, setPlaying] = useState(false);
	const [playhead, setPlayhead] = useState(-1);

	const patternRef = useRef(pattern);
	const bpmRef = useRef(bpm);
	patternRef.current = pattern;
	bpmRef.current = bpm;

	const engine = engineRef.current;
	if (engine) {
		engine.pattern = pattern;
		engine.bpm = bpm;
	}

	useEffect(() => {
		const seq = new SequencerEngine();
		seq.pattern = patternRef.current;
		seq.bpm = bpmRef.current;
		engineRef.current = seq;

		let frame = 0;
		const loop = () => {
			const now = seq.now();
			if (now != null) {
				const hit = seq.consume(now);
				if (hit != null) setPlayhead((prev) => (prev === hit ? prev : hit));
			}
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);

		const endPaint = () => {
			paintRef.current = null;
			setTimeout(() => {
				skipClick.current = false;
			}, 0);
		};
		window.addEventListener("pointerup", endPaint);
		window.addEventListener("pointercancel", endPaint);

		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("pointerup", endPaint);
			window.removeEventListener("pointercancel", endPaint);
			seq.close();
			engineRef.current = null;
		};
	}, []);

	const setCell = useCallback((voice: number, step: number, value: boolean) => {
		setPattern((prev) => {
			if (prev[voice]?.[step] === value) return prev;
			const next = prev.map((row) => row.slice());
			const row = next[voice];
			if (row) row[step] = value;
			return next;
		});
	}, []);

	const togglePlay = useCallback(() => {
		const seq = engineRef.current;
		if (!seq) return;
		if (seq.playing) {
			seq.stop();
			setPlaying(false);
			setPlayhead(-1);
			return;
		}
		seq.pattern = patternRef.current;
		seq.bpm = bpmRef.current;
		seq.start();
		setPlaying(true);
	}, []);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.code !== "Space" || event.repeat) return;
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLButtonElement
			) {
				return;
			}
			event.preventDefault();
			togglePlay();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [togglePlay]);

	function cellAt(x: number, y: number): { voice: number; step: number } | null {
		const hit = document.elementFromPoint(x, y)?.closest("[data-cell]");
		if (!(hit instanceof HTMLElement)) return null;
		const voice = Number(hit.dataset.voice);
		const step = Number(hit.dataset.step);
		if (!Number.isInteger(voice) || !Number.isInteger(step)) return null;
		return { voice, step };
	}

	return (
		<div className="mx-auto max-w-6xl px-6 pb-16">
			<div
				data-sequencer
				data-playing={playing ? "true" : "false"}
				data-playhead={playhead}
				className="rounded-3xl bg-[#191b1a] p-4 text-[#f4efe8] sm:p-5"
			>
				<div>
					<p className="font-space-grotesk text-lg text-[#fecef5]">Loop</p>
					<p className="mt-1 max-w-2xl text-sm leading-6 text-[#f4efe8]/60">
						Sixteen steps. Kick, snare, and hat are drums. Each bass cell plays the note written on
						it.
					</p>
					<div className="mt-4 flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={togglePlay}
							aria-pressed={playing}
							className="rounded-full bg-[#fecef5] px-4 py-1.5 text-sm font-medium text-[#191b1a] hover:bg-[#fecef5]/85"
						>
							{playing ? "Stop" : "Play"}
						</button>
						<label className="flex items-center gap-2 text-sm text-[#f4efe8]/80">
							<span className="w-16 tabular-nums">{bpm} bpm</span>
							<input
								type="range"
								min={70}
								max={180}
								value={bpm}
								aria-label="Tempo"
								onChange={(event) => setBpm(Number(event.target.value))}
								className="w-28 accent-[#fecef5]"
							/>
						</label>
						<button
							type="button"
							onClick={() => setPattern(emptyPattern())}
							className="rounded-full px-3 py-1.5 text-sm text-[#f4efe8]/80 hover:bg-white/10"
						>
							Clear
						</button>
						<button
							type="button"
							onClick={() => setPattern(patternFrom(GROOVE))}
							className="rounded-full px-3 py-1.5 text-sm text-[#f4efe8]/80 hover:bg-white/10"
						>
							Reset
						</button>
					</div>
				</div>

				<div className="mt-5 overflow-x-auto pb-1">
					<div
						className="min-w-[36rem] select-none"
						onPointerDown={(event) => {
							if (event.button !== 0) return;
							const cell = cellAt(event.clientX, event.clientY);
							if (!cell) return;
							const next = !pattern[cell.voice]?.[cell.step];
							paintRef.current = { voice: cell.voice, value: next };
							skipClick.current = true;
							setCell(cell.voice, cell.step, next);
						}}
						onPointerMove={(event) => {
							const paint = paintRef.current;
							if (!paint || event.buttons === 0) return;
							const cell = cellAt(event.clientX, event.clientY);
							if (!cell || cell.voice !== paint.voice) return;
							setCell(cell.voice, cell.step, paint.value);
						}}
					>
						<div className="mb-1.5 flex items-end gap-1">
							<span className="w-16 shrink-0" />
							<div className="flex flex-1 gap-1">
								{Array.from({ length: STEPS }, (_, step) => (
									<span
										key={step}
										className={`flex-1 text-center text-[10px] tabular-nums ${stepGap(step)} ${
											playhead === step
												? "text-[#fecef5]"
												: step % 4 === 0
													? "text-[#f4efe8]/55"
													: "text-[#f4efe8]/30"
										}`}
									>
										{step + 1}
									</span>
								))}
							</div>
						</div>

						{ROWS.map((row, voice) => (
							<div key={row.label} className="mt-1 flex items-center gap-1">
								<span className="w-16 shrink-0 text-xs text-[#f4efe8]/70">{row.label}</span>
								<div className="flex flex-1 gap-1" role="group" aria-label={row.label}>
									{Array.from({ length: STEPS }, (_, step) => {
										const on = pattern[voice]?.[step] ?? false;
										const note = row.notes?.[step];
										return (
											<button
												key={step}
												type="button"
												data-cell
												data-voice={voice}
												data-step={step}
												aria-pressed={on}
												aria-label={
													note
														? `${row.label} ${note}, step ${step + 1}`
														: `${row.label}, step ${step + 1}`
												}
												onClick={() => {
													if (skipClick.current) return;
													setCell(voice, step, !on);
												}}
												className={`h-11 min-w-0 flex-1 rounded-lg text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#fecef5] focus-visible:ring-offset-1 focus-visible:ring-offset-[#191b1a] ${stepGap(step)} ${cellTone(on, playhead === step, step % 4 === 0)}`}
											>
												{note}
											</button>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</div>

				<p className="mt-3 text-[11px] text-[#f4efe8]/35">
					Space plays and stops. Drag across a row to paint steps.
				</p>
			</div>
		</div>
	);
}
