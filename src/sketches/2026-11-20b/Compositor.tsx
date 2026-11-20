import { RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
	FRAME_H,
	FRAME_W,
	composeScene,
	pinePath,
	pointsToClosedPath,
	polygonPath,
	sceneSnow,
	type ComposeOptions,
	type Scene,
} from "./compose";

function nextSeed(seed: number) {
	return (seed + 1 + Math.floor(Math.random() * 99991)) % 100000;
}

function SceneView({ scene, uid }: { scene: Scene; uid: string }) {
	const snow = sceneSnow(scene);
	const skyId = `${uid}-sky`;

	return (
		<svg
			viewBox={`0 0 ${scene.w} ${scene.h}`}
			className="h-auto w-full"
			role="img"
			aria-label="Generated mountainscape"
		>
			<defs>
				<linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={scene.sky[0]} />
					<stop offset="100%" stopColor={scene.sky[1]} />
				</linearGradient>
			</defs>
			<rect width={scene.w} height={scene.h} fill={`url(#${skyId})`} />
			{scene.accent && (
				<circle
					cx={scene.accent.x}
					cy={scene.accent.y}
					r={scene.accent.r}
					fill={scene.accent.fill}
				/>
			)}
			{scene.layers.map((layer, index) => (
				<g key={`${uid}-layer-${index}`}>
					<path d={pointsToClosedPath(layer.ridge, scene.w, scene.h)} fill={layer.fill} />
					{layer.snow.map((patch, patchIndex) => (
						<path
							key={`${uid}-snow-${index}-${patchIndex}`}
							d={polygonPath(patch)}
							fill={snow}
							opacity={0.7}
						/>
					))}
					{layer.pines.map((pine, pineIndex) => (
						<path key={`${uid}-pine-${index}-${pineIndex}`} d={pinePath(pine)} fill={pine.fill} />
					))}
					{scene.mists[index] && (
						<rect
							x={0}
							y={scene.mists[index]!.y}
							width={scene.w}
							height={scene.mists[index]!.height}
							fill={scene.mists[index]!.fill}
						/>
					)}
				</g>
			))}
			{scene.mists.slice(scene.layers.length).map((mist, index) => (
				<rect
					key={`${uid}-mist-extra-${index}`}
					x={0}
					y={mist.y}
					width={scene.w}
					height={mist.height}
					fill={mist.fill}
				/>
			))}
		</svg>
	);
}

export default function Compositor() {
	const uid = useId().replace(/:/g, "");
	const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
	const [depth, setDepth] = useState(0.55);
	const [trees, setTrees] = useState(0.85);
	const [mist, setMist] = useState(0.35);

	const options = useMemo<ComposeOptions>(() => ({ depth, trees, mist }), [depth, trees, mist]);
	const scene = useMemo(() => composeScene(seed, options), [seed, options]);

	function rerun() {
		setSeed(nextSeed);
	}

	return (
		<div className="mx-auto max-w-4xl px-6 pb-20" data-compositor data-seed={seed}>
			<div
				className="overflow-hidden rounded-md shadow-[0_18px_40px_rgba(40,48,60,0.18)]"
				style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}
			>
				<SceneView scene={scene} uid={uid} />
			</div>
			<div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
				<button
					type="button"
					onClick={rerun}
					className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:border-slate-400"
				>
					<RotateCcw className="size-3.5" strokeWidth={1.75} />
					Rerun
				</button>
				<label className="min-w-36 flex-1 text-xs tracking-wide text-slate-500 uppercase">
					Depth
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={depth}
						aria-label="Depth"
						onChange={(event) => setDepth(Number(event.target.value))}
						className="mt-1 block w-full accent-[#4a5362]"
					/>
				</label>
				<label className="min-w-36 flex-1 text-xs tracking-wide text-slate-500 uppercase">
					Trees
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={trees}
						aria-label="Trees"
						onChange={(event) => setTrees(Number(event.target.value))}
						className="mt-1 block w-full accent-[#4a5362]"
					/>
				</label>
				<label className="min-w-36 flex-1 text-xs tracking-wide text-slate-500 uppercase">
					Mist
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={mist}
						aria-label="Mist"
						onChange={(event) => setMist(Number(event.target.value))}
						className="mt-1 block w-full accent-[#4a5362]"
					/>
				</label>
			</div>
			<p className="mt-4 max-w-xl text-sm text-slate-500">
				Rerun for another composition. Each scene picks a plan — thirds, golden, diagonal, or triangle —
				then layers depth, mass, and sky space from that.
			</p>
		</div>
	);
}
