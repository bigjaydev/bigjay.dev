import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import topology from "./countries-110m.json" with { type: "json" };
import { decodeCountries } from "./countries";
import { fetchHeadlines, formatPublished, type Headline } from "./headlines";
import { countryAt, createWorldMap, paintHighlight, type WorldMapCanvas } from "./paint";

const glowColor = new THREE.Color("#fecef5");

const atmosphereVertex = /* glsl */ `
	varying vec3 vNormal;
	void main() {
		vNormal = normalize(normalMatrix * normal);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const atmosphereFragment = /* glsl */ `
	varying vec3 vNormal;
	uniform vec3 glowColor;
	void main() {
		float fresnel = pow(0.62 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 2.4);
		gl_FragColor = vec4(glowColor, fresnel);
	}
`;

function pointToLonLat(point: THREE.Vector3) {
	const radius = Math.hypot(point.x, point.y, point.z) || 1;
	const y = point.y / radius;
	const phi = Math.atan2(point.z / radius, -point.x / radius);
	const lat = 90 - (Math.acos(Math.min(1, Math.max(-1, y))) * 180) / Math.PI;
	let lon = (phi * 180) / Math.PI - 180;
	if (lon < -180) lon += 360;
	if (lon > 180) lon -= 360;
	return { lon, lat };
}

function Stars() {
	const geometry = useMemo(() => {
		const positions = new Float32Array(280 * 3);
		for (let index = 0; index < 280; index++) {
			const radius = 5.5 + Math.random() * 3.5;
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(2 * Math.random() - 1);
			positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
			positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
			positions[index * 3 + 2] = radius * Math.cos(phi);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		return geo;
	}, []);

	return (
		<points geometry={geometry}>
			<pointsMaterial color="#fecef5" size={0.018} sizeAttenuation transparent opacity={0.75} />
		</points>
	);
}

function Globe({
	map,
	selected,
	onHover,
	onSelect,
}: {
	map: WorldMapCanvas;
	selected: string | null;
	onHover: (name: string | null) => void;
	onSelect: (name: string) => void;
}) {
	const group = useRef<THREE.Group>(null);
	const hovered = useRef<string | null>(null);
	const selectedRef = useRef(selected);
	const armed = useRef<string | null>(null);
	const drag = useRef({
		active: false,
		moved: false,
		x: 0,
		y: 0,
		originX: 0,
		originY: 0,
		spin: 0.12,
	});
	selectedRef.current = selected;
	const { gl } = useThree();

	const texture = useMemo(() => {
		const next = new THREE.CanvasTexture(map.display);
		next.colorSpace = THREE.SRGBColorSpace;
		next.anisotropy = 8;
		return next;
	}, [map]);

	useEffect(() => {
		const canvas = gl.domElement;
		const onDown = (event: PointerEvent) => {
			drag.current.active = true;
			drag.current.moved = false;
			drag.current.x = event.clientX;
			drag.current.y = event.clientY;
			drag.current.originX = event.clientX;
			drag.current.originY = event.clientY;
			canvas.setPointerCapture(event.pointerId);
			canvas.style.cursor = "grabbing";
		};
		const onUp = (event: PointerEvent) => {
			const country = armed.current;
			const moved = drag.current.moved;
			armed.current = null;
			drag.current.active = false;
			if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
			canvas.style.cursor = "grab";
			if (!moved && country) onSelect(country);
		};
		const onMove = (event: PointerEvent) => {
			if (!drag.current.active || !group.current) return;
			const dx = event.clientX - drag.current.x;
			const dy = event.clientY - drag.current.y;
			const travel = Math.hypot(
				event.clientX - drag.current.originX,
				event.clientY - drag.current.originY,
			);
			if (travel > 8) drag.current.moved = true;
			group.current.rotation.y += dx * 0.005;
			group.current.rotation.x = Math.max(
				-0.7,
				Math.min(0.7, group.current.rotation.x + dy * 0.003),
			);
			drag.current.spin = dx * 0.35;
			drag.current.x = event.clientX;
			drag.current.y = event.clientY;
		};

		canvas.addEventListener("pointerdown", onDown);
		canvas.addEventListener("pointerup", onUp);
		canvas.addEventListener("pointercancel", onUp);
		canvas.addEventListener("pointermove", onMove);
		canvas.style.cursor = "grab";

		return () => {
			canvas.removeEventListener("pointerdown", onDown);
			canvas.removeEventListener("pointerup", onUp);
			canvas.removeEventListener("pointercancel", onUp);
			canvas.removeEventListener("pointermove", onMove);
		};
	}, [gl, onSelect]);

	useEffect(() => {
		if (hovered.current) return;
		paintHighlight(map, selected);
		texture.needsUpdate = true;
	}, [map, selected, texture]);

	useFrame((_, delta) => {
		if (!group.current || drag.current.active) return;
		drag.current.spin *= 0.94;
		const idle = hovered.current || selectedRef.current ? 0 : 0.08;
		group.current.rotation.y += (drag.current.spin + idle) * delta;
	});

	const setHover = (name: string | null) => {
		if (name === hovered.current) return;
		hovered.current = name;
		paintHighlight(map, name ?? selectedRef.current);
		texture.needsUpdate = true;
		onHover(name);
	};

	const countryUnder = (event: ThreeEvent<PointerEvent>) => {
		const local = event.object.worldToLocal(event.point.clone());
		const { lon, lat } = pointToLonLat(local);
		return countryAt(map, lon, lat);
	};

	const hoverAt = (event: ThreeEvent<PointerEvent>) => {
		setHover(countryUnder(event));
	};

	const pressAt = (event: ThreeEvent<PointerEvent>) => {
		const name = countryUnder(event);
		armed.current = name;
		setHover(name);
		if (name) onSelect(name);
	};

	return (
		<>
			<Stars />
			<ambientLight intensity={0.38} />
			<directionalLight position={[4.5, 2.2, 3.4]} intensity={2.4} color="#fff4ea" />
			<directionalLight position={[-3.5, -1.4, -2]} intensity={0.35} color="#fecef5" />
			<mesh scale={1.18} raycast={() => null}>
				<sphereGeometry args={[1, 64, 64]} />
				<shaderMaterial
					transparent
					depthWrite={false}
					toneMapped={false}
					side={THREE.BackSide}
					vertexShader={atmosphereVertex}
					fragmentShader={atmosphereFragment}
					uniforms={{ glowColor: { value: glowColor } }}
				/>
			</mesh>
			<group ref={group} rotation={[0.28, -0.7, 0]}>
				<mesh onPointerDown={pressAt} onPointerMove={hoverAt} onPointerOut={() => setHover(null)}>
					<sphereGeometry args={[1, 128, 96]} />
					<meshStandardMaterial map={texture} roughness={0.68} metalness={0.06} />
				</mesh>
			</group>
		</>
	);
}

function Headlines({ country }: { country: string }) {
	const [headlines, setHeadlines] = useState<Headline[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

	useEffect(() => {
		const controller = new AbortController();
		setStatus("loading");
		setHeadlines([]);
		fetchHeadlines(country, controller.signal)
			.then((next) => {
				setHeadlines(next);
				setStatus("ready");
			})
			.catch((error: unknown) => {
				if (error instanceof DOMException && error.name === "AbortError") return;
				setStatus("error");
			});
		return () => controller.abort();
	}, [country]);

	return (
		<div className="mt-8">
			<h2 className="font-space-grotesk text-primary text-2xl">{country}</h2>
			<p className="mt-1 text-sm tracking-wide text-slate-500 uppercase">Today</p>
			{status === "loading" ? <p className="mt-4">Loading headlines…</p> : null}
			{status === "error" ? <p className="mt-4">Headlines could not be loaded.</p> : null}
			{status === "ready" && headlines.length === 0 ? (
				<p className="mt-4">No headlines from the last day.</p>
			) : null}
			{headlines.length > 0 ? (
				<ul className="mt-4 space-y-5">
					{headlines.map((headline) => (
						<li key={headline.url}>
							<a
								href={headline.url}
								target="_blank"
								rel="noreferrer"
								className="text-primary underline"
							>
								{headline.title}
							</a>
							<p className="mt-1 text-sm text-gray-500">
								{headline.source}
								{headline.published ? ` · ${formatPublished(headline.published)}` : ""}
							</p>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

export default function WorldMap() {
	const [hovered, setHovered] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const map = useMemo(() => createWorldMap(decodeCountries(topology)), []);

	return (
		<div className="mx-auto max-w-6xl px-6 pb-12">
			<section
				aria-label="3D world map"
				className="relative h-[min(70vh,640px)] min-h-[420px] w-full overflow-hidden rounded-3xl bg-[#191b1a]"
			>
				<Canvas
					camera={{ position: [0, 0.18, 2.55], fov: 40 }}
					dpr={[1, 2]}
					gl={{ antialias: true }}
					style={{ width: "100%", height: "100%", touchAction: "none" }}
				>
					<color attach="background" args={["#191b1a"]} />
					<Globe map={map} selected={selected} onHover={setHovered} onSelect={setSelected} />
				</Canvas>
				<div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
					<p className="font-space-grotesk text-xl text-[#fecef5]">
						{hovered ?? selected ?? "World"}
					</p>
					<p className="text-xs tracking-[0.16em] text-[#fecef5]/70 uppercase">
						Click for today’s headlines
					</p>
				</div>
			</section>
			{selected ? <Headlines country={selected} /> : null}
		</div>
	);
}
