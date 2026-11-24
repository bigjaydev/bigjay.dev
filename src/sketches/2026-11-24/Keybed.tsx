import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Natural = {
	note: string;
	semitone: number;
	sharp?: { note: string; semitone: number };
};

/** One octave: each natural may own the sharp that sits on its right edge. */
const NATURALS: Natural[] = [
	{ note: "C", semitone: 0, sharp: { note: "C♯", semitone: 1 } },
	{ note: "D", semitone: 2, sharp: { note: "D♯", semitone: 3 } },
	{ note: "E", semitone: 4 },
	{ note: "F", semitone: 5, sharp: { note: "F♯", semitone: 6 } },
	{ note: "G", semitone: 7, sharp: { note: "G♯", semitone: 8 } },
	{ note: "A", semitone: 9, sharp: { note: "A♯", semitone: 10 } },
	{ note: "B", semitone: 11 },
];

function midiToFreq(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

function semitoneFromPoint(clientX: number, clientY: number): number | null {
	const stack = document.elementsFromPoint(clientX, clientY);
	for (const el of stack) {
		const host = (el as HTMLElement).closest?.("[data-semitone]");
		if (!host) continue;
		const value = Number((host as HTMLElement).dataset.semitone);
		if (Number.isFinite(value)) return value;
	}
	return null;
}

type Props = {
	octave: number;
	onNote: (freq: number | null) => void;
};

export default function Keybed({ octave, onNote }: Props) {
	const [active, setActive] = useState<number | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const heldRef = useRef(false);
	const activeRef = useRef<number | null>(null);

	const play = useCallback(
		(semitone: number) => {
			if (activeRef.current === semitone && heldRef.current) return;
			const midi = 12 * (octave + 1) + semitone;
			activeRef.current = semitone;
			setActive(semitone);
			onNote(midiToFreq(midi));
		},
		[octave, onNote],
	);

	const release = useCallback(() => {
		if (!heldRef.current && activeRef.current == null) return;
		heldRef.current = false;
		activeRef.current = null;
		setActive(null);
		onNote(null);
	}, [onNote]);

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		const semitone = semitoneFromPoint(event.clientX, event.clientY);
		if (semitone == null) return;
		event.preventDefault();
		event.stopPropagation();
		heldRef.current = true;
		rootRef.current?.setPointerCapture(event.pointerId);
		play(semitone);
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!heldRef.current) return;
		const semitone = semitoneFromPoint(event.clientX, event.clientY);
		if (semitone == null) return;
		play(semitone);
	};

	const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		if (rootRef.current?.hasPointerCapture(event.pointerId)) {
			rootRef.current.releasePointerCapture(event.pointerId);
		}
		release();
	};

	return (
		<div
			ref={rootRef}
			className="synth-keys nodrag nopan"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
		>
			{NATURALS.map((key) => (
				<div key={key.note} className="synth-keys__natural">
					<button
						type="button"
						tabIndex={-1}
						data-semitone={key.semitone}
						className={`synth-keys__white${active === key.semitone ? " is-active" : ""}`}
						aria-label={key.note}
					>
						<span>{key.note}</span>
					</button>
					{key.sharp && (
						<button
							type="button"
							tabIndex={-1}
							data-semitone={key.sharp.semitone}
							className={`synth-keys__black${active === key.sharp.semitone ? " is-active" : ""}`}
							aria-label={key.sharp.note}
						/>
					)}
				</div>
			))}
		</div>
	);
}
