import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import {
	ISO2_COORDS,
	latLonToVec3,
	type ConflictZone,
	type CyberArc,
	type NewsArticle,
} from "./data";

const GLOBE_R = 1.6;
const ACCENT = "#3dffb5";
const HOT = "#ff6b3d";
const WAR = "#ff4d6d";
const CYBER = "#46e0ff";
const EARTH_TEX =
	"https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-dark.jpg";
const COUNTRIES_URL =
	"https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_110m_admin_0_countries.geojson";

type GlobeProps = {
	articles: NewsArticle[];
	conflicts: ConflictZone[];
	cyberArcs: CyberArc[];
	selectedId: string | null;
	selectedConflictId: string | null;
	selectedArcId: string | null;
	onSelect: (article: NewsArticle) => void;
	onSelectConflict: (zone: ConflictZone) => void;
	onSelectArc: (arc: CyberArc) => void;
};

export function GlobeView({
	articles,
	conflicts,
	cyberArcs,
	selectedId,
	selectedConflictId,
	selectedArcId,
	onSelect,
	onSelectConflict,
	onSelectArc,
}: GlobeProps) {
	return (
		<Canvas
			camera={{ position: [0, 0.3, 4.35], fov: 40 }}
			dpr={[1, 1.75]}
			gl={{ antialias: true, alpha: true }}
			style={{ width: "100%", height: "100%", touchAction: "none" }}
		>
			<color attach="background" args={["#050807"]} />
			<ambientLight intensity={0.35} />
			<directionalLight position={[5, 3, 2]} intensity={0.55} color="#9fd9bc" />
			<pointLight position={[-3, -1, -4]} intensity={0.18} color="#3dffb5" />
			<GlobeScene
				articles={articles}
				conflicts={conflicts}
				cyberArcs={cyberArcs}
				selectedId={selectedId}
				selectedConflictId={selectedConflictId}
				selectedArcId={selectedArcId}
				onSelect={onSelect}
				onSelectConflict={onSelectConflict}
				onSelectArc={onSelectArc}
			/>
		</Canvas>
	);
}

function GlobeScene({
	articles,
	conflicts,
	cyberArcs,
	selectedId,
	selectedConflictId,
	selectedArcId,
	onSelect,
	onSelectConflict,
	onSelectArc,
}: GlobeProps) {
	const group = useRef<THREE.Group>(null);
	const { gl } = useThree();
	const drag = useRef({ active: false, x: 0, y: 0, moved: false, lon: 0.55, lat: 0.22 });
	const target = useRef({ lon: 0.55, lat: 0.22 });
	const [hoverId, setHoverId] = useState<string | null>(null);

	useEffect(() => {
		const el = gl.domElement;
		const onDown = (e: PointerEvent) => {
			drag.current.active = true;
			drag.current.moved = false;
			drag.current.x = e.clientX;
			drag.current.y = e.clientY;
			el.setPointerCapture(e.pointerId);
		};
		const onMove = (e: PointerEvent) => {
			if (!drag.current.active) return;
			const dx = e.clientX - drag.current.x;
			const dy = e.clientY - drag.current.y;
			if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
			drag.current.x = e.clientX;
			drag.current.y = e.clientY;
			target.current.lon += dx * 0.005;
			target.current.lat = THREE.MathUtils.clamp(target.current.lat + dy * 0.004, -0.95, 0.95);
		};
		const onUp = (e: PointerEvent) => {
			drag.current.active = false;
			try {
				el.releasePointerCapture(e.pointerId);
			} catch {
				/* already released */
			}
		};
		el.addEventListener("pointerdown", onDown);
		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerup", onUp);
		el.addEventListener("pointercancel", onUp);
		return () => {
			el.removeEventListener("pointerdown", onDown);
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerup", onUp);
			el.removeEventListener("pointercancel", onUp);
		};
	}, [gl]);

	useFrame(() => {
		if (!group.current) return;
		drag.current.lon += (target.current.lon - drag.current.lon) * 0.12;
		drag.current.lat += (target.current.lat - drag.current.lat) * 0.12;
		group.current.rotation.y = drag.current.lon;
		group.current.rotation.x = drag.current.lat;
	});

	return (
		<group ref={group}>
			<EarthMesh />
			<CountryBorders />
			<Atmosphere />
			<CyberArcLayer
				arcs={cyberArcs}
				selectedId={selectedArcId}
				onSelect={onSelectArc}
				dragRef={drag}
			/>
			{conflicts.map((z) => (
				<ConflictMarker
					key={z.id}
					zone={z}
					selected={selectedConflictId === z.id}
					hovered={hoverId === z.id}
					onHover={setHoverId}
					onSelect={onSelectConflict}
					dragRef={drag}
				/>
			))}
			{articles
				.filter((a) => typeof a.lat === "number" && typeof a.lon === "number")
				.map((a) => (
					<NewsMarker
						key={a.id}
						article={a}
						selected={selectedId === a.id}
						hovered={hoverId === a.id}
						onHover={setHoverId}
						onSelect={onSelect}
						dragRef={drag}
					/>
				))}
		</group>
	);
}

function CyberArcLayer({
	arcs,
	selectedId,
	onSelect,
	dragRef,
}: {
	arcs: CyberArc[];
	selectedId: string | null;
	onSelect: (arc: CyberArc) => void;
	dragRef: MutableRefObject<{ moved: boolean }>;
}) {
	const paths = useMemo(
		() =>
			arcs.map((arc) => ({
				arc,
				positions: greatCirclePositions(
					arc.fromLat,
					arc.fromLon,
					arc.toLat,
					arc.toLon,
					GLOBE_R * 1.04,
					48,
				),
			})),
		[arcs],
	);

	return (
		<group>
			{paths.map(({ arc, positions }) => (
				<CyberArcMesh
					key={arc.id}
					arc={arc}
					positions={positions}
					selected={selectedId === arc.id}
					onSelect={onSelect}
					dragRef={dragRef}
				/>
			))}
		</group>
	);
}

function CyberArcMesh({
	arc,
	positions,
	selected,
	onSelect,
	dragRef,
}: {
	arc: CyberArc;
	positions: Float32Array;
	selected: boolean;
	onSelect: (arc: CyberArc) => void;
	dragRef: MutableRefObject<{ moved: boolean }>;
}) {
	const head = useRef<THREE.Mesh>(null);
	const tRef = useRef(Math.random());
	const pointCount = positions.length / 3;

	useFrame((_, dt) => {
		tRef.current = (tRef.current + dt * (0.12 + Math.min(arc.count, 40) * 0.004)) % 1;
		if (!head.current || pointCount < 2) return;
		const f = tRef.current * (pointCount - 1);
		const i = Math.floor(f);
		const u = f - i;
		const i3 = Math.min(i, pointCount - 2) * 3;
		const ax = positions[i3]!;
		const ay = positions[i3 + 1]!;
		const az = positions[i3 + 2]!;
		const bx = positions[i3 + 3]!;
		const by = positions[i3 + 4]!;
		const bz = positions[i3 + 5]!;
		head.current.position.set(ax + (bx - ax) * u, ay + (by - ay) * u, az + (bz - az) * u);
	});

	const opacity = selected ? 0.85 : Math.min(0.55, 0.18 + arc.count * 0.02);

	return (
		<group>
			<line
				onClick={(e) => {
					e.stopPropagation();
					if (dragRef.current.moved) return;
					onSelect(arc);
				}}
			>
				<bufferGeometry>
					<bufferAttribute attach="attributes-position" args={[positions, 3]} />
				</bufferGeometry>
				<lineBasicMaterial color={CYBER} transparent opacity={opacity} toneMapped={false} />
			</line>
			<mesh ref={head} raycast={() => {}}>
				<sphereGeometry args={[selected ? 0.022 : 0.014, 10, 8]} />
				<meshBasicMaterial color={CYBER} toneMapped={false} />
			</mesh>
		</group>
	);
}

function EarthMesh() {
	const [texture, setTexture] = useState<THREE.Texture | null>(null);

	useEffect(() => {
		const loader = new THREE.TextureLoader();
		loader.crossOrigin = "anonymous";
		let cancelled = false;
		loader.load(
			EARTH_TEX,
			(tex) => {
				if (cancelled) return;
				tex.colorSpace = THREE.SRGBColorSpace;
				tex.anisotropy = 8;
				setTexture(tex);
			},
			undefined,
			() => {
				/* texture optional — borders still render */
			},
		);
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<mesh>
			<sphereGeometry args={[GLOBE_R, 72, 54]} />
			{texture ? (
				<meshStandardMaterial
					map={texture}
					color="#2a4a3a"
					emissive="#020805"
					emissiveIntensity={0.08}
					metalness={0.12}
					roughness={0.95}
				/>
			) : (
				<meshStandardMaterial
					color="#050a08"
					emissive="#06140e"
					emissiveIntensity={0.18}
					metalness={0.15}
					roughness={0.92}
				/>
			)}
		</mesh>
	);
}

function CountryBorders() {
	const [border, setBorder] = useState<{
		segments: Float32Array;
		paths: BorderPath[];
		labels: CountryLabel[];
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch(COUNTRIES_URL)
			.then((r) => r.json())
			.then((geo: GeoFeatureCollection) => {
				if (cancelled) return;
				setBorder({
					...geoJsonToBorders(geo, GLOBE_R * 1.004),
					labels: geoJsonToLabels(geo),
				});
			})
			.catch(() => {
				/* keep globe usable without borders */
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!border) return null;

	return (
		<>
			<lineSegments>
				<bufferGeometry>
					<bufferAttribute attach="attributes-position" args={[border.segments, 3]} />
				</bufferGeometry>
				<lineBasicMaterial color={ACCENT} transparent opacity={0.38} />
			</lineSegments>
			<BorderTracers paths={border.paths} />
			<CountryLabelLayer labels={border.labels} />
		</>
	);
}

function CountryLabelLayer({ labels }: { labels: CountryLabel[] }) {
	return (
		<group>
			{labels.map((label) => (
				<CountryLabelSprite key={label.id} label={label} />
			))}
		</group>
	);
}

function CountryLabelSprite({ label }: { label: CountryLabel }) {
	const spriteRef = useRef<THREE.Sprite>(null);
	const matRef = useRef<THREE.SpriteMaterial>(null);
	const tmp = useMemo(() => new THREE.Vector3(), []);
	const camDir = useMemo(() => new THREE.Vector3(), []);

	const { map, scale } = useMemo(() => {
		const { texture, aspect } = makeLabelTexture(label.name);
		const h = label.rank <= 2 ? 0.072 : label.rank <= 3 ? 0.06 : 0.05;
		return { map: texture, scale: new THREE.Vector3(h * aspect, h, 1) };
	}, [label.name, label.rank]);

	useEffect(() => {
		return () => {
			map.dispose();
		};
	}, [map]);

	const pos = useMemo(
		() => toVec3(label.lat, label.lon, GLOBE_R * 1.035),
		[label.lat, label.lon],
	);

	useFrame(({ camera }) => {
		const sprite = spriteRef.current;
		const mat = matRef.current;
		if (!sprite || !mat) return;
		sprite.getWorldPosition(tmp).normalize();
		camDir.copy(camera.position).normalize();
		// Hide labels on the far side of the globe
		const facing = tmp.dot(camDir);
		const visible = facing > 0.18;
		sprite.visible = visible;
		if (visible) {
			mat.opacity = Math.min(0.92, (facing - 0.18) * 2.2);
		}
	});

	return (
		<sprite ref={spriteRef} position={pos} scale={scale} renderOrder={2}>
			<spriteMaterial
				ref={matRef}
				map={map}
				transparent
				depthWrite={false}
				depthTest
				toneMapped={false}
				sizeAttenuation
			/>
		</sprite>
	);
}

function makeLabelTexture(text: string) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d")!;
	const fontSize = 26;
	const font = `500 ${fontSize}px "IBM Plex Mono", ui-monospace, monospace`;
	ctx.font = font;
	const padX = 4;
	const padY = 4;
	const textW = Math.ceil(ctx.measureText(text).width);
	canvas.width = textW + padX * 2;
	canvas.height = fontSize + padY * 2;
	ctx.font = font;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	// Soft outline for readability, no fill chip
	ctx.lineWidth = 3;
	ctx.strokeStyle = "rgba(5, 12, 10, 0.85)";
	ctx.lineJoin = "round";
	ctx.textBaseline = "middle";
	ctx.textAlign = "left";
	const y = canvas.height / 2 + 1;
	ctx.strokeText(text, padX, y);
	ctx.fillStyle = "#9fd9bc";
	ctx.fillText(text, padX, y);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	texture.needsUpdate = true;
	return { texture, aspect: canvas.width / canvas.height };
}

const TRACER_COUNT = 7;
const TRAIL_POINTS = 48;

function BorderTracers({ paths }: { paths: BorderPath[] }) {
	const tracers = useMemo(() => pickTracerRoutes(paths, TRACER_COUNT), [paths]);
	const headRefs = useRef<(THREE.Mesh | null)[]>([]);
	const trailGeos = useRef<(THREE.BufferGeometry | null)[]>([]);
	const progress = useRef(tracers.map((t) => t.offset));

	const trailPositions = useMemo(
		() => tracers.map(() => new Float32Array(TRAIL_POINTS * 3)),
		[tracers],
	);
	const trailColors = useMemo(() => {
		const line = new THREE.Color(ACCENT).multiplyScalar(0.38);
		return tracers.map((t) => {
			const colors = new Float32Array(TRAIL_POINTS * 3);
			const head = new THREE.Color(t.color);
			for (let i = 0; i < TRAIL_POINTS; i++) {
				// Head bright → tail matches base country line color
				const tNorm = i / (TRAIL_POINTS - 1);
				const ease = Math.pow(tNorm, 1.25);
				colors[i * 3] = line.r + (head.r - line.r) * ease;
				colors[i * 3 + 1] = line.g + (head.g - line.g) * ease;
				colors[i * 3 + 2] = line.b + (head.b - line.b) * ease;
			}
			return colors;
		});
	}, [tracers]);

	const scratch = useMemo(() => new THREE.Vector3(), []);

	useFrame((_, dt) => {
		for (let ti = 0; ti < tracers.length; ti++) {
			const route = tracers[ti]!;
			progress.current[ti] = (progress.current[ti]! + dt * route.speed) % route.path.total;

			const headDist = progress.current[ti]!;
			samplePathInto(route.path, headDist, scratch);
			const headMesh = headRefs.current[ti];
			if (headMesh) headMesh.position.copy(scratch);

			const pos = trailPositions[ti]!;
			const trailLen = route.trailLen;
			for (let i = 0; i < TRAIL_POINTS; i++) {
				const u = i / (TRAIL_POINTS - 1);
				const dist = (headDist - trailLen * (1 - u) + route.path.total * 8) % route.path.total;
				samplePathInto(route.path, dist, scratch);
				pos[i * 3] = scratch.x;
				pos[i * 3 + 1] = scratch.y;
				pos[i * 3 + 2] = scratch.z;
			}
			const geo = trailGeos.current[ti];
			const attr = geo?.getAttribute("position") as THREE.BufferAttribute | undefined;
			if (attr) attr.needsUpdate = true;
		}
	});

	if (!tracers.length) return null;

	return (
		<group>
			{tracers.map((route, ti) => (
				<group key={route.id}>
					<line>
						<bufferGeometry
							ref={(g) => {
								trailGeos.current[ti] = g;
							}}
						>
							<bufferAttribute attach="attributes-position" args={[trailPositions[ti]!, 3]} />
							<bufferAttribute attach="attributes-color" args={[trailColors[ti]!, 3]} />
						</bufferGeometry>
						<lineBasicMaterial vertexColors transparent opacity={0.95} toneMapped={false} />
					</line>
					<mesh
						ref={(m) => {
							headRefs.current[ti] = m;
						}}
					>
						<sphereGeometry args={[0.014, 10, 8]} />
						<meshBasicMaterial color={route.color} transparent opacity={0.9} toneMapped={false} />
					</mesh>
				</group>
			))}
			{tracers.map((route, ti) => (
				<TracerHalo key={`halo-${route.id}`} headRef={headRefs} index={ti} color={route.color} />
			))}
		</group>
	);
}

function TracerHalo({
	headRef,
	index,
	color,
}: {
	headRef: MutableRefObject<(THREE.Mesh | null)[]>;
	index: number;
	color: string;
}) {
	const halo = useRef<THREE.Mesh>(null);
	useFrame(() => {
		const head = headRef.current[index];
		if (!halo.current || !head) return;
		halo.current.position.copy(head.position);
	});
	return (
		<mesh ref={halo}>
			<sphereGeometry args={[0.028, 10, 8]} />
			<meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
		</mesh>
	);
}

function Atmosphere() {
	return (
		<mesh>
			<sphereGeometry args={[GLOBE_R * 1.045, 48, 32]} />
			<meshBasicMaterial color={ACCENT} transparent opacity={0.035} side={THREE.BackSide} />
		</mesh>
	);
}

function ConflictMarker({
	zone,
	selected,
	hovered,
	onHover,
	onSelect,
	dragRef,
}: {
	zone: ConflictZone;
	selected: boolean;
	hovered: boolean;
	onHover: (id: string | null) => void;
	onSelect: (z: ConflictZone) => void;
	dragRef: MutableRefObject<{ moved: boolean }>;
}) {
	const pos = useMemo(() => latLonToVec3(zone.lat, zone.lon, GLOBE_R * 1.02), [zone.lat, zone.lon]);
	const orient = useMemo(() => {
		const q = new THREE.Quaternion();
		const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
		q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
		return q;
	}, [pos.x, pos.y, pos.z]);
	const arcs = useMemo(() => buildPartyArcs(zone), [zone]);
	const pulse = useRef(Math.random() * 10);
	const ring = useRef<THREE.Mesh>(null);
	const core = useRef<THREE.Mesh>(null);
	const active = selected || hovered;
	const dimmed = zone.status === "concluded";
	const color = zone.status === "ceasefire" ? "#f0c040" : WAR;

	useFrame((_, dt) => {
		pulse.current += dt * (active ? 2.2 : 1.3);
		const t = pulse.current;
		if (ring.current) {
			const s = 1 + Math.sin(t) * 0.08;
			ring.current.scale.setScalar(s);
			(ring.current.material as THREE.MeshBasicMaterial).opacity = dimmed
				? 0.18
				: active
					? 0.55 + Math.sin(t * 1.4) * 0.15
					: 0.32 + Math.sin(t) * 0.08;
		}
		if (core.current) {
			core.current.scale.setScalar(active ? 1.2 + Math.sin(t * 1.5) * 0.1 : 1 + Math.sin(t) * 0.05);
		}
	});

	return (
		<group>
			{arcs.map((arc) => (
				<line key={arc.key}>
					<bufferGeometry>
						<bufferAttribute attach="attributes-position" args={[arc.positions, 3]} />
					</bufferGeometry>
					<lineBasicMaterial
						color={color}
						transparent
						opacity={selected ? 0.75 : 0.35}
						toneMapped={false}
					/>
				</line>
			))}
			<group position={[pos.x, pos.y, pos.z]} quaternion={orient}>
				<mesh ref={ring} raycast={() => {}}>
					<ringGeometry args={[zone.radius * 0.55, zone.radius * 0.72, 48]} />
					<meshBasicMaterial
						color={color}
						transparent
						opacity={0.35}
						depthWrite={false}
						side={THREE.DoubleSide}
						toneMapped={false}
					/>
				</mesh>
				<mesh
					ref={core}
					onClick={(e) => {
						e.stopPropagation();
						if (dragRef.current.moved) return;
						onSelect(zone);
					}}
					onPointerOver={(e) => {
						e.stopPropagation();
						onHover(zone.id);
						document.body.style.cursor = "pointer";
					}}
					onPointerOut={() => {
						onHover(null);
						document.body.style.cursor = "default";
					}}
				>
					<sphereGeometry args={[0.038, 14, 12]} />
					<meshBasicMaterial color={color} transparent opacity={dimmed ? 0.45 : 0.95} toneMapped={false} />
				</mesh>
			</group>
		</group>
	);
}

function buildPartyArcs(zone: ConflictZone) {
	const withIso = zone.parties.filter((p) => p.iso2 && ISO2_COORDS[p.iso2.toUpperCase()]);
	const unique = new Map<string, { lat: number; lon: number; name: string }>();
	for (const p of withIso) {
		const iso = p.iso2!.toUpperCase();
		const c = ISO2_COORDS[iso]!;
		unique.set(iso, { lat: c.lat, lon: c.lon, name: p.name });
	}
	const pts = [...unique.values()];
	if (pts.length < 2) return [] as Array<{ key: string; positions: Float32Array }>;

	const arcs: Array<{ key: string; positions: Float32Array }> = [];
	// Connect first party to each other distinct party (star), capped
	const a = pts[0]!;
	for (let i = 1; i < Math.min(pts.length, 4); i++) {
		const b = pts[i]!;
		arcs.push({
			key: `${zone.id}-${i}`,
			positions: greatCirclePositions(a.lat, a.lon, b.lat, b.lon, GLOBE_R * 1.035, 36),
		});
	}
	return arcs;
}

function greatCirclePositions(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
	radius: number,
	segments: number,
) {
	const a = toVec3(lat1, lon1, 1).normalize();
	const b = toVec3(lat2, lon2, 1).normalize();
	const positions = new Float32Array((segments + 1) * 3);
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const p = new THREE.Vector3().copy(a).lerp(b, t).normalize().multiplyScalar(radius);
		// lift arc slightly
		const lift = 1 + Math.sin(t * Math.PI) * 0.06;
		p.multiplyScalar(lift);
		positions[i * 3] = p.x;
		positions[i * 3 + 1] = p.y;
		positions[i * 3 + 2] = p.z;
	}
	return positions;
}

function NewsMarker({
	article,
	selected,
	hovered,
	onHover,
	onSelect,
	dragRef,
}: {
	article: NewsArticle;
	selected: boolean;
	hovered: boolean;
	onHover: (id: string | null) => void;
	onSelect: (a: NewsArticle) => void;
	dragRef: MutableRefObject<{ moved: boolean }>;
}) {
	const pos = useMemo(
		() => latLonToVec3(article.lat ?? 0, article.lon ?? 0, GLOBE_R * 1.025),
		[article.lat, article.lon],
	);
	const orient = useMemo(() => {
		const q = new THREE.Quaternion();
		const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
		q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
		return q;
	}, [pos.x, pos.y, pos.z]);

	const phase = useMemo(() => (article.lat ?? 0) * 0.35 + (article.lon ?? 0) * 0.11, [article.lat, article.lon]);
	const pulse = useRef(phase);
	const core = useRef<THREE.Mesh>(null);
	const glow = useRef<THREE.Mesh>(null);
	const rippleA = useRef<THREE.Mesh>(null);
	const rippleB = useRef<THREE.Mesh>(null);
	const selectRing = useRef<THREE.Mesh>(null);
	const colorRef = useRef(new THREE.Color(ACCENT));
	const active = selected || hovered;
	const color = selected ? HOT : ACCENT;
	colorRef.current.set(color);

	useFrame((_, dt) => {
		pulse.current += dt * (active ? 2.8 : 1.7);
		const t = pulse.current;
		const c = colorRef.current;

		if (core.current) {
			const s = active ? 1.15 + Math.sin(t * 1.6) * 0.12 : 1 + Math.sin(t * 1.2) * 0.06;
			core.current.scale.setScalar(s);
			(core.current.material as THREE.MeshBasicMaterial).color.copy(c);
		}
		if (glow.current) {
			const mat = glow.current.material as THREE.MeshBasicMaterial;
			mat.color.copy(c);
			mat.opacity = active ? 0.28 + Math.sin(t * 1.6) * 0.1 : 0.14 + Math.sin(t * 1.2) * 0.05;
			const s = active ? 1.6 + Math.sin(t * 1.6) * 0.2 : 1.35 + Math.sin(t * 1.2) * 0.12;
			glow.current.scale.setScalar(s);
		}

		animateRipple(rippleA.current, t, 0, active, c);
		animateRipple(rippleB.current, t, Math.PI * 0.85, active, c);

		if (selectRing.current) {
			const mat = selectRing.current.material as THREE.MeshBasicMaterial;
			const spin = t * 0.6;
			selectRing.current.rotation.z = spin;
			mat.opacity = 0.55 + Math.sin(t * 2.2) * 0.25;
			const s = 1 + Math.sin(t * 2.2) * 0.06;
			selectRing.current.scale.setScalar(s);
		}
	});

	const handleClick = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		if (dragRef.current.moved) return;
		onSelect(article);
	};

	return (
		<group position={[pos.x, pos.y, pos.z]} quaternion={orient}>
			<mesh
				ref={rippleA}
				raycast={() => {}}
			>
				<ringGeometry args={[0.04, 0.055, 40]} />
				<meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
			</mesh>
			<mesh
				ref={rippleB}
				raycast={() => {}}
			>
				<ringGeometry args={[0.04, 0.055, 40]} />
				<meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
			</mesh>
			{selected && (
				<mesh ref={selectRing} raycast={() => {}}>
					<ringGeometry args={[0.07, 0.09, 40]} />
					<meshBasicMaterial color={HOT} transparent opacity={0.75} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
				</mesh>
			)}
			<mesh ref={glow} raycast={() => {}}>
				<sphereGeometry args={[0.04, 12, 10]} />
				<meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
			</mesh>
			<mesh
				ref={core}
				onClick={handleClick}
				onPointerOver={(e) => {
					e.stopPropagation();
					onHover(article.id);
					document.body.style.cursor = "pointer";
				}}
				onPointerOut={() => {
					onHover(null);
					document.body.style.cursor = "default";
				}}
			>
				<sphereGeometry args={[0.032, 14, 12]} />
				<meshBasicMaterial color={color} toneMapped={false} />
			</mesh>
		</group>
	);
}

function animateRipple(
	mesh: THREE.Mesh | null,
	t: number,
	phaseShift: number,
	active: boolean,
	color: THREE.Color,
) {
	if (!mesh) return;
	const mat = mesh.material as THREE.MeshBasicMaterial;
	mat.color.copy(color);
	const cycle = ((t * (active ? 0.55 : 0.38) + phaseShift) % (Math.PI * 2)) / (Math.PI * 2);
	const s = 1 + cycle * (active ? 3.2 : 2.6);
	mesh.scale.setScalar(s);
	mat.opacity = Math.max(0, (1 - cycle) * (active ? 0.55 : 0.38));
}

type GeoFeatureCollection = {
	features: Array<{
		properties?: {
			NAME?: string;
			ADMIN?: string;
			ABBREV?: string;
			LABELRANK?: number;
		};
		geometry: {
			type: string;
			coordinates: number[][][] | number[][][][];
		} | null;
	}>;
};

type CountryLabel = {
	id: string;
	name: string;
	lat: number;
	lon: number;
	rank: number;
};

type BorderPath = {
	points: THREE.Vector3[];
	cumulative: number[];
	total: number;
};

type TracerRoute = {
	id: string;
	path: BorderPath;
	speed: number;
	trailLen: number;
	offset: number;
	color: string;
};

const TRACER_COLORS = ["#3dffb5", "#7dffd0", "#b8ffe6", "#5cffc4", "#a6ff88", "#46e0ff", "#ffe08a"];

function geoJsonToBorders(geo: GeoFeatureCollection, radius: number) {
	const segments: number[] = [];
	const paths: BorderPath[] = [];

	const addRing = (ring: number[][]) => {
		const runs: THREE.Vector3[][] = [[]];
		for (let i = 0; i < ring.length; i++) {
			const lon = ring[i]![0]!;
			const lat = ring[i]![1]!;
			const v = toVec3(lat, lon, radius);
			if (i > 0) {
				const prevLon = ring[i - 1]![0]!;
				if (Math.abs(lon - prevLon) > 180) {
					runs.push([]);
				} else {
					const prev = runs[runs.length - 1]!;
					const a = prev[prev.length - 1]!;
					segments.push(a.x, a.y, a.z, v.x, v.y, v.z);
				}
			}
			runs[runs.length - 1]!.push(v);
		}
		for (const run of runs) {
			if (run.length > 12) paths.push(buildPath(run));
		}
	};

	for (const feature of geo.features) {
		const g = feature.geometry;
		if (!g) continue;
		if (g.type === "Polygon") {
			for (const ring of g.coordinates as number[][][]) addRing(ring);
		} else if (g.type === "MultiPolygon") {
			for (const poly of g.coordinates as number[][][][]) {
				for (const ring of poly) addRing(ring);
			}
		}
	}

	return { segments: new Float32Array(segments), paths };
}

function geoJsonToLabels(geo: GeoFeatureCollection): CountryLabel[] {
	const out: CountryLabel[] = [];
	for (const feature of geo.features) {
		const props = feature.properties;
		const g = feature.geometry;
		if (!props || !g) continue;
		const rank = typeof props.LABELRANK === "number" ? props.LABELRANK : 99;
		// Keep major / mid labels only — 110m has ~177 countries
		if (rank > 5) continue;
		const full = (props.NAME || props.ADMIN || "").trim();
		if (!full) continue;
		const abbrev = (props.ABBREV || "").replace(/\./g, "").trim();
		const name = full.length > 16 && abbrev ? abbrev : full.length > 22 ? `${full.slice(0, 20)}…` : full;
		const center = featureCentroid(g);
		if (!center) continue;
		out.push({
			id: `${full}-${rank}`,
			name,
			lat: center.lat,
			lon: center.lon,
			rank,
		});
	}
	out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
	return out;
}

function featureCentroid(geometry: {
	type: string;
	coordinates: number[][][] | number[][][][];
}): { lat: number; lon: number } | null {
	let best: number[][] | null = null;
	let bestScore = -1;
	const consider = (ring: number[][]) => {
		if (ring.length < 3) return;
		let score = 0;
		for (let i = 1; i < ring.length; i++) {
			const dx = ring[i]![0]! - ring[i - 1]![0]!;
			const dy = ring[i]![1]! - ring[i - 1]![1]!;
			score += Math.hypot(dx, dy);
		}
		if (score > bestScore) {
			bestScore = score;
			best = ring;
		}
	};
	if (geometry.type === "Polygon") {
		consider((geometry.coordinates as number[][][])[0]!);
	} else if (geometry.type === "MultiPolygon") {
		for (const poly of geometry.coordinates as number[][][][]) consider(poly[0]!);
	}
	if (!best) return null;
	let lon = 0;
	let lat = 0;
	const closed =
		best.length > 1 &&
		best[0]![0] === best[best.length - 1]![0] &&
		best[0]![1] === best[best.length - 1]![1];
	const n = best.length - (closed ? 1 : 0);
	if (n <= 0) return null;
	// Average in a local unwrap so antimeridian countries don't collapse
	const baseLon = best[0]![0]!;
	for (let i = 0; i < n; i++) {
		let x = best[i]![0]!;
		while (x - baseLon > 180) x -= 360;
		while (x - baseLon < -180) x += 360;
		lon += x;
		lat += best[i]![1]!;
	}
	lon /= n;
	lat /= n;
	while (lon > 180) lon -= 360;
	while (lon < -180) lon += 360;
	return { lat, lon };
}

function toVec3(lat: number, lon: number, radius: number) {
	const p = latLonToVec3(lat, lon, radius);
	return new THREE.Vector3(p.x, p.y, p.z);
}

function buildPath(points: THREE.Vector3[]): BorderPath {
	const cumulative = [0];
	for (let i = 1; i < points.length; i++) {
		cumulative[i] = cumulative[i - 1]! + points[i]!.distanceTo(points[i - 1]!);
	}
	return { points, cumulative, total: Math.max(cumulative[cumulative.length - 1]!, 0.001) };
}

function samplePathInto(path: BorderPath, dist: number, out: THREE.Vector3) {
	const d = ((dist % path.total) + path.total) % path.total;
	const cum = path.cumulative;
	let lo = 0;
	let hi = cum.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (cum[mid]! < d) lo = mid + 1;
		else hi = mid;
	}
	const i = Math.max(1, lo);
	const d0 = cum[i - 1]!;
	const d1 = cum[i]!;
	const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
	return out.copy(path.points[i - 1]!).lerp(path.points[i]!, t);
}

function pickTracerRoutes(paths: BorderPath[], count: number): TracerRoute[] {
	const ranked = [...paths].sort((a, b) => b.total - a.total);
	const chosen = ranked.slice(0, Math.min(count * 3, ranked.length));
	// spread picks across long coasts / borders
	const step = Math.max(1, Math.floor(chosen.length / count));
	const out: TracerRoute[] = [];
	for (let i = 0; i < count && i * step < chosen.length; i++) {
		const path = chosen[i * step]!;
		out.push({
			id: `tr-${i}`,
			path,
			speed: 0.045 + (i % 3) * 0.018,
			trailLen: Math.min(path.total * 0.12, 0.85),
			offset: (path.total * (i * 0.17 + 0.05)) % path.total,
			color: TRACER_COLORS[i % TRACER_COLORS.length]!,
		});
	}
	return out;
}
