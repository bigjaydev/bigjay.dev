import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
	ArrowUpFromLine,
	Box,
	Boxes,
	ChevronRight,
	CircleDot,
	Combine,
	Cylinder,
	type LucideIcon,
	Pentagon,
	Redo2,
	Spline,
	Square,
	Trash2,
	Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import {
	addShape,
	deleteEdges,
	deleteFaces,
	deleteShapes,
	deleteVertices,
	edgeKey,
	extrudeFaces,
	facePositions,
	initialScene,
	initialSelection,
	joinShapes,
	linePositions,
	meshEdges,
	mergeVertices,
	movingVertices,
	replaceMesh,
	sanitizeSelection,
	selectionPivot,
	solidArrays,
	translateShapes,
	translateVertices,
	worldVertex,
	type MeshData,
	type Mode,
	type Scene,
	type Selection,
	type ShapeKind,
	type Vec3,
} from "./mesh";

const GIZMO_SCALE = 0.12;
const GIZMO_LENGTH = 0.92;

type History = {
	past: Scene[];
	scene: Scene;
	future: Scene[];
};

type PickHit =
	| { kind: "shape"; meshId: string }
	| { kind: "vertex"; meshId: string; index: number }
	| { kind: "line"; meshId: string; key: string }
	| { kind: "face"; meshId: string; index: number };

type Axis = "x" | "y" | "z" | "free";

type Drag =
	| {
			kind: "move";
			pointerId: number;
			axis: Axis;
			origin: THREE.Vector3;
			planeNormal: THREE.Vector3;
			startT: number;
			startHit: THREE.Vector3;
			before: Scene;
			selection: Selection;
	  }
	| { kind: "orbit" | "pan"; pointerId: number; x: number; y: number }
	| { kind: "right"; pointerId: number; x: number; y: number }
	| { kind: "click"; pointerId: number; x: number; y: number; shift: boolean; pointerType: string };

const ndc = new THREE.Vector2();
const scratch = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const ray = new THREE.Ray();

const NO_FACES: number[] = [];
const NO_VERTS: number[] = [];
const NO_LINES: string[] = [];

const SHAPES: { kind: ShapeKind; label: string; icon: LucideIcon }[] = [
	{ kind: "box", label: "Cube", icon: Box },
	{ kind: "plane", label: "Plane", icon: Square },
	{ kind: "cylinder", label: "Cylinder", icon: Cylinder },
];

const MODES: { id: Mode; label: string; shortcut: string; icon: LucideIcon }[] = [
	{ id: "vertex", label: "Vertex", shortcut: "1", icon: CircleDot },
	{ id: "line", label: "Line", shortcut: "2", icon: Spline },
	{ id: "face", label: "Face", shortcut: "3", icon: Pentagon },
	{ id: "shape", label: "Shape", shortcut: "4", icon: Boxes },
];

function scenesEqual(a: Scene, b: Scene): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function toggle<T>(list: T[], item: T): T[] {
	return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

function hitKey(hit: PickHit | null): string {
	if (!hit) return "";
	if (hit.kind === "shape") return `s:${hit.meshId}`;
	if (hit.kind === "vertex") return `v:${hit.meshId}:${hit.index}`;
	if (hit.kind === "line") return `l:${hit.meshId}:${hit.key}`;
	return `f:${hit.meshId}:${hit.index}`;
}

function statusText(scene: Scene, selection: Selection): string {
	const mesh = scene.meshes.find((item) => item.id === selection.activeId);
	const name = mesh?.name ?? "Nothing";
	if (selection.mode === "shape") {
		if (selection.shapeIds.length === 0) return "Shape";
		if (selection.shapeIds.length === 1) return `Shape · ${name}`;
		return `Shape · ${selection.shapeIds.length} shapes`;
	}
	const label =
		selection.mode === "vertex" ? "Vertex" : selection.mode === "line" ? "Line" : "Face";
	const count =
		selection.mode === "vertex"
			? selection.vertices.length
			: selection.mode === "line"
				? selection.lines.length
				: selection.faces.length;
	if (!mesh) return label;
	if (count === 0) return `${label} · ${name}`;
	return `${label} · ${name} · ${count} selected`;
}

function applyMove(scene: Scene, selection: Selection, delta: Vec3): Scene {
	if (selection.mode === "shape") return translateShapes(scene, selection.shapeIds, delta);
	const mesh = scene.meshes.find((item) => item.id === selection.activeId);
	if (!mesh) return scene;
	return replaceMesh(scene, translateVertices(mesh, movingVertices(mesh, selection), delta));
}

function projectPoint(point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) {
	const cameraSpace = scratchB.copy(point).applyMatrix4(camera.matrixWorldInverse);
	scratch.copy(point).project(camera);
	return {
		x: (scratch.x * 0.5 + 0.5) * rect.width + rect.left,
		y: (-scratch.y * 0.5 + 0.5) * rect.height + rect.top,
		behind: cameraSpace.z > -0.05,
	};
}

function pointerNdc(event: PointerEvent, rect: DOMRect) {
	ndc.set(
		((event.clientX - rect.left) / rect.width) * 2 - 1,
		-((event.clientY - rect.top) / rect.height) * 2 + 1,
	);
	return ndc;
}

function pointerRay(event: PointerEvent, camera: THREE.Camera, rect: DOMRect) {
	pointerNdc(event, rect);
	ray.origin.copy(camera.position);
	scratch.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
	ray.direction.copy(scratch);
	return ray;
}

function rayPlane(origin: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 | null {
	const denom = normal.dot(ray.direction);
	if (Math.abs(denom) < 1e-6) return null;
	const distance = scratchB.copy(origin).sub(ray.origin).dot(normal) / denom;
	if (distance < 0) return null;
	return ray.origin.clone().addScaledVector(ray.direction, distance);
}

function segmentDistance(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): { distance: number; t: number } {
	const abx = bx - ax;
	const aby = by - ay;
	const lengthSq = abx * abx + aby * aby || 1;
	const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSq));
	const x = ax + abx * t;
	const y = ay + aby * t;
	return { distance: Math.hypot(px - x, py - y), t };
}

function solidsIn(root: THREE.Object3D): THREE.Mesh[] {
	const meshes: THREE.Mesh[] = [];
	root.traverse((object) => {
		if (object.userData.kind === "solid" && object instanceof THREE.Mesh) meshes.push(object);
	});
	return meshes;
}

function isVisible(point: THREE.Vector3, camera: THREE.Camera, solids: THREE.Mesh[]): boolean {
	scratchDir.copy(point).sub(camera.position);
	const dist = scratchDir.length();
	if (dist < 1e-4) return true;
	scratchDir.multiplyScalar(1 / dist);
	raycaster.set(camera.position, scratchDir);
	raycaster.far = dist + 1;
	const hit = raycaster.intersectObjects(solids, false)[0];
	raycaster.far = Infinity;
	return hit == null || hit.distance > dist - 0.04;
}

function pickFace(
	event: PointerEvent,
	camera: THREE.Camera,
	rect: DOMRect,
	solids: THREE.Mesh[],
): PickHit | null {
	raycaster.far = Infinity;
	raycaster.setFromCamera(pointerNdc(event, rect), camera);
	const hit = raycaster.intersectObjects(solids, false)[0];
	if (!hit || hit.faceIndex == null) return null;
	const meshId = hit.object.userData.meshId as string | undefined;
	const triFace = (hit.object as THREE.Mesh).geometry.userData.triFace as number[] | undefined;
	const index = triFace?.[hit.faceIndex];
	if (!meshId || index == null) return null;
	return { kind: "face", meshId, index };
}

function pickShape(
	event: PointerEvent,
	camera: THREE.Camera,
	rect: DOMRect,
	solids: THREE.Mesh[],
): PickHit | null {
	const face = pickFace(event, camera, rect, solids);
	return face ? { kind: "shape", meshId: face.meshId } : null;
}

function pickVertex(
	event: PointerEvent,
	scene: Scene,
	camera: THREE.Camera,
	rect: DOMRect,
	solids: THREE.Mesh[],
): PickHit | null {
	const candidates: { meshId: string; index: number; distance: number; point: THREE.Vector3 }[] =
		[];
	for (const mesh of scene.meshes) {
		mesh.vertices.forEach((vertex, index) => {
			const point = new THREE.Vector3(...worldVertex(mesh, index));
			const screen = projectPoint(point, camera, rect);
			if (screen.behind) return;
			const distance = Math.hypot(screen.x - event.clientX, screen.y - event.clientY);
			if (distance > 16) return;
			candidates.push({ meshId: mesh.id, index, distance, point });
		});
	}
	candidates.sort((a, b) => a.distance - b.distance);
	for (const candidate of candidates.slice(0, 6)) {
		if (!isVisible(candidate.point, camera, solids)) continue;
		return { kind: "vertex", meshId: candidate.meshId, index: candidate.index };
	}
	return null;
}

function pickLine(
	event: PointerEvent,
	scene: Scene,
	camera: THREE.Camera,
	rect: DOMRect,
	solids: THREE.Mesh[],
): PickHit | null {
	const candidates: { meshId: string; key: string; distance: number; point: THREE.Vector3 }[] = [];
	for (const mesh of scene.meshes) {
		for (const [a, b] of meshEdges(mesh)) {
			const start = new THREE.Vector3(...worldVertex(mesh, a));
			const end = new THREE.Vector3(...worldVertex(mesh, b));
			const sa = projectPoint(start, camera, rect);
			const sb = projectPoint(end, camera, rect);
			if (sa.behind && sb.behind) continue;
			const closest = segmentDistance(event.clientX, event.clientY, sa.x, sa.y, sb.x, sb.y);
			if (closest.distance > 14) continue;
			candidates.push({
				meshId: mesh.id,
				key: edgeKey(a, b),
				distance: closest.distance,
				point: start.lerp(end, closest.t),
			});
		}
	}
	candidates.sort((a, b) => a.distance - b.distance);
	for (const candidate of candidates.slice(0, 6)) {
		if (!isVisible(candidate.point, camera, solids)) continue;
		return { kind: "line", meshId: candidate.meshId, key: candidate.key };
	}
	return null;
}

function pickGizmo(
	event: PointerEvent,
	pivot: Vec3 | null,
	camera: THREE.Camera,
	rect: DOMRect,
): Axis | null {
	if (!pivot) return null;
	const origin = new THREE.Vector3(...pivot);
	const originScreen = projectPoint(origin, camera, rect);
	if (originScreen.behind) return null;
	const length = Math.max(camera.position.distanceTo(origin), 0.5) * GIZMO_SCALE * GIZMO_LENGTH;
	const axes: { id: "x" | "y" | "z"; tip: THREE.Vector3 }[] = [
		{ id: "x", tip: origin.clone().set(origin.x + length, origin.y, origin.z) },
		{ id: "y", tip: origin.clone().set(origin.x, origin.y + length, origin.z) },
		{ id: "z", tip: origin.clone().set(origin.x, origin.y, origin.z + length) },
	];
	let best: { id: "x" | "y" | "z"; distance: number } | null = null;
	for (const axis of axes) {
		const tip = projectPoint(axis.tip, camera, rect);
		if (tip.behind) continue;
		const distance = segmentDistance(
			event.clientX,
			event.clientY,
			originScreen.x,
			originScreen.y,
			tip.x,
			tip.y,
		).distance;
		if (distance <= 14 && (best == null || distance < best.distance)) {
			best = { id: axis.id, distance };
		}
	}
	const centerDistance = Math.hypot(event.clientX - originScreen.x, event.clientY - originScreen.y);
	if (best && best.distance < centerDistance) return best.id;
	if (centerDistance <= 12) return "free";
	return null;
}

function placeCamera(camera: THREE.Camera, view: ViewState) {
	const sinPhi = Math.sin(view.phi);
	camera.position.set(
		view.target.x + view.radius * sinPhi * Math.sin(view.theta),
		view.target.y + view.radius * Math.cos(view.phi),
		view.target.z + view.radius * sinPhi * Math.cos(view.theta),
	);
	camera.lookAt(view.target);
	camera.updateMatrixWorld();
}

type ViewState = {
	target: THREE.Vector3;
	theta: number;
	phi: number;
	radius: number;
};

function axisVector(axis: "x" | "y" | "z"): THREE.Vector3 {
	if (axis === "x") return new THREE.Vector3(1, 0, 0);
	if (axis === "y") return new THREE.Vector3(0, 1, 0);
	return new THREE.Vector3(0, 0, 1);
}

function dragPlane(axis: Axis, camera: THREE.Camera): THREE.Vector3 {
	const viewDir = camera.getWorldDirection(new THREE.Vector3());
	if (axis === "free") return viewDir;
	const direction = axisVector(axis);
	// Plane contains the axis and faces the camera, so the mouse ray is not parallel to it.
	const normal = viewDir.clone().addScaledVector(direction, -viewDir.dot(direction));
	if (normal.lengthSq() < 1e-6) normal.crossVectors(direction, camera.up);
	return normal.normalize();
}

function useBufferGeometry(mesh: MeshData, selectedFaces: number[]) {
	const faceKey = selectedFaces.join(",");
	const solid = useMemo(() => {
		const built = solidArrays(mesh);
		const geometry = new THREE.BufferGeometry();
		if (built.positions.length > 0) {
			geometry.setAttribute("position", new THREE.BufferAttribute(built.positions, 3));
			geometry.setAttribute("normal", new THREE.BufferAttribute(built.normals, 3));
		}
		geometry.userData.triFace = built.triFace;
		return geometry;
	}, [mesh]);
	const lines = useMemo(() => {
		const geometry = new THREE.BufferGeometry();
		const positions = linePositions(mesh);
		if (positions.length > 0)
			geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		return geometry;
	}, [mesh]);
	const overlay = useMemo(() => {
		const positions = facePositions(mesh, selectedFaces);
		if (positions.length === 0) return null;
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geometry.computeVertexNormals();
		return geometry;
		// faceKey tracks the selection without rebuilding when the array identity changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mesh, faceKey]);
	useEffect(() => () => solid.dispose(), [solid]);
	useEffect(() => () => lines.dispose(), [lines]);
	useEffect(() => () => overlay?.dispose(), [overlay]);
	return { solid, lines, overlay };
}

function skipRaycast() {}

function EdgeTube({ a, b, color, radius }: { a: Vec3; b: Vec3; color: string; radius: number }) {
	const { position, quaternion, length } = useMemo(() => {
		const start = new THREE.Vector3(...a);
		const end = new THREE.Vector3(...b);
		const direction = end.clone().sub(start);
		const span = direction.length() || 0.0001;
		return {
			position: start.clone().add(end).multiplyScalar(0.5),
			quaternion: new THREE.Quaternion().setFromUnitVectors(
				new THREE.Vector3(0, 1, 0),
				direction.normalize(),
			),
			length: span,
		};
	}, [a, b]);
	return (
		<mesh position={position} quaternion={quaternion} renderOrder={4} raycast={skipRaycast}>
			<cylinderGeometry args={[radius, radius, length, 6]} />
			<meshBasicMaterial color={color} toneMapped={false} />
		</mesh>
	);
}

function ShapeView({
	mesh,
	mode,
	shapeSelected,
	active,
	selectedVertices,
	selectedLines,
	selectedFaces,
	hover,
}: {
	mesh: MeshData;
	mode: Mode;
	shapeSelected: boolean;
	active: boolean;
	selectedVertices: number[];
	selectedLines: string[];
	selectedFaces: number[];
	hover: PickHit | null;
}) {
	const { solid, lines, overlay } = useBufferGeometry(
		mesh,
		mode === "face" ? selectedFaces : NO_FACES,
	);
	const hoverFace =
		hover?.kind === "face" && hover.meshId === mesh.id && !selectedFaces.includes(hover.index)
			? hover.index
			: null;
	const hoverGeo = useMemo(() => {
		if (hoverFace == null) return null;
		const positions = facePositions(mesh, [hoverFace]);
		if (positions.length === 0) return null;
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		return geometry;
	}, [mesh, hoverFace]);
	useEffect(() => () => hoverGeo?.dispose(), [hoverGeo]);
	const lineSet = new Set(selectedLines);
	const hoverLine = hover?.kind === "line" && hover.meshId === mesh.id ? hover.key : null;
	if (!solid.getAttribute("position")) return null;
	return (
		<group position={mesh.position}>
			<mesh geometry={solid} userData={{ kind: "solid", meshId: mesh.id }}>
				<meshStandardMaterial
					color={shapeSelected ? "#f4e3ea" : "#e6d6c8"}
					roughness={0.78}
					metalness={0}
					side={THREE.DoubleSide}
					polygonOffset
					polygonOffsetFactor={1}
					polygonOffsetUnits={1}
				/>
			</mesh>
			{lines.getAttribute("position") && (
				<lineSegments geometry={lines} raycast={skipRaycast}>
					<lineBasicMaterial color={shapeSelected ? "#fecef5" : active ? "#d9cec3" : "#8f857a"} />
				</lineSegments>
			)}
			{overlay && (
				<mesh geometry={overlay} renderOrder={2} raycast={skipRaycast}>
					<meshBasicMaterial
						color="#fecef5"
						transparent
						opacity={0.72}
						depthWrite={false}
						toneMapped={false}
						side={THREE.DoubleSide}
						polygonOffset
						polygonOffsetFactor={-4}
						polygonOffsetUnits={-4}
					/>
				</mesh>
			)}
			{hoverGeo && (
				<mesh geometry={hoverGeo} renderOrder={2} raycast={skipRaycast}>
					<meshBasicMaterial
						color="#fff6ee"
						transparent
						opacity={0.35}
						depthWrite={false}
						toneMapped={false}
						side={THREE.DoubleSide}
					/>
				</mesh>
			)}
			{mode === "line" &&
				meshEdges(mesh).map(([a, b]) => {
					const key = edgeKey(a, b);
					if (!lineSet.has(key) && key !== hoverLine) return null;
					const start = mesh.vertices[a];
					const end = mesh.vertices[b];
					if (!start || !end) return null;
					return (
						<EdgeTube
							key={key}
							a={start}
							b={end}
							color={lineSet.has(key) ? "#fecef5" : "#fff6ee"}
							radius={lineSet.has(key) ? 0.028 : 0.018}
						/>
					);
				})}
			{mode === "vertex" &&
				mesh.vertices.map((vertex, index) => {
					const selected = selectedVertices.includes(index);
					const hot = hover?.kind === "vertex" && hover.meshId === mesh.id && hover.index === index;
					return (
						<mesh key={index} position={vertex} renderOrder={5} raycast={skipRaycast}>
							<sphereGeometry args={[selected || hot ? 0.055 : 0.038, 12, 10]} />
							<meshBasicMaterial
								color={selected ? "#fecef5" : hot ? "#fff6ee" : "#f3ecdf"}
								toneMapped={false}
							/>
						</mesh>
					);
				})}
		</group>
	);
}

function Arrow({ axis, color }: { axis: "x" | "y" | "z"; color: string }) {
	const rotation: [number, number, number] =
		axis === "x" ? [0, 0, -Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
	return (
		<group rotation={rotation}>
			<mesh position={[0, 0.36, 0]} renderOrder={8} raycast={skipRaycast}>
				<cylinderGeometry args={[0.02, 0.02, 0.72, 10]} />
				<meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
			</mesh>
			<mesh position={[0, 0.82, 0]} renderOrder={8} raycast={skipRaycast}>
				<coneGeometry args={[0.062, 0.2, 12]} />
				<meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
			</mesh>
		</group>
	);
}

function Gizmo({ origin, hot }: { origin: Vec3; hot: Axis | null }) {
	const ref = useRef<THREE.Group>(null);
	useFrame((state) => {
		const group = ref.current;
		if (!group) return;
		const distance = Math.max(state.camera.position.distanceTo(group.position), 0.5);
		group.scale.setScalar(distance * GIZMO_SCALE);
	});
	const colors = { x: "#e07a5f", y: "#81b29a", z: "#6fa8d6" };
	return (
		<group ref={ref} position={origin}>
			{(["x", "y", "z"] as const).map((axis) => (
				<Arrow key={axis} axis={axis} color={hot === axis ? "#fecef5" : colors[axis]} />
			))}
			<mesh renderOrder={9} raycast={skipRaycast}>
				<sphereGeometry args={[0.07, 16, 12]} />
				<meshBasicMaterial
					color={hot === "free" ? "#fecef5" : "#f4efe8"}
					depthTest={false}
					toneMapped={false}
				/>
			</mesh>
		</group>
	);
}

function Stage({
	scene,
	selection,
	onPreview,
	onCommit,
	onPick,
	onMenu,
	cancelRef,
}: {
	scene: Scene;
	selection: Selection;
	onPreview: (scene: Scene) => void;
	onCommit: (before: Scene, next: Scene) => void;
	onPick: (hit: PickHit | null, shift: boolean) => void;
	onMenu: (x: number, y: number) => void;
	cancelRef: MutableRefObject<(() => void) | null>;
}) {
	const { camera, gl, scene: root } = useThree();
	const sceneRef = useRef(scene);
	const selectionRef = useRef(selection);
	const previewRef = useRef(scene);
	const onPreviewRef = useRef(onPreview);
	const onCommitRef = useRef(onCommit);
	const onPickRef = useRef(onPick);
	const onMenuRef = useRef(onMenu);
	sceneRef.current = scene;
	selectionRef.current = selection;
	onPreviewRef.current = onPreview;
	onCommitRef.current = onCommit;
	onPickRef.current = onPick;
	onMenuRef.current = onMenu;
	const view = useRef<ViewState>({
		target: new THREE.Vector3(0, 0.45, 0),
		theta: 0.72,
		phi: 1.02,
		radius: 6.6,
	});
	const drag = useRef<Drag | null>(null);
	const [hover, setHover] = useState<PickHit | null>(null);
	const [hotAxis, setHotAxis] = useState<Axis | null>(null);
	const hoverKey = useRef("");
	const pivot = selectionPivot(scene, selection);

	useFrame(() => {
		placeCamera(camera, view.current);
	});

	useEffect(() => {
		const canvas = gl.domElement;
		canvas.style.touchAction = "none";

		const rectOf = () => canvas.getBoundingClientRect();
		const setCursor = (cursor: string) => {
			if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
		};
		const rememberHover = (hit: PickHit | null) => {
			const key = hitKey(hit);
			if (key === hoverKey.current) return;
			hoverKey.current = key;
			setHover(hit);
		};

		const finishMove = (commit: boolean) => {
			const current = drag.current;
			if (current?.kind !== "move") return;
			const next = previewRef.current;
			drag.current = null;
			if (commit) onCommitRef.current(current.before, next);
			else onPreviewRef.current(current.before);
		};

		cancelRef.current = () => finishMove(false);

		const onPointerDown = (event: PointerEvent) => {
			if (event.button === 2) {
				drag.current = {
					kind: "right",
					pointerId: event.pointerId,
					x: event.clientX,
					y: event.clientY,
				};
				return;
			}
			if (event.button === 1 || (event.button === 0 && event.altKey)) {
				drag.current = {
					kind: event.button === 1 || event.shiftKey ? "pan" : "orbit",
					pointerId: event.pointerId,
					x: event.clientX,
					y: event.clientY,
				};
				if (event.button === 1) event.preventDefault();
				return;
			}
			if (event.button !== 0) return;
			const rect = rectOf();
			const axis = pickGizmo(
				event,
				selectionPivot(sceneRef.current, selectionRef.current),
				camera,
				rect,
			);
			if (axis) {
				const origin = new THREE.Vector3(
					...(selectionPivot(sceneRef.current, selectionRef.current) as Vec3),
				);
				const planeNormal = dragPlane(axis, camera);
				pointerRay(event, camera, rect);
				const hit = rayPlane(origin, planeNormal) ?? origin.clone();
				const direction = axis === "free" ? null : axisVector(axis);
				drag.current = {
					kind: "move",
					pointerId: event.pointerId,
					axis,
					origin,
					planeNormal,
					startHit: hit,
					startT: direction ? hit.clone().sub(origin).dot(direction) : 0,
					before: sceneRef.current,
					selection: selectionRef.current,
				};
				previewRef.current = sceneRef.current;
				canvas.setPointerCapture(event.pointerId);
				return;
			}
			drag.current = {
				kind: "click",
				pointerId: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				shift: event.shiftKey,
				pointerType: event.pointerType,
			};
		};

		const onPointerMove = (event: PointerEvent) => {
			const current = drag.current;
			const rect = rectOf();
			if (current?.kind === "right") {
				if (current.pointerId !== event.pointerId) return;
				const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y);
				if (moved > 4) {
					drag.current = {
						kind: "orbit",
						pointerId: current.pointerId,
						x: event.clientX,
						y: event.clientY,
					};
				}
				return;
			}
			if (current?.kind === "orbit" || current?.kind === "pan") {
				if (current.pointerId !== event.pointerId) return;
				const dx = event.clientX - current.x;
				const dy = event.clientY - current.y;
				current.x = event.clientX;
				current.y = event.clientY;
				if (current.kind === "orbit") {
					view.current.theta -= dx * 0.007;
					view.current.phi = Math.min(
						Math.PI - 0.08,
						Math.max(0.08, view.current.phi - dy * 0.007),
					);
				} else {
					placeCamera(camera, view.current);
					const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
					const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
					const scale = view.current.radius * 0.00115;
					view.current.target.addScaledVector(right, -dx * scale);
					view.current.target.addScaledVector(up, dy * scale);
				}
				setCursor("grabbing");
				return;
			}
			if (current?.kind === "move") {
				if (current.pointerId !== event.pointerId) return;
				pointerRay(event, camera, rect);
				const hit = rayPlane(current.origin, current.planeNormal);
				if (!hit) return;
				const delta = new THREE.Vector3();
				if (current.axis === "free") delta.copy(hit).sub(current.startHit);
				else {
					const direction = axisVector(current.axis);
					const distance = hit.clone().sub(current.origin).dot(direction) - current.startT;
					delta.copy(direction).multiplyScalar(distance);
				}
				if (!Number.isFinite(delta.x + delta.y + delta.z) || delta.lengthSq() > 1600) return;
				const next = applyMove(current.before, current.selection, [delta.x, delta.y, delta.z]);
				previewRef.current = next;
				onPreviewRef.current(next);
				setCursor("grabbing");
				return;
			}
			if (current?.kind === "click") {
				const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y);
				if (moved > 6) {
					if (current.pointerType === "touch") {
						drag.current = {
							kind: "orbit",
							pointerId: current.pointerId,
							x: event.clientX,
							y: event.clientY,
						};
					} else drag.current = null;
				}
				return;
			}
			const inside =
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom;
			if (!inside) {
				rememberHover(null);
				setHotAxis(null);
				setCursor("default");
				return;
			}
			const solids = solidsIn(root);
			const axis = pickGizmo(
				event,
				selectionPivot(sceneRef.current, selectionRef.current),
				camera,
				rect,
			);
			setHotAxis(axis);
			if (axis) {
				rememberHover(null);
				setCursor("grab");
				return;
			}
			const mode = selectionRef.current.mode;
			const hit =
				mode === "vertex"
					? pickVertex(event, sceneRef.current, camera, rect, solids)
					: mode === "line"
						? pickLine(event, sceneRef.current, camera, rect, solids)
						: mode === "face"
							? pickFace(event, camera, rect, solids)
							: pickShape(event, camera, rect, solids);
			rememberHover(hit);
			setCursor(hit ? "pointer" : "default");
		};

		const onPointerUp = (event: PointerEvent) => {
			const current = drag.current;
			if (!current || current.pointerId !== event.pointerId) return;
			if (current.kind === "move") {
				finishMove(true);
				setCursor("default");
				return;
			}
			if (current.kind === "right") {
				drag.current = null;
				onMenuRef.current(current.x, current.y);
				return;
			}
			if (current.kind === "click") {
				drag.current = null;
				const rect = rectOf();
				const solids = solidsIn(root);
				const mode = selectionRef.current.mode;
				const hit =
					mode === "vertex"
						? pickVertex(event, sceneRef.current, camera, rect, solids)
						: mode === "line"
							? pickLine(event, sceneRef.current, camera, rect, solids)
							: mode === "face"
								? pickFace(event, camera, rect, solids)
								: pickShape(event, camera, rect, solids);
				onPickRef.current(hit, current.shift);
				return;
			}
			drag.current = null;
			setCursor("default");
		};

		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			view.current.radius = Math.min(
				40,
				Math.max(1.6, view.current.radius * Math.exp(event.deltaY * 0.0011)),
			);
		};
		const onContext = (event: Event) => event.preventDefault();

		canvas.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		canvas.addEventListener("wheel", onWheel, { passive: false });
		canvas.addEventListener("contextmenu", onContext);
		return () => {
			cancelRef.current = null;
			canvas.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			canvas.removeEventListener("wheel", onWheel);
			canvas.removeEventListener("contextmenu", onContext);
		};
	}, [camera, cancelRef, gl, root]);

	return (
		<>
			<color attach="background" args={["#141210"]} />
			<fog attach="fog" args={["#141210", 18, 42]} />
			<hemisphereLight color="#f4efe8" groundColor="#3a332e" intensity={0.65} />
			<ambientLight intensity={0.22} />
			<directionalLight position={[6, 9, 4]} intensity={1.85} />
			<directionalLight position={[-4, 3, -3]} intensity={0.35} />
			<gridHelper
				args={[14, 14, "#4a433c", "#2c2824"]}
				position={[0, -0.001, 0]}
				raycast={skipRaycast}
			/>
			{scene.meshes.map((mesh) => (
				<ShapeView
					key={mesh.id}
					mesh={mesh}
					mode={selection.mode}
					shapeSelected={selection.mode === "shape" && selection.shapeIds.includes(mesh.id)}
					active={mesh.id === selection.activeId}
					selectedVertices={
						selection.mode === "vertex" && mesh.id === selection.activeId
							? selection.vertices
							: NO_VERTS
					}
					selectedLines={
						selection.mode === "line" && mesh.id === selection.activeId ? selection.lines : NO_LINES
					}
					selectedFaces={
						selection.mode === "face" && mesh.id === selection.activeId ? selection.faces : NO_FACES
					}
					hover={hover}
				/>
			))}
			{pivot && <Gizmo origin={pivot} hot={hotAxis} />}
		</>
	);
}

function selectionFromPick(selection: Selection, hit: PickHit | null, shift: boolean): Selection {
	if (!hit) {
		if (shift) return selection;
		if (selection.mode === "shape") return { ...selection, shapeIds: [] };
		return { ...selection, vertices: [], lines: [], faces: [] };
	}
	if (selection.mode === "shape" || hit.kind === "shape") {
		const shapeIds = shift ? toggle(selection.shapeIds, hit.meshId) : [hit.meshId];
		return {
			mode: "shape",
			activeId: hit.meshId,
			shapeIds,
			vertices: [],
			lines: [],
			faces: [],
		};
	}
	if (!shift || hit.meshId !== selection.activeId) {
		return {
			...selection,
			activeId: hit.meshId,
			shapeIds: [hit.meshId],
			vertices: hit.kind === "vertex" ? [hit.index] : [],
			lines: hit.kind === "line" ? [hit.key] : [],
			faces: hit.kind === "face" ? [hit.index] : [],
		};
	}
	if (hit.kind === "vertex")
		return { ...selection, vertices: toggle(selection.vertices, hit.index) };
	if (hit.kind === "line") return { ...selection, lines: toggle(selection.lines, hit.key) };
	if (hit.kind === "face") return { ...selection, faces: toggle(selection.faces, hit.index) };
	return selection;
}

export default function Modeller() {
	const [history, setHistory] = useState<History>(() => ({
		past: [],
		scene: initialScene(),
		future: [],
	}));
	const [selection, setSelection] = useState<Selection>(() => initialSelection(history.scene));
	const sceneRef = useRef(history.scene);
	const selectionRef = useRef(selection);
	sceneRef.current = history.scene;
	selectionRef.current = selection;
	const cancelRef = useRef<(() => void) | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const pointerRef = useRef({ x: 0, y: 0 });
	const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);

	const openAddMenu = (clientX: number, clientY: number) => {
		const rect = rootRef.current?.getBoundingClientRect();
		if (!rect) return;
		const width = 176;
		const height = 148;
		setAddMenu({
			x: Math.min(Math.max(8, clientX - rect.left), rect.width - width - 8),
			y: Math.min(Math.max(8, clientY - rect.top), rect.height - height - 8),
		});
	};

	useEffect(() => {
		setSelection((current) => sanitizeSelection(history.scene, current));
	}, [history.scene]);

	const commit = (before: Scene, next: Scene) => {
		setHistory((current) => {
			if (scenesEqual(before, next)) return { ...current, scene: before };
			return { past: [...current.past, before].slice(-50), scene: next, future: [] };
		});
	};

	const preview = (next: Scene) => {
		setHistory((current) => ({ ...current, scene: next }));
	};

	const undo = () => {
		setHistory((current) => {
			const previous = current.past[current.past.length - 1];
			if (!previous) return current;
			return {
				past: current.past.slice(0, -1),
				scene: previous,
				future: [current.scene, ...current.future],
			};
		});
	};

	const redo = () => {
		setHistory((current) => {
			const [next, ...rest] = current.future;
			if (!next) return current;
			return { past: [...current.past, current.scene], scene: next, future: rest };
		});
	};

	const setMode = (mode: Mode) => {
		setSelection((current) => {
			if (current.mode === mode) return current;
			const activeId =
				current.activeId ?? current.shapeIds[0] ?? sceneRef.current.meshes[0]?.id ?? null;
			return {
				mode,
				activeId,
				shapeIds: mode === "shape" && activeId ? [activeId] : current.shapeIds,
				vertices: [],
				lines: [],
				faces: [],
			};
		});
	};

	const add = (kind: ShapeKind) => {
		const result = addShape(sceneRef.current, kind);
		commit(sceneRef.current, result.scene);
		setSelection({
			mode: "shape",
			activeId: result.id,
			shapeIds: [result.id],
			vertices: [],
			lines: [],
			faces: [],
		});
	};

	const extrude = () => {
		const current = selectionRef.current;
		const scene = sceneRef.current;
		if (current.mode !== "face" || current.faces.length === 0) return;
		const mesh = scene.meshes.find((item) => item.id === current.activeId);
		if (!mesh) return;
		commit(scene, replaceMesh(scene, extrudeFaces(mesh, current.faces)));
	};

	const merge = () => {
		const current = selectionRef.current;
		const scene = sceneRef.current;
		if (current.mode === "vertex" && current.vertices.length >= 2) {
			const mesh = scene.meshes.find((item) => item.id === current.activeId);
			if (!mesh) return;
			const merged = mergeVertices(mesh, current.vertices);
			commit(scene, replaceMesh(scene, merged.mesh));
			setSelection({ ...current, vertices: [merged.index], lines: [], faces: [] });
			return;
		}
		if (current.mode === "shape" && current.shapeIds.length >= 2) {
			const joined = joinShapes(scene, current.shapeIds);
			if (!joined) return;
			commit(scene, joined.scene);
			setSelection({
				mode: "shape",
				activeId: joined.id,
				shapeIds: [joined.id],
				vertices: [],
				lines: [],
				faces: [],
			});
		}
	};

	const remove = () => {
		const current = selectionRef.current;
		const scene = sceneRef.current;
		if (current.mode === "shape") {
			if (current.shapeIds.length === 0) return;
			commit(scene, deleteShapes(scene, current.shapeIds));
			setSelection({
				...current,
				shapeIds: [],
				activeId: null,
				vertices: [],
				lines: [],
				faces: [],
			});
			return;
		}
		const mesh = scene.meshes.find((item) => item.id === current.activeId);
		if (!mesh) return;
		if (current.mode === "face" && current.faces.length > 0) {
			commit(scene, replaceMesh(scene, deleteFaces(mesh, current.faces)));
		} else if (current.mode === "line" && current.lines.length > 0) {
			commit(scene, replaceMesh(scene, deleteEdges(mesh, current.lines)));
		} else if (current.mode === "vertex" && current.vertices.length > 0) {
			commit(scene, replaceMesh(scene, deleteVertices(mesh, current.vertices)));
		} else return;
		setSelection({ ...current, vertices: [], lines: [], faces: [] });
	};

	const selectAll = () => {
		const scene = sceneRef.current;
		setSelection((current) => {
			if (current.mode === "shape") {
				const shapeIds = scene.meshes.map((mesh) => mesh.id);
				return { ...current, shapeIds, activeId: shapeIds[0] ?? null };
			}
			const mesh = scene.meshes.find((item) => item.id === current.activeId) ?? scene.meshes[0];
			if (!mesh) return current;
			if (current.mode === "vertex") {
				return {
					...current,
					activeId: mesh.id,
					vertices: mesh.vertices.map((_, index) => index),
					lines: [],
					faces: [],
				};
			}
			if (current.mode === "line") {
				return {
					...current,
					activeId: mesh.id,
					vertices: [],
					lines: meshEdges(mesh).map(([a, b]) => edgeKey(a, b)),
					faces: [],
				};
			}
			return {
				...current,
				activeId: mesh.id,
				vertices: [],
				lines: [],
				faces: mesh.faces.map((_, index) => index),
			};
		});
	};

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
			) {
				return;
			}
			const key = event.key.toLowerCase();
			const mod = event.ctrlKey || event.metaKey;
			if (key === "escape") {
				cancelRef.current?.();
				if (addMenu) {
					setAddMenu(null);
					return;
				}
				setSelection((current) =>
					current.mode === "shape"
						? { ...current, shapeIds: [] }
						: { ...current, vertices: [], lines: [], faces: [] },
				);
				return;
			}
			if (mod && key === "z") {
				event.preventDefault();
				if (event.shiftKey) redo();
				else undo();
				return;
			}
			if (mod && key === "y") {
				event.preventDefault();
				redo();
				return;
			}
			if (key === "a" && event.shiftKey) {
				event.preventDefault();
				const rect = rootRef.current?.getBoundingClientRect();
				const x = pointerRef.current.x || (rect ? rect.left + rect.width * 0.62 : 0);
				const y = pointerRef.current.y || (rect ? rect.top + rect.height * 0.42 : 0);
				openAddMenu(x, y);
				return;
			}
			if (key === "a") {
				event.preventDefault();
				selectAll();
				return;
			}
			if (mod) return;
			if (key === "1") setMode("vertex");
			else if (key === "2") setMode("line");
			else if (key === "3") setMode("face");
			else if (key === "4") setMode("shape");
			else if (key === "e") extrude();
			else if (key === "m") merge();
			else if (key === "delete" || key === "backspace") {
				event.preventDefault();
				remove();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	const canExtrude = selection.mode === "face" && selection.faces.length > 0;
	const canMerge =
		(selection.mode === "shape" && selection.shapeIds.length >= 2) ||
		(selection.mode === "vertex" && selection.vertices.length >= 2);
	const canDelete =
		(selection.mode === "shape" && selection.shapeIds.length > 0) ||
		(selection.mode === "vertex" && selection.vertices.length > 0) ||
		(selection.mode === "line" && selection.lines.length > 0) ||
		(selection.mode === "face" && selection.faces.length > 0);

	return (
		<div
			ref={rootRef}
			className="relative flex h-[calc(100svh-9rem)] min-h-[70vh] w-full bg-[#141210] text-[#f4efe8]"
			data-modeller
			onPointerMove={(event) => {
				pointerRef.current = { x: event.clientX, y: event.clientY };
			}}
		>
			<Sidebar
				selection={selection}
				meshes={history.scene.meshes}
				canExtrude={canExtrude}
				canMerge={canMerge}
				canDelete={canDelete}
				canUndo={history.past.length > 0}
				canRedo={history.future.length > 0}
				onMode={setMode}
				onExtrude={extrude}
				onMerge={merge}
				onDelete={remove}
				onUndo={undo}
				onRedo={redo}
				onShape={(meshId, shift) => {
					setAddMenu(null);
					setSelection((current) => {
						const shapeIds = shift
							? toggle(
									current.mode === "shape"
										? current.shapeIds
										: current.activeId
											? [current.activeId]
											: [],
									meshId,
								)
							: [meshId];
						return {
							mode: "shape",
							activeId: meshId,
							shapeIds,
							vertices: [],
							lines: [],
							faces: [],
						};
					});
				}}
			/>
			<div className="relative min-w-0 flex-1">
				<Canvas
					className="h-full w-full"
					camera={{ fov: 38, near: 0.05, far: 100, position: [4.2, 3.4, 4.6] }}
					dpr={[1, 2]}
					gl={{ antialias: true }}
					aria-label="Modeller viewport"
				>
					<Stage
						scene={history.scene}
						selection={selection}
						onPreview={preview}
						onCommit={commit}
						onPick={(hit, shift) => {
							setAddMenu(null);
							setSelection((current) => selectionFromPick(current, hit, shift));
						}}
						onMenu={openAddMenu}
						cancelRef={cancelRef}
					/>
				</Canvas>
				<p className="pointer-events-none absolute top-4 left-4 rounded-full bg-black/45 px-3 py-1 text-xs tracking-wide backdrop-blur-sm">
					{statusText(history.scene, selection)}
				</p>
				{history.scene.meshes.length === 0 && (
					<p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#f4efe8]/70">
						Right-click, or press Shift A, to add a shape.
					</p>
				)}
			</div>
			{addMenu && (
				<AddMenu
					x={addMenu.x}
					y={addMenu.y}
					room={(rootRef.current?.clientWidth ?? 0) - addMenu.x}
					onAdd={(kind) => {
						setAddMenu(null);
						add(kind);
					}}
					onClose={() => setAddMenu(null)}
				/>
			)}
		</div>
	);
}

function shapeIcon(name: string): LucideIcon {
	if (name.startsWith("Plane")) return Square;
	if (name.startsWith("Cylinder")) return Cylinder;
	return Box;
}

function Sidebar({
	selection,
	meshes,
	canExtrude,
	canMerge,
	canDelete,
	canUndo,
	canRedo,
	onMode,
	onExtrude,
	onMerge,
	onDelete,
	onUndo,
	onRedo,
	onShape,
}: {
	selection: Selection;
	meshes: MeshData[];
	canExtrude: boolean;
	canMerge: boolean;
	canDelete: boolean;
	canUndo: boolean;
	canRedo: boolean;
	onMode: (mode: Mode) => void;
	onExtrude: () => void;
	onMerge: () => void;
	onDelete: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onShape: (id: string, shift: boolean) => void;
}) {
	return (
		<aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-[#1c1917]">
			<div className="border-b border-white/10 px-3 py-3">
				<p className="text-[11px] tracking-[0.16em] text-[#f4efe8]/45 uppercase">Select</p>
				<div className="mt-2 grid grid-cols-2 gap-1">
					{MODES.map((mode) => (
						<RailButton
							key={mode.id}
							icon={mode.icon}
							label={mode.label}
							shortcut={mode.shortcut}
							pressed={selection.mode === mode.id}
							onClick={() => onMode(mode.id)}
						/>
					))}
				</div>
			</div>
			<div className="border-b border-white/10 px-3 py-3">
				<p className="text-[11px] tracking-[0.16em] text-[#f4efe8]/45 uppercase">Edit</p>
				<div className="mt-2 flex flex-col gap-1">
					<RailButton
						icon={ArrowUpFromLine}
						label="Extrude"
						shortcut="E"
						disabled={!canExtrude}
						onClick={onExtrude}
					/>
					<RailButton
						icon={Combine}
						label="Merge"
						shortcut="M"
						disabled={!canMerge}
						onClick={onMerge}
					/>
					<RailButton
						icon={Trash2}
						label="Delete"
						shortcut="Del"
						disabled={!canDelete}
						onClick={onDelete}
					/>
				</div>
				<div className="mt-2 flex gap-1">
					<RailButton icon={Undo2} label="Undo" disabled={!canUndo} onClick={onUndo} compact />
					<RailButton icon={Redo2} label="Redo" disabled={!canRedo} onClick={onRedo} compact />
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col px-3 py-3">
				<p className="text-[11px] tracking-[0.16em] text-[#f4efe8]/45 uppercase">Scene</p>
				<ul className="mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
					{meshes.map((mesh) => {
						const Icon = shapeIcon(mesh.name);
						const selected = selection.mode === "shape" && selection.shapeIds.includes(mesh.id);
						const active = mesh.id === selection.activeId;
						return (
							<li key={mesh.id}>
								<button
									type="button"
									aria-pressed={selected}
									onClick={(event) => onShape(mesh.id, event.shiftKey)}
									className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
										selected
											? "bg-[#fecef5] text-[#191b1a]"
											: active
												? "bg-white/10 text-[#f4efe8]"
												: "text-[#f4efe8]/80 hover:bg-white/10"
									}`}
								>
									<Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
									<span className="truncate">{mesh.name}</span>
								</button>
							</li>
						);
					})}
				</ul>
				<p className="mt-3 text-[11px] leading-relaxed text-[#f4efe8]/40">
					Right-click or Shift A to add. Right-drag orbits.
				</p>
			</div>
		</aside>
	);
}

function RailButton({
	icon: Icon,
	label,
	shortcut,
	pressed,
	disabled,
	compact,
	onClick,
}: {
	icon: LucideIcon;
	label: string;
	shortcut?: string;
	pressed?: boolean;
	disabled?: boolean;
	compact?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			disabled={disabled}
			title={shortcut ? `${label} (${shortcut})` : label}
			onClick={onClick}
			className={`flex items-center gap-2 rounded-md text-left text-sm disabled:cursor-not-allowed disabled:opacity-35 ${
				compact ? "flex-1 justify-center px-2 py-1.5" : "w-full px-2 py-1.5"
			} ${pressed ? "bg-[#fecef5] text-[#191b1a]" : "text-[#f4efe8]/85 hover:bg-white/10"}`}
		>
			<Icon className="size-4 shrink-0" strokeWidth={1.75} />
			{compact ? <span className="sr-only">{label}</span> : <span className="flex-1">{label}</span>}
			{!compact && shortcut && (
				<span
					className={`text-[10px] tracking-wide ${pressed ? "text-[#191b1a]/60" : "text-[#f4efe8]/35"}`}
				>
					{shortcut}
				</span>
			)}
		</button>
	);
}

function AddMenu({
	x,
	y,
	room,
	onAdd,
	onClose,
}: {
	x: number;
	y: number;
	room: number;
	onAdd: (kind: ShapeKind) => void;
	onClose: () => void;
}) {
	const flip = room < 340;
	useEffect(() => {
		const close = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Element && target.closest("[data-add-menu]")) return;
			onClose();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("pointerdown", close);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointerdown", close);
			window.removeEventListener("keydown", onKey);
		};
	}, [onClose]);

	return (
		<div
			data-add-menu
			className="absolute z-20 w-44 overflow-visible rounded-md border border-white/10 bg-[#241f1c] py-1 shadow-xl"
			style={{ left: x, top: y }}
			onContextMenu={(event) => event.preventDefault()}
		>
			<p className="px-3 py-1 text-[11px] tracking-[0.16em] text-[#f4efe8]/40 uppercase">Add</p>
			<div className="relative">
				<div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 text-sm">
					<Boxes className="size-4 text-[#fecef5]" strokeWidth={1.75} />
					<span className="flex-1">Mesh</span>
					<ChevronRight className="size-3.5 text-[#f4efe8]/50" />
				</div>
				<div
					className={`absolute top-0 z-10 w-40 rounded-md border border-white/10 bg-[#241f1c] py-1 shadow-xl ${
						flip ? "right-[calc(100%-6px)]" : "left-[calc(100%-6px)]"
					}`}
				>
					{SHAPES.map((shape) => (
						<button
							key={shape.kind}
							type="button"
							onClick={() => onAdd(shape.kind)}
							className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[#fecef5] hover:text-[#191b1a]"
						>
							<shape.icon className="size-4" strokeWidth={1.75} />
							{shape.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
