import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { drawHud, drawMapIcons } from "./hud";
import type { Score } from "./sound";
import { useBattle, type Chassis } from "./store";
import { ScionHull, TankBody } from "./tanks";
import {
	CRATER,
	GEYSERS,
	START,
	WATER_Y,
	clamp,
	groundNormal,
	roadAt,
	rocksAround,
	surface,
	terrainHeight,
	wrapAngle,
} from "./world";

const SEG = 168;
const CELL = 7;
const STRIDE = SEG + 1;

export type ControlState = {
	keys: Set<string>;
	fire: boolean;
	shot: boolean;
	missile: boolean;
	aimX: number;
	aimY: number;
	zoom: number;
	locked: boolean;
	pick: { nx: number; ny: number } | null;
};

const dummy = new THREE.Object3D();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function floats(attribute: THREE.BufferAttribute): Float32Array {
	return attribute.array as Float32Array;
}

function paintVertex(colors: Float32Array, index: number, x: number, z: number, y: number) {
	const t = clamp((y + 20) / 120, 0, 1);
	let r = 0.48 + t * 0.34;
	let g = 0.24 + t * 0.28;
	let b = 0.13 + t * 0.16;
	if (y > 48) {
		const pale = clamp((y - 48) / 70, 0, 1);
		r += (0.74 - r) * pale * 0.55;
		g += (0.64 - g) * pale * 0.55;
		b += (0.52 - b) * pale * 0.55;
	}
	const slope = Math.abs(terrainHeight(x + 7, z) - y) + Math.abs(terrainHeight(x, z + 7) - y);
	const rock = clamp((slope - 9) / 14, 0, 1);
	r = r * (1 - rock) + 0.4 * rock;
	g = g * (1 - rock) + 0.3 * rock;
	b = b * (1 - rock) + 0.22 * rock;
	const road = roadAt(x, z);
	if (road && road.weight > 0.35) {
		const track = road.weight * 0.55;
		r = r * (1 - track) + 0.28 * track;
		g = g * (1 - track) + 0.16 * track;
		b = b * (1 - track) + 0.09 * track;
	}
	if (y < WATER_Y + 1.2) {
		const lake = Math.hypot(x - CRATER.x, z - CRATER.z);
		if (lake > 200 && lake < 1080) {
			r = 0.26;
			g = 0.32;
			b = 0.3;
		}
	}
	const mottled = 0.78 + (Math.sin(x * 0.045) * Math.cos(z * 0.038) + 1) * 0.5 * 0.4;
	colors[index * 3] = r * mottled;
	colors[index * 3 + 1] = g * mottled;
	colors[index * 3 + 2] = b * mottled;
}

function fillVertex(
	pos: Float32Array,
	col: Float32Array,
	ix: number,
	iy: number,
	cx: number,
	cz: number,
) {
	const x = (cx + ix - SEG / 2) * CELL;
	const z = (cz + iy - SEG / 2) * CELL;
	const y = terrainHeight(x, z);
	const index = ix + iy * STRIDE;
	pos[index * 3] = x;
	pos[index * 3 + 1] = y;
	pos[index * 3 + 2] = z;
	paintVertex(col, index, x, z, y);
}

function writeNormal(pos: Float32Array, norm: Float32Array, ix: number, iy: number) {
	const index = ix + iy * STRIDE;
	const yHere = pos[index * 3 + 1];
	const yLeft = ix > 0 ? pos[(index - 1) * 3 + 1] : yHere;
	const yRight = ix < SEG ? pos[(index + 1) * 3 + 1] : yHere;
	const yDown = iy > 0 ? pos[(index - STRIDE) * 3 + 1] : yHere;
	const yUp = iy < SEG ? pos[(index + STRIDE) * 3 + 1] : yHere;
	const nx = yLeft - yRight;
	const ny = CELL * 2;
	const nz = yDown - yUp;
	const length = Math.hypot(nx, ny, nz) || 1;
	norm[index * 3] = nx / length;
	norm[index * 3 + 1] = ny / length;
	norm[index * 3 + 2] = nz / length;
}

function fillAll(pos: Float32Array, col: Float32Array, norm: Float32Array, cx: number, cz: number) {
	for (let iy = 0; iy < STRIDE; iy++) {
		for (let ix = 0; ix < STRIDE; ix++) fillVertex(pos, col, ix, iy, cx, cz);
	}
	for (let iy = 0; iy < STRIDE; iy++) {
		for (let ix = 0; ix < STRIDE; ix++) writeNormal(pos, norm, ix, iy);
	}
}

/** Slide the heightfield one cell. Only the new edge is resampled. */
function shiftGrid(
	pos: Float32Array,
	col: Float32Array,
	norm: Float32Array,
	axis: "x" | "z",
	dir: 1 | -1,
	cx: number,
	cz: number,
) {
	const rowFloats = STRIDE * 3;
	if (axis === "z") {
		if (dir > 0) {
			pos.copyWithin(0, rowFloats, rowFloats * STRIDE);
			col.copyWithin(0, rowFloats, rowFloats * STRIDE);
			norm.copyWithin(0, rowFloats, rowFloats * STRIDE);
		} else {
			pos.copyWithin(rowFloats, 0, rowFloats * SEG);
			col.copyWithin(rowFloats, 0, rowFloats * SEG);
			norm.copyWithin(rowFloats, 0, rowFloats * SEG);
		}
		const edge = dir > 0 ? SEG : 0;
		for (let ix = 0; ix < STRIDE; ix++) fillVertex(pos, col, ix, edge, cx, cz);
		const neighbor = dir > 0 ? SEG - 1 : 1;
		for (let ix = 0; ix < STRIDE; ix++) {
			writeNormal(pos, norm, ix, edge);
			writeNormal(pos, norm, ix, neighbor);
		}
		return;
	}
	for (let row = 0; row < STRIDE; row++) {
		const start = row * STRIDE;
		if (dir > 0) {
			pos.copyWithin(start * 3, (start + 1) * 3, (start + STRIDE) * 3);
			col.copyWithin(start * 3, (start + 1) * 3, (start + STRIDE) * 3);
			norm.copyWithin(start * 3, (start + 1) * 3, (start + STRIDE) * 3);
		} else {
			pos.copyWithin((start + 1) * 3, start * 3, (start + SEG) * 3);
			col.copyWithin((start + 1) * 3, start * 3, (start + SEG) * 3);
			norm.copyWithin((start + 1) * 3, start * 3, (start + SEG) * 3);
		}
	}
	const edge = dir > 0 ? SEG : 0;
	for (let iy = 0; iy < STRIDE; iy++) fillVertex(pos, col, edge, iy, cx, cz);
	const neighbor = dir > 0 ? SEG - 1 : 1;
	for (let iy = 0; iy < STRIDE; iy++) {
		writeNormal(pos, norm, edge, iy);
		writeNormal(pos, norm, neighbor, iy);
	}
}

function buildTerrain(): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry();
	const count = STRIDE * STRIDE;
	geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
	geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
	geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
	const index: number[] = [];
	for (let iy = 0; iy < SEG; iy++) {
		for (let ix = 0; ix < SEG; ix++) {
			const a = ix + iy * STRIDE;
			const b = a + 1;
			const c = a + STRIDE;
			const d = c + 1;
			index.push(a, c, b, b, c, d);
		}
	}
	geometry.setIndex(index);
	return geometry;
}

function Terrain() {
	const geom = useMemo(() => buildTerrain(), []);
	const material = useMemo(
		() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.03 }),
		[],
	);
	const origin = useRef({ cx: Math.round(START.x / CELL), cz: Math.round(START.z / CELL) });

	useLayoutEffect(() => {
		const pos = floats(geom.getAttribute("position") as THREE.BufferAttribute);
		const col = floats(geom.getAttribute("color") as THREE.BufferAttribute);
		const norm = floats(geom.getAttribute("normal") as THREE.BufferAttribute);
		fillAll(pos, col, norm, origin.current.cx, origin.current.cz);
		(geom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
		(geom.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
		(geom.getAttribute("normal") as THREE.BufferAttribute).needsUpdate = true;
	}, [geom]);

	useEffect(() => {
		return () => {
			geom.dispose();
			material.dispose();
		};
	}, [geom, material]);

	useFrame(() => {
		const player = useBattle.getState().player;
		const cx = Math.round(player.x / CELL);
		const cz = Math.round(player.z / CELL);
		const current = origin.current;
		if (current.cx === cx && current.cz === cz) return;
		const position = geom.getAttribute("position") as THREE.BufferAttribute;
		const color = geom.getAttribute("color") as THREE.BufferAttribute;
		const normal = geom.getAttribute("normal") as THREE.BufferAttribute;
		const pos = floats(position);
		const col = floats(color);
		const norm = floats(normal);
		if (Math.abs(cx - current.cx) > 6 || Math.abs(cz - current.cz) > 6) {
			fillAll(pos, col, norm, cx, cz);
			current.cx = cx;
			current.cz = cz;
		} else {
			while (current.cx !== cx) {
				const dir: 1 | -1 = current.cx < cx ? 1 : -1;
				current.cx += dir;
				shiftGrid(pos, col, norm, "x", dir, current.cx, current.cz);
			}
			while (current.cz !== cz) {
				const dir: 1 | -1 = current.cz < cz ? 1 : -1;
				current.cz += dir;
				shiftGrid(pos, col, norm, "z", dir, current.cx, current.cz);
			}
		}
		position.needsUpdate = true;
		color.needsUpdate = true;
		normal.needsUpdate = true;
	});

	return <mesh geometry={geom} material={material} receiveShadow frustumCulled={false} />;
}

function Sun() {
	const light = useRef<THREE.DirectionalLight>(null);
	const { scene } = useThree();
	useLayoutEffect(() => {
		if (light.current) scene.add(light.current.target);
	}, [scene]);
	useFrame(() => {
		const player = useBattle.getState().player;
		const sun = light.current;
		if (!sun) return;
		sun.position.set(player.x + 70, player.y + 120, player.z + 24);
		sun.target.position.set(player.x, player.y, player.z);
		sun.target.updateMatrixWorld();
	});
	return (
		<directionalLight
			ref={light}
			intensity={1.85}
			color="#fff1d4"
			castShadow
			shadow-mapSize-width={1024}
			shadow-mapSize-height={1024}
			shadow-camera-near={20}
			shadow-camera-far={240}
			shadow-camera-left={-55}
			shadow-camera-right={55}
			shadow-camera-top={55}
			shadow-camera-bottom={-55}
			shadow-bias={-0.0006}
			shadow-normalBias={0.04}
		/>
	);
}

const PROP_LIFT = [0.32, 1.05, 0.2, 1.05, 0.48, 0.22];

function Rocks() {
	const meshes = useRef<Array<THREE.InstancedMesh | null>>([]);
	const geos = useMemo(
		() => [
			new THREE.DodecahedronGeometry(1, 0),
			new THREE.ConeGeometry(0.55, 2.6, 6),
			new THREE.BoxGeometry(1.6, 0.7, 1.15),
			new THREE.CylinderGeometry(0.42, 0.5, 2.2, 7),
			new THREE.BoxGeometry(2.4, 1.35, 0.42),
			new THREE.BoxGeometry(2.1, 0.38, 0.7),
		],
		[],
	);
	const mats = useMemo(
		() => [
			new THREE.MeshStandardMaterial({ color: "#7c4e34", roughness: 0.94, metalness: 0.02 }),
			new THREE.MeshStandardMaterial({ color: "#d9c3a2", roughness: 0.78, metalness: 0.05 }),
			new THREE.MeshStandardMaterial({ color: "#6a5144", roughness: 0.9, metalness: 0.04 }),
			new THREE.MeshStandardMaterial({ color: "#cbb89a", roughness: 0.84, metalness: 0.03 }),
			new THREE.MeshStandardMaterial({ color: "#8d6a4e", roughness: 0.9, metalness: 0.02 }),
			new THREE.MeshStandardMaterial({ color: "#b09778", roughness: 0.86, metalness: 0.04 }),
		],
		[],
	);
	useLayoutEffect(() => {
		for (const mesh of meshes.current) {
			if (mesh) mesh.count = 0;
		}
	}, []);
	useEffect(() => {
		return () => {
			geos.forEach((geo) => geo.dispose());
			mats.forEach((mat) => mat.dispose());
		};
	}, [geos, mats]);
	useFrame(() => {
		const player = useBattle.getState().player;
		const props = rocksAround(player.x, player.z);
		const counts = [0, 0, 0, 0, 0, 0];
		for (const prop of props) {
			const slot = prop.kind;
			const mesh = meshes.current[slot];
			if (!mesh || counts[slot] >= 240) continue;
			const lift = PROP_LIFT[slot] ?? 0.3;
			dummy.position.set(prop.x, prop.y + prop.sy * lift, prop.z);
			dummy.rotation.set(slot === 2 || slot === 5 ? prop.yaw * 0.15 : 0, prop.yaw, 0);
			dummy.scale.set(prop.sx, prop.sy, prop.sz);
			dummy.updateMatrix();
			mesh.setMatrixAt(counts[slot], dummy.matrix);
			counts[slot] += 1;
		}
		for (let index = 0; index < counts.length; index++) {
			const mesh = meshes.current[index];
			if (!mesh) continue;
			mesh.count = counts[index];
			mesh.instanceMatrix.needsUpdate = true;
		}
	});
	return (
		<>
			{geos.map((geo, index) => (
				<instancedMesh
					key={index}
					ref={(mesh) => {
						meshes.current[index] = mesh;
					}}
					args={[geo, mats[index], 240]}
					frustumCulled={false}
				/>
			))}
		</>
	);
}

function Water() {
	return (
		<mesh rotation={[-Math.PI / 2, 0, 0]} position={[CRATER.x, WATER_Y + 0.15, CRATER.z]}>
			<ringGeometry args={[230, 1040, 72]} />
			<meshStandardMaterial
				color="#5ea3ad"
				transparent
				opacity={0.78}
				roughness={0.12}
				metalness={0.45}
				side={THREE.DoubleSide}
			/>
		</mesh>
	);
}

function Geysers() {
	const group = useRef<THREE.Group>(null);
	useFrame(({ clock }) => {
		const root = group.current;
		if (!root) return;
		root.children.forEach((child, index) => {
			const pulse = 0.75 + Math.sin(clock.elapsedTime * 4 + index) * 0.25;
			child.scale.set(pulse, 0.85 + pulse * 0.4, pulse);
		});
	});
	return (
		<group ref={group}>
			{GEYSERS.map((geyser) => (
				<mesh key={`${geyser.x}:${geyser.z}`} position={[geyser.x, geyser.y + 5, geyser.z]}>
					<cylinderGeometry args={[0.35, 1.5, 10, 7]} />
					<meshBasicMaterial
						color="#ff9a3c"
						transparent
						opacity={0.38}
						depthWrite={false}
						toneMapped={false}
					/>
				</mesh>
			))}
		</group>
	);
}

function attitude(x: number, z: number, yaw: number, vx: number, vz: number) {
	const normal = groundNormal(x, z);
	const fx = Math.sin(yaw);
	const fz = Math.cos(yaw);
	const rx = -Math.cos(yaw);
	const rz = Math.sin(yaw);
	const forward = vx * fx + vz * fz;
	const strafe = vx * rx + vz * rz;
	return {
		pitch: clamp(-(normal.x * fx + normal.z * fz) * 0.75 - forward * 0.0035, -0.28, 0.28),
		roll: clamp((normal.x * rx + normal.z * rz) * 0.75 - strafe * 0.011, -0.32, 0.32),
	};
}

function barrelPivot(chassis: Chassis): [number, number, number] {
	if (chassis === "anvil") return [0, 1.15, 0.55];
	if (chassis === "sabre") return [0, 0.62, 1.7];
	if (chassis === "mason") return [0, 0.7, 1.5];
	return [0, 0.72, 1.35];
}

function RigUnit({ index }: { index: number }) {
	const chassis = useRef(useBattle.getState().rigs[index]?.chassis ?? "lance").current;
	const hull = useRef<THREE.Group>(null);
	const turret = useRef<THREE.Group>(null);
	const barrel = useRef<THREE.Group>(null);
	const glow = useRef<THREE.MeshStandardMaterial>(null);
	const ring = useRef<THREE.Mesh>(null);
	const pivot = barrelPivot(chassis);
	useFrame(() => {
		const state = useBattle.getState();
		const rig = state.rigs[index];
		const group = hull.current;
		if (!rig || !group || !turret.current || !barrel.current) return;
		const tilt = rig.alive
			? attitude(rig.x, rig.z, rig.yaw, rig.vx, rig.vz)
			: { pitch: 0.3, roll: 0.7 };
		group.visible = true;
		group.position.set(
			rig.x,
			(rig.alive ? rig.y : rig.y - 0.7) + Math.sin(state.age * 8 + index) * 0.03,
			rig.z,
		);
		group.rotation.order = "YXZ";
		group.rotation.set(tilt.pitch, rig.yaw, tilt.roll);
		turret.current.rotation.y = wrapAngle(rig.gunYaw - rig.yaw);
		barrel.current.rotation.x = rig.alive ? -rig.gunPitch : 0.5;
		if (glow.current) {
			const driving = rig.occupied && state.seat === "tank";
			glow.current.emissiveIntensity = rig.alive ? (driving ? 1.5 + state.boost * 2 : 1.1) : 0.05;
		}
		if (ring.current)
			ring.current.visible = state.selected === index && state.seat === "rts" && rig.alive;
	});
	const glowColor = chassis === "sabre" ? "#3ee0ff" : "#ff7a18";
	return (
		<group ref={hull}>
			<TankBody chassis={chassis} />
			<group ref={turret} position={pivot}>
				<group ref={barrel}>
					<mesh position={[0, 0, chassis === "mason" ? 0.7 : 1.15]} rotation={[Math.PI / 2, 0, 0]}>
						<cylinderGeometry args={[0.08, 0.12, chassis === "anvil" ? 2.4 : 2.1, 8]} />
						<meshStandardMaterial color="#1c1e24" metalness={0.7} roughness={0.3} />
					</mesh>
				</group>
			</group>
			<mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<circleGeometry args={[chassis === "anvil" ? 2.4 : 1.9, 16]} />
				<meshStandardMaterial
					ref={glow}
					color={glowColor}
					emissive={glowColor}
					emissiveIntensity={1.4}
					transparent
					opacity={0.75}
					toneMapped={false}
				/>
			</mesh>
			<mesh ref={ring} position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<ringGeometry args={[2.6, 3, 20]} />
				<meshBasicMaterial color="#d6ff6a" side={THREE.DoubleSide} toneMapped={false} />
			</mesh>
		</group>
	);
}

function Rigs() {
	const count = useRef(useBattle.getState().rigs.length).current;
	return (
		<>
			{Array.from({ length: count }, (_, index) => (
				<RigUnit key={index} index={index} />
			))}
		</>
	);
}

function Soldier() {
	const group = useRef<THREE.Group>(null);
	useFrame(() => {
		const state = useBattle.getState();
		const body = group.current;
		if (!body) return;
		const show = state.seat !== "tank" && state.mode !== "dead";
		body.visible = show;
		if (!show) return;
		const bob =
			Math.hypot(state.player.vx, state.player.vz) > 1 ? Math.sin(state.age * 12) * 0.08 : 0;
		body.position.set(state.player.x, state.player.y + bob, state.player.z);
		body.rotation.y = state.player.yaw;
	});
	return (
		<group ref={group}>
			<mesh castShadow position={[0, 0.95, 0]}>
				<boxGeometry args={[0.42, 0.7, 0.28]} />
				<meshStandardMaterial color="#6d7544" />
			</mesh>
			<mesh castShadow position={[0, 1.48, 0]}>
				<boxGeometry args={[0.28, 0.28, 0.26]} />
				<meshStandardMaterial color="#d8c2a4" />
			</mesh>
			<mesh position={[0.18, 1.05, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
				<cylinderGeometry args={[0.035, 0.035, 0.7, 6]} />
				<meshStandardMaterial color="#222" />
			</mesh>
		</group>
	);
}

function BuildSites() {
	const count = useRef(useBattle.getState().rigs.length).current;
	const refs = useRef<Array<THREE.Group | null>>([]);
	useFrame(() => {
		const rigs = useBattle.getState().rigs;
		for (let index = 0; index < count; index++) {
			const site = refs.current[index];
			const rig = rigs[index];
			if (!site || !rig) continue;
			const show = rig.order === "build";
			site.visible = show;
			if (!show) continue;
			site.position.set(rig.goalX, surface(rig.goalX, rig.goalZ), rig.goalZ);
			site.scale.set(1, 0.15 + rig.buildT * 1.6, 1);
		}
	});
	return (
		<>
			{Array.from({ length: count }, (_, index) => (
				<group
					key={index}
					ref={(node) => {
						refs.current[index] = node;
					}}
					visible={false}
				>
					<mesh position={[0, 0.8, 0]}>
						<boxGeometry args={[2.2, 1.6, 2.2]} />
						<meshStandardMaterial
							color="#d6ff6a"
							transparent
							opacity={0.35}
							emissive="#d6ff6a"
							emissiveIntensity={0.4}
						/>
					</mesh>
				</group>
			))}
		</>
	);
}

function TurretBody() {
	return (
		<mesh castShadow position={[0, 0.35, 0]}>
			<cylinderGeometry args={[1.1, 1.35, 0.7, 8]} />
			<meshStandardMaterial color="#2a2228" metalness={0.5} roughness={0.42} />
		</mesh>
	);
}

function Unit({ index }: { index: number }) {
	const kind = useBattle.getState().enemies[index]?.kind ?? "raider";
	const hull = useRef<THREE.Group>(null);
	const turret = useRef<THREE.Group>(null);
	const barrel = useRef<THREE.Group>(null);
	const glow = useRef<THREE.Mesh>(null);
	useFrame(() => {
		const enemy = useBattle.getState().enemies[index];
		const group = hull.current;
		if (!enemy || !group || !turret.current || !barrel.current) return;
		const near =
			(enemy.x - useBattle.getState().player.x) ** 2 +
				(enemy.z - useBattle.getState().player.z) ** 2 <
			450 * 450;
		const tilt =
			enemy.alive && near
				? attitude(enemy.x, enemy.z, enemy.yaw, enemy.vx, enemy.vz)
				: { pitch: 0, roll: 0 };
		group.position.set(enemy.x, enemy.alive ? enemy.y : enemy.y - 0.6, enemy.z);
		group.rotation.order = "YXZ";
		group.rotation.set(enemy.alive ? tilt.pitch : 0.3, enemy.yaw, enemy.alive ? tilt.roll : 0.8);
		turret.current.rotation.y = wrapAngle(enemy.gunYaw - enemy.yaw);
		barrel.current.rotation.x = enemy.alive ? -enemy.gunPitch : 0.6;
		if (glow.current) glow.current.visible = enemy.alive;
	});
	return (
		<group ref={hull}>
			{kind === "turret" ? <TurretBody /> : <ScionHull heavy={index % 2 === 0} />}
			<group
				ref={turret}
				position={[0, kind === "turret" ? 0.85 : 1.05, kind === "turret" ? 0 : -0.1]}
			>
				<mesh castShadow>
					<boxGeometry args={kind === "turret" ? [0.9, 0.36, 1.1] : [1.15, 0.36, 1.5]} />
					<meshStandardMaterial color="#1a1418" metalness={0.55} roughness={0.35} />
				</mesh>
				<group ref={barrel}>
					<mesh position={[0, 0.05, 1.15]} rotation={[Math.PI / 2, 0, 0]}>
						<cylinderGeometry args={[0.07, 0.1, 1.8, 6]} />
						<meshStandardMaterial color="#ff4fd8" emissive="#ff4fd8" emissiveIntensity={0.7} />
					</mesh>
				</group>
			</group>
			<mesh ref={glow} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<circleGeometry args={[1.5, 12]} />
				<meshBasicMaterial color="#ff4fd8" transparent opacity={0.35} toneMapped={false} />
			</mesh>
		</group>
	);
}

function Army() {
	const count = useRef(useBattle.getState().enemies.length).current;
	return (
		<>
			{Array.from({ length: count }, (_, index) => (
				<Unit key={index} index={index} />
			))}
		</>
	);
}

function Base({ index }: { index: number }) {
	const root = useRef<THREE.Group>(null);
	const beacon = useRef<THREE.MeshStandardMaterial>(null);
	const kind = useBattle.getState().structures[index]?.kind ?? "base";
	const place = useBattle.getState().structures[index];
	useFrame(({ clock }) => {
		const structure = useBattle.getState().structures[index];
		const group = root.current;
		if (!structure || !group) return;
		const sunk = structure.alive ? 0 : -1.4;
		group.position.set(structure.x, structure.y + sunk, structure.z);
		group.rotation.z = structure.alive ? 0 : 0.35;
		group.visible = structure.placed;
		if (beacon.current) {
			const pulse = 1.2 + Math.sin(clock.elapsedTime * 3 + index) * 0.4;
			beacon.current.emissiveIntensity = structure.alive ? pulse : 0.05;
		}
	});
	if (!place) return null;
	return (
		<group ref={root} position={[place.x, place.y, place.z]}>
			{kind === "citadel" ? <CitadelMesh material={beacon} /> : null}
			{kind === "relay" ? <RelayMesh material={beacon} /> : null}
			{kind === "base" ? <FirebaseMesh /> : null}
			{kind === "supply" ? <SupplyMesh material={beacon} /> : null}
			{kind === "tower" ? <TowerMesh /> : null}
		</group>
	);
}

function CitadelMesh({ material }: { material: RefObject<THREE.MeshStandardMaterial | null> }) {
	return (
		<group>
			<mesh castShadow position={[0, 2, 0]}>
				<cylinderGeometry args={[10, 14, 4, 8]} />
				<meshStandardMaterial color="#2a2428" metalness={0.45} roughness={0.5} />
			</mesh>
			<mesh castShadow position={[0, 14, 0]}>
				<cylinderGeometry args={[2.2, 4.5, 22, 7]} />
				<meshStandardMaterial color="#1c171c" metalness={0.5} roughness={0.42} />
			</mesh>
			<mesh position={[0, 16, 0]}>
				<sphereGeometry args={[2.4, 12, 10]} />
				<meshStandardMaterial
					ref={material}
					color="#ff4fd8"
					emissive="#ff4fd8"
					emissiveIntensity={1.6}
					toneMapped={false}
				/>
			</mesh>
			{[0, 1, 2].map((spoke) => (
				<mesh
					key={spoke}
					position={[
						Math.cos((spoke / 3) * Math.PI * 2) * 8,
						6,
						Math.sin((spoke / 3) * Math.PI * 2) * 8,
					]}
					rotation={[0, -((spoke / 3) * Math.PI * 2), 0]}
				>
					<boxGeometry args={[1.2, 10, 1.2]} />
					<meshStandardMaterial color="#3a2434" metalness={0.4} roughness={0.45} />
				</mesh>
			))}
		</group>
	);
}

function RelayMesh({ material }: { material: RefObject<THREE.MeshStandardMaterial | null> }) {
	return (
		<group>
			<mesh castShadow position={[0, 6, 0]}>
				<boxGeometry args={[1.4, 12, 1.4]} />
				<meshStandardMaterial color="#3a332c" metalness={0.35} roughness={0.55} />
			</mesh>
			<mesh position={[0, 12.2, 0]} rotation={[0.4, 0, 0]}>
				<cylinderGeometry args={[2.4, 2.4, 0.3, 12]} />
				<meshStandardMaterial
					ref={material}
					color="#ffb03a"
					emissive="#ffb03a"
					emissiveIntensity={1.4}
					toneMapped={false}
				/>
			</mesh>
		</group>
	);
}

function FirebaseMesh() {
	return (
		<group>
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
				<ringGeometry args={[7, 8.2, 24]} />
				<meshStandardMaterial
					color="#d6ff6a"
					emissive="#9dba4a"
					emissiveIntensity={0.45}
					side={THREE.DoubleSide}
				/>
			</mesh>
			<mesh castShadow position={[-14, 2.4, 18]}>
				<boxGeometry args={[5, 4.6, 7]} />
				<meshStandardMaterial color="#8a7a62" metalness={0.2} roughness={0.7} />
			</mesh>
			<mesh position={[-14, 5.6, 18]} rotation={[0.7, 0.5, 0]}>
				<cylinderGeometry args={[1.5, 1.5, 0.16, 12]} />
				<meshStandardMaterial
					color="#d6ff6a"
					emissive="#d6ff6a"
					emissiveIntensity={1.2}
					toneMapped={false}
				/>
			</mesh>
		</group>
	);
}

function TowerMesh() {
	return (
		<group>
			<mesh castShadow position={[0, 1.3, 0]}>
				<cylinderGeometry args={[1.5, 2.1, 2.6, 8]} />
				<meshStandardMaterial color="#3e4a34" metalness={0.3} roughness={0.6} />
			</mesh>
			<mesh position={[0, 2.8, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
				<cylinderGeometry args={[0.12, 0.16, 1.6, 8]} />
				<meshStandardMaterial
					color="#d6ff6a"
					emissive="#d6ff6a"
					emissiveIntensity={1.1}
					toneMapped={false}
				/>
			</mesh>
		</group>
	);
}

function SupplyMesh({ material }: { material: RefObject<THREE.MeshStandardMaterial | null> }) {
	return (
		<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
			<ringGeometry args={[3.2, 4.4, 18]} />
			<meshStandardMaterial
				ref={material}
				color="#8dffb0"
				emissive="#8dffb0"
				emissiveIntensity={1.3}
				side={THREE.DoubleSide}
				toneMapped={false}
			/>
		</mesh>
	);
}

function Bases() {
	const count = useRef(useBattle.getState().structures.length).current;
	return (
		<>
			{Array.from({ length: count }, (_, index) => (
				<Base key={index} index={index} />
			))}
		</>
	);
}

function NavBeam() {
	const mesh = useRef<THREE.Mesh>(null);
	useFrame(({ clock }) => {
		const state = useBattle.getState();
		const beam = mesh.current;
		if (!beam) return;
		const y = surface(state.navX, state.navZ);
		beam.position.set(state.navX, y + 16, state.navZ);
		const mat = beam.material as THREE.MeshBasicMaterial;
		mat.opacity = 0.18 + Math.sin(clock.elapsedTime * 4) * 0.1;
	});
	return (
		<mesh ref={mesh}>
			<cylinderGeometry args={[0.22, 0.22, 32, 6]} />
			<meshBasicMaterial
				color="#d6ff6a"
				transparent
				opacity={0.3}
				depthWrite={false}
				toneMapped={false}
			/>
		</mesh>
	);
}

function Shots() {
	const refs = useRef<Array<THREE.Mesh | null>>([]);
	useFrame(() => {
		const shots = useBattle.getState().shots;
		for (let i = 0; i < 64; i++) {
			const mesh = refs.current[i];
			const shot = shots[i];
			if (!mesh) continue;
			if (!shot) {
				mesh.visible = false;
				continue;
			}
			mesh.visible = true;
			mesh.position.set(shot.x, shot.y, shot.z);
			mesh.lookAt(shot.x + shot.vx, shot.skim ? shot.y : shot.y + shot.vy, shot.z + shot.vz);
			const mat = mesh.material as THREE.MeshBasicMaterial;
			mat.color.set(shot.missile ? "#fff6d0" : shot.team === "isdf" ? "#ffe08a" : "#ff4b5a");
			mesh.scale.set(shot.missile ? 1.8 : 1.6, shot.missile ? 1.8 : 1.6, shot.missile ? 1.4 : 8);
		}
	});
	return (
		<>
			{Array.from({ length: 64 }, (_, index) => (
				<mesh
					key={index}
					ref={(el) => {
						refs.current[index] = el;
					}}
					visible={false}
				>
					<boxGeometry args={[0.12, 0.12, 1.5]} />
					<meshBasicMaterial color="#ffe08a" toneMapped={false} />
				</mesh>
			))}
		</>
	);
}

function Blasts() {
	const refs = useRef<Array<THREE.Mesh | null>>([]);
	useFrame(() => {
		const blasts = useBattle.getState().blasts;
		for (let i = 0; i < 16; i++) {
			const mesh = refs.current[i];
			const blast = blasts[i];
			if (!mesh) continue;
			if (!blast) {
				mesh.visible = false;
				continue;
			}
			mesh.visible = true;
			const k = blast.age / blast.life;
			mesh.position.set(blast.x, blast.y, blast.z);
			mesh.scale.setScalar((blast.big ? 5 : 1.4) + k * (blast.big ? 18 : 6));
			const mat = mesh.material as THREE.MeshBasicMaterial;
			mat.opacity = (1 - k) * 0.85;
		}
	});
	return (
		<>
			{Array.from({ length: 16 }, (_, index) => (
				<mesh
					key={index}
					ref={(el) => {
						refs.current[index] = el;
					}}
					visible={false}
				>
					<sphereGeometry args={[1, 10, 8]} />
					<meshBasicMaterial
						color="#ffb15a"
						transparent
						opacity={0.8}
						depthWrite={false}
						toneMapped={false}
					/>
				</mesh>
			))}
		</>
	);
}

function CameraRig() {
	const { camera } = useThree();
	useFrame(() => {
		const state = useBattle.getState();
		const player = state.player;
		if (state.seat === "rts") {
			const yaw = state.aimYaw;
			const dist = state.rtsZoom;
			const ground = surface(state.rtsX, state.rtsZ);
			camera.position.set(
				state.rtsX - Math.sin(yaw) * dist * 0.72,
				ground + dist * 0.78,
				state.rtsZ - Math.cos(yaw) * dist * 0.72,
			);
			camera.lookAt(state.rtsX, ground + 1, state.rtsZ);
			return;
		}
		const dist = state.seat === "foot" ? 6.2 : state.view === "near" ? 7.2 : 15.5;
		const yaw = state.aimYaw;
		const pitch = state.aimPitch;
		const sx = Math.sin(yaw);
		const sz = Math.cos(yaw);
		const px = player.x;
		const py = player.y + (state.seat === "foot" ? 1.45 : 1.5);
		const pz = player.z;
		const spread = Math.cos(pitch * 0.35);
		let camX = px - sx * dist * spread;
		let camY = py + 2.8 + dist * 0.2 - pitch * 4.5;
		let camZ = pz - sz * dist * spread;
		let scale = 1;
		for (let i = 1; i <= 6; i++) {
			const t = (i / 6) * scale;
			const x = px + (camX - px) * t;
			const y = py + (camY - py) * t;
			const z = pz + (camZ - pz) * t;
			if (y < surface(x, z) + 1.25) scale = Math.max(0.24, ((i - 1) / 6) * scale);
		}
		camX = px + (camX - px) * scale;
		camY = py + (camY - py) * scale;
		camZ = pz + (camZ - pz) * scale;
		camera.position.set(
			camX + Math.sin(state.age * 54) * state.shake * 0.2,
			camY + Math.cos(state.age * 46) * state.shake * 0.14,
			camZ,
		);
		const reach = 48;
		camera.lookAt(
			px + sx * reach * Math.cos(pitch),
			py + Math.sin(pitch) * reach,
			pz + sz * reach * Math.cos(pitch),
		);
	});
	return null;
}

function groundAt(camera: THREE.Camera, nx: number, ny: number): { x: number; z: number } | null {
	pointer.set(nx, ny);
	raycaster.setFromCamera(pointer, camera);
	const origin = raycaster.ray.origin;
	const dir = raycaster.ray.direction;
	for (let travel = 4; travel < 1400; travel += 8) {
		const x = origin.x + dir.x * travel;
		const y = origin.y + dir.y * travel;
		const z = origin.z + dir.z * travel;
		if (y <= surface(x, z) + 0.6) return { x, z };
	}
	return null;
}

export function BattleScene({
	controls,
	hud,
	mapIcons,
	audio,
	status,
	live,
}: {
	controls: RefObject<ControlState>;
	hud: RefObject<HTMLCanvasElement | null>;
	mapIcons: RefObject<HTMLCanvasElement | null>;
	audio: RefObject<Score | null>;
	status: RefObject<HTMLElement | null>;
	live: RefObject<HTMLElement | null>;
}) {
	const spoke = useRef(0);
	useFrame((frame, delta) => {
		const dt = Math.min(0.05, delta);
		const stick = controls.current;
		const stateBefore = useBattle.getState();
		if (stick && stateBefore.mode === "live" && !stateBefore.mapOpen) {
			const keys = stick.keys;
			const forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
			const strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
			let aimX = stick.aimX;
			let aimY = stick.aimY;
			stick.aimX = 0;
			stick.aimY = 0;
			if (!stick.locked) {
				const turn = 540 * dt;
				if (keys.has("ArrowLeft") || (stateBefore.seat === "rts" && keys.has("KeyQ"))) aimX -= turn;
				if (keys.has("ArrowRight") || (stateBefore.seat === "rts" && keys.has("KeyR")))
					aimX += turn;
				if (keys.has("ArrowUp")) aimY -= turn * 0.55;
				if (keys.has("ArrowDown")) aimY += turn * 0.55;
			}
			const missile = stick.missile;
			stick.missile = false;
			const shot = stick.shot;
			stick.shot = false;
			const zoom = stick.zoom;
			stick.zoom = 0;
			const pick = stick.pick;
			stick.pick = null;
			useBattle.getState().step(
				{
					forward,
					strafe,
					fire: stateBefore.seat === "rts" ? false : stick.fire || shot || keys.has("Space"),
					missile,
					boost: keys.has("ShiftLeft") || keys.has("ShiftRight"),
					aimX,
					aimY,
					zoom,
				},
				dt,
			);
			if (pick && useBattle.getState().seat === "rts") {
				const point = groundAt(frame.camera, pick.nx, pick.ny);
				if (point) useBattle.getState().commandAt(point.x, point.z);
			}
		} else {
			useBattle.getState().step(
				{
					forward: 0,
					strafe: 0,
					fire: false,
					missile: false,
					boost: false,
					aimX: 0,
					aimY: 0,
					zoom: 0,
				},
				dt,
			);
		}

		const state = useBattle.getState();
		const node = status.current;
		if (node) {
			node.dataset.mode = state.mode;
			node.dataset.won = String(state.won);
			node.dataset.kills = String(state.kills);
			node.dataset.x = state.player.x.toFixed(0);
			node.dataset.z = state.player.z.toFixed(0);
			node.dataset.hp = Math.ceil(state.player.hp).toString();
			node.dataset.seat = state.seat;
			node.dataset.scrap = String(state.scrap);
		}
		const region = live.current;
		if (region && state.age - spoke.current > 1.2 && state.mode === "live") {
			spoke.current = state.age;
			const relays = state.structures.filter((item) => item.kind === "relay" && item.alive).length;
			region.textContent = `Hull ${Math.ceil(state.player.hp)}. ${state.kills} kills. ${relays} relays.`;
		}
		audio.current?.update(
			Math.hypot(state.player.vx, state.player.vz),
			state.boost,
			state.mode === "live",
			state.sfx,
		);

		const overlay = hud.current;
		if (overlay) {
			const rect = overlay.getBoundingClientRect();
			const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
			const w = Math.max(1, Math.round(rect.width * dpr));
			const h = Math.max(1, Math.round(rect.height * dpr));
			if (overlay.width !== w || overlay.height !== h) {
				overlay.width = w;
				overlay.height = h;
			}
			const ctx = overlay.getContext("2d");
			if (ctx) {
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				drawHud(ctx, rect.width, rect.height);
			}
		}
		const icons = mapIcons.current;
		if (icons && state.mapOpen) {
			const rect = icons.getBoundingClientRect();
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const w = Math.max(1, Math.round(rect.width * dpr));
			const h = Math.max(1, Math.round(rect.height * dpr));
			if (rect.width > 2 && (icons.width !== w || icons.height !== h)) {
				icons.width = w;
				icons.height = h;
			}
			const ctx = icons.getContext("2d");
			if (ctx && rect.width > 2) {
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				drawMapIcons(ctx, rect.width, rect.height);
			}
		}
	}, -1);

	return (
		<>
			<color attach="background" args={["#c9a27c"]} />
			<fog attach="fog" args={["#c9a27c", 120, 620]} />
			<hemisphereLight args={["#ffe4c4", "#6a4030", 0.72]} />
			<Sun />
			<Terrain />
			<Rocks />
			<Water />
			<Geysers />
			<Bases />
			<Rigs />
			<Soldier />
			<BuildSites />
			<Army />
			<NavBeam />
			<Shots />
			<Blasts />
			<CameraRig />
		</>
	);
}
