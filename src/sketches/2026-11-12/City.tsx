import { useEffect, useMemo, useRef, useState } from "react";
import { CITY_H, CITY_W, generateCity, paintCity } from "./city";

function nextSeed(seed: number) {
	return (seed + 1 + Math.floor(Math.random() * 99991)) % 100000;
}

export default function City() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
	const [streets, setStreets] = useState(0.55);
	const [parks, setParks] = useState(0.4);
	const city = useMemo(() => generateCity(seed, streets, parks), [seed, streets, parks]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const draw = () => {
			const rect = canvas.getBoundingClientRect();
			if (rect.width < 2 || rect.height < 2) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.round(rect.width * dpr);
			canvas.height = Math.round(rect.height * dpr);
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.setTransform((rect.width / CITY_W) * dpr, 0, 0, (rect.height / CITY_H) * dpr, 0, 0);
			paintCity(ctx, city);
		};
		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		return () => observer.disconnect();
	}, [city]);

	return (
		<div className="mx-auto max-w-4xl px-6 pb-20" data-city data-seed={seed}>
			<button
				type="button"
				onClick={() => setSeed(nextSeed)}
				className="block w-full cursor-pointer rounded-md border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[#fecef5]"
				aria-label="Another city"
			>
				<canvas
					ref={canvasRef}
					className="h-auto w-full rounded-md bg-[#f4ecdf]"
					style={{ aspectRatio: `${CITY_W} / ${CITY_H}` }}
				/>
			</button>
			<div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
				<button
					type="button"
					onClick={() => setSeed(nextSeed)}
					className="rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:border-slate-400"
				>
					Another city
				</button>
				<label className="min-w-36 flex-1 text-xs tracking-wide text-slate-500 uppercase">
					Streets
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={streets}
						aria-label="Streets"
						onChange={(event) => setStreets(Number(event.target.value))}
						className="mt-1 block w-full accent-[#534e50]"
					/>
				</label>
				<label className="min-w-36 flex-1 text-xs tracking-wide text-slate-500 uppercase">
					Parks
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={parks}
						aria-label="Parks"
						onChange={(event) => setParks(Number(event.target.value))}
						className="mt-1 block w-full accent-[#534e50]"
					/>
				</label>
			</div>
			<p className="mt-4 max-w-xl text-sm text-slate-500">
				Click the map for another city. Streets and parks reshape this one. Wide roads with a dashed
				line are avenues.
			</p>
		</div>
	);
}
