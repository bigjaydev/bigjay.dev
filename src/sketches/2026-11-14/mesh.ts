export type Vec3 = [number, number, number];

export type MeshData = {
	id: string;
	name: string;
	position: Vec3;
	vertices: Vec3[];
	faces: number[][];
};

export type Scene = {
	meshes: MeshData[];
};

export type ShapeKind = "box" | "plane" | "cylinder";

export type Mode = "shape" | "vertex" | "line" | "face";

export type Selection = {
	mode: Mode;
	activeId: string | null;
	shapeIds: string[];
	vertices: number[];
	lines: string[];
	faces: number[];
};

export const EXTRUDE_DISTANCE = 0.45;

let seq = 0;

function uid(prefix: string): string {
	seq += 1;
	return `${prefix}-${seq.toString(36)}`;
}

export function add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function average(points: Vec3[]): Vec3 {
	if (points.length === 0) return [0, 0, 0];
	let x = 0;
	let y = 0;
	let z = 0;
	for (const point of points) {
		x += point[0];
		y += point[1];
		z += point[2];
	}
	return [x / points.length, y / points.length, z / points.length];
}

/** Newell's method. Magnitude is twice the polygon area. */
function areaVector(vertices: Vec3[], face: number[]): Vec3 {
	let x = 0;
	let y = 0;
	let z = 0;
	for (let i = 0; i < face.length; i++) {
		const a = vertices[face[i]];
		const b = vertices[face[(i + 1) % face.length]];
		if (!a || !b) continue;
		x += (a[1] - b[1]) * (a[2] + b[2]);
		y += (a[2] - b[2]) * (a[0] + b[0]);
		z += (a[0] - b[0]) * (a[1] + b[1]);
	}
	return [x, y, z];
}

export function faceNormal(vertices: Vec3[], face: number[]): Vec3 {
	const area = areaVector(vertices, face);
	const len = Math.hypot(area[0], area[1], area[2]);
	if (len < 1e-12) return [0, 1, 0];
	return [area[0] / len, area[1] / len, area[2] / len];
}

function facing(vertices: Vec3[], face: number[], direction: Vec3): number[] {
	const normal = faceNormal(vertices, face);
	return dot(normal, direction) < 0 ? [...face].reverse() : face.slice();
}

export function edgeKey(a: number, b: number): string {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function parseEdge(key: string): [number, number] {
	const [a, b] = key.split(":");
	return [Number(a), Number(b)];
}

export function meshEdges(mesh: MeshData): [number, number][] {
	const edges = new Map<string, [number, number]>();
	for (const face of mesh.faces) {
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			edges.set(edgeKey(a, b), a < b ? [a, b] : [b, a]);
		}
	}
	return [...edges.values()];
}

function shape(
	id: string,
	name: string,
	position: Vec3,
	vertices: Vec3[],
	faces: number[][],
): MeshData {
	return { id, name, position: [...position], vertices, faces };
}

export function createBox(position: Vec3 = [0, 0.5, 0], name = "Box", id = uid("shape")): MeshData {
	const vertices: Vec3[] = [
		[-0.5, -0.5, -0.5],
		[0.5, -0.5, -0.5],
		[0.5, 0.5, -0.5],
		[-0.5, 0.5, -0.5],
		[-0.5, -0.5, 0.5],
		[0.5, -0.5, 0.5],
		[0.5, 0.5, 0.5],
		[-0.5, 0.5, 0.5],
	];
	const faces = [
		[0, 1, 5, 4],
		[3, 7, 6, 2],
		[4, 5, 6, 7],
		[1, 0, 3, 2],
		[5, 1, 2, 6],
		[0, 4, 7, 3],
	].map((face, index) => {
		const outward: Vec3[] = [
			[0, -1, 0],
			[0, 1, 0],
			[0, 0, 1],
			[0, 0, -1],
			[1, 0, 0],
			[-1, 0, 0],
		];
		return facing(vertices, face, outward[index]);
	});
	return shape(id, name, position, vertices, faces);
}

export function createPlane(
	position: Vec3 = [0, 0, 0],
	name = "Plane",
	id = uid("shape"),
): MeshData {
	const vertices: Vec3[] = [
		[-0.5, 0, -0.5],
		[0.5, 0, -0.5],
		[0.5, 0, 0.5],
		[-0.5, 0, 0.5],
	];
	return shape(id, name, position, vertices, [facing(vertices, [0, 1, 2, 3], [0, 1, 0])]);
}

export function createCylinder(
	position: Vec3 = [0, 0.5, 0],
	name = "Cylinder",
	id = uid("shape"),
): MeshData {
	const sides = 16;
	const vertices: Vec3[] = [];
	for (let i = 0; i < sides; i++) {
		const angle = (i / sides) * Math.PI * 2;
		vertices.push([Math.cos(angle) * 0.5, -0.5, Math.sin(angle) * 0.5]);
	}
	for (let i = 0; i < sides; i++) {
		const angle = (i / sides) * Math.PI * 2;
		vertices.push([Math.cos(angle) * 0.5, 0.5, Math.sin(angle) * 0.5]);
	}
	const bottom = facing(
		vertices,
		Array.from({ length: sides }, (_, index) => index),
		[0, -1, 0],
	);
	const top = facing(
		vertices,
		Array.from({ length: sides }, (_, index) => sides + index),
		[0, 1, 0],
	);
	const faces = [bottom, top];
	for (let i = 0; i < sides; i++) {
		const next = (i + 1) % sides;
		const radial: Vec3 = [vertices[i][0], 0, vertices[i][2]];
		faces.push(facing(vertices, [i, next, sides + next, sides + i], radial));
	}
	return shape(id, name, position, vertices, faces);
}

function uniqueName(scene: Scene, base: string): string {
	const taken = new Set(scene.meshes.map((mesh) => mesh.name));
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base} ${n}`)) n += 1;
	return `${base} ${n}`;
}

function spawnPosition(scene: Scene, kind: ShapeKind): Vec3 {
	const n = scene.meshes.length;
	const y = kind === "plane" ? 0 : 0.5;
	return [(n % 3) * 1.75, y, Math.floor(n / 3) * 1.75];
}

export function addShape(scene: Scene, kind: ShapeKind): { scene: Scene; id: string } {
	const labels: Record<ShapeKind, string> = { box: "Box", plane: "Plane", cylinder: "Cylinder" };
	const position = spawnPosition(scene, kind);
	const name = uniqueName(scene, labels[kind]);
	const mesh =
		kind === "box"
			? createBox(position, name)
			: kind === "plane"
				? createPlane(position, name)
				: createCylinder(position, name);
	return { scene: { meshes: [...scene.meshes, mesh] }, id: mesh.id };
}

export function initialScene(): Scene {
	return { meshes: [createBox()] };
}

export function initialSelection(scene: Scene): Selection {
	const id = scene.meshes[0]?.id ?? null;
	return {
		mode: "shape",
		activeId: id,
		shapeIds: id ? [id] : [],
		vertices: [],
		lines: [],
		faces: [],
	};
}

function islands(mesh: MeshData, faceIndices: number[]): number[][] {
	const selected = new Set(faceIndices);
	const parent = new Map<number, number>();
	const find = (index: number): number => {
		const current = parent.get(index) ?? index;
		if (current === index) return index;
		const root = find(current);
		parent.set(index, root);
		return root;
	};
	const union = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent.set(ra, rb);
	};
	for (const index of selected) parent.set(index, index);
	const sharing = new Map<string, number[]>();
	for (const index of selected) {
		const face = mesh.faces[index];
		for (let i = 0; i < face.length; i++) {
			const key = edgeKey(face[i], face[(i + 1) % face.length]);
			const list = sharing.get(key);
			if (list) list.push(index);
			else sharing.set(key, [index]);
		}
	}
	for (const list of sharing.values()) {
		for (let i = 1; i < list.length; i++) union(list[0], list[i]);
	}
	const groups = new Map<number, number[]>();
	for (const index of selected) {
		const root = find(index);
		const group = groups.get(root);
		if (group) group.push(index);
		else groups.set(root, [index]);
	}
	return [...groups.values()];
}

function islandDirection(mesh: MeshData, faceIndices: number[]): Vec3 | null {
	let x = 0;
	let y = 0;
	let z = 0;
	for (const index of faceIndices) {
		const area = areaVector(mesh.vertices, mesh.faces[index]);
		x += area[0];
		y += area[1];
		z += area[2];
	}
	const len = Math.hypot(x, y, z);
	if (len < 1e-8) return null;
	return [x / len, y / len, z / len];
}

/**
 * Region extrude. Faces that share an edge move together and grow walls only
 * around the boundary. A closed selection with no boundary just translates.
 * The new cap keeps the original face index, so the selection can stay put.
 */
function extrudeIsland(mesh: MeshData, faceIndices: number[], distance: number): MeshData {
	const selected = new Set(faceIndices.filter((index) => mesh.faces[index] != null));
	if (selected.size === 0) return mesh;
	const direction = islandDirection(mesh, [...selected]);
	if (!direction) return mesh;

	const vertices = mesh.vertices.map((vertex) => [vertex[0], vertex[1], vertex[2]] as Vec3);
	const faces = mesh.faces.map((face) => face.slice());
	const boundary: { a: number; b: number }[] = [];
	const seenEdges = new Map<string, { a: number; b: number; count: number }>();
	for (const index of selected) {
		const face = faces[index];
		for (let i = 0; i < face.length; i++) {
			const a = face[i];
			const b = face[(i + 1) % face.length];
			const key = edgeKey(a, b);
			const row = seenEdges.get(key);
			if (row) row.count += 1;
			else seenEdges.set(key, { a, b, count: 1 });
		}
	}
	for (const edge of seenEdges.values()) {
		if (edge.count === 1) boundary.push(edge);
	}

	const incident = new Map<number, number[]>();
	faces.forEach((face, index) => {
		for (const vertex of face) {
			const list = incident.get(vertex);
			if (list) list.push(index);
			else incident.set(vertex, [index]);
		}
	});
	const boundaryVerts = new Set<number>();
	for (const edge of boundary) {
		boundaryVerts.add(edge.a);
		boundaryVerts.add(edge.b);
	}
	const needsCopy = (vertex: number) =>
		boundaryVerts.has(vertex) || (incident.get(vertex) ?? []).some((index) => !selected.has(index));

	const seen = new Set<number>();
	const centerPoints: Vec3[] = [];
	for (const index of selected) {
		for (const vertex of faces[index]) {
			if (seen.has(vertex)) continue;
			seen.add(vertex);
			centerPoints.push(vertices[vertex]);
		}
	}
	const center = average(centerPoints);

	const copy = new Map<number, number>();
	const copyOf = (vertex: number) => {
		if (!needsCopy(vertex)) return vertex;
		let created = copy.get(vertex);
		if (created == null) {
			created = vertices.length;
			const source = vertices[vertex];
			vertices.push([source[0], source[1], source[2]]);
			copy.set(vertex, created);
		}
		return created;
	};

	for (const index of selected) faces[index] = faces[index].map(copyOf);

	const sideStart = faces.length;
	for (const edge of boundary) {
		const a2 = copy.get(edge.a);
		const b2 = copy.get(edge.b);
		if (a2 == null || b2 == null) continue;
		const side = [edge.a, edge.b, b2, a2];
		if (new Set(side).size >= 3) faces.push(side);
	}

	const move = new Set<number>();
	for (const index of selected) {
		for (const vertex of faces[index]) move.add(vertex);
	}
	for (const vertex of move) {
		const current = vertices[vertex];
		vertices[vertex] = [
			current[0] + direction[0] * distance,
			current[1] + direction[1] * distance,
			current[2] + direction[2] * distance,
		];
	}

	for (let index = sideStart; index < faces.length; index++) {
		const normal = faceNormal(vertices, faces[index]);
		const midpoint = average(faces[index].map((vertex) => vertices[vertex]));
		if (dot(normal, sub(midpoint, center)) < 0) faces[index].reverse();
	}

	return { ...mesh, vertices, faces };
}

export function extrudeFaces(
	mesh: MeshData,
	faceIndices: number[],
	distance = EXTRUDE_DISTANCE,
): MeshData {
	const valid = [...new Set(faceIndices)].filter((index) => mesh.faces[index] != null);
	if (valid.length === 0 || Math.abs(distance) < 1e-8) return mesh;
	let next = mesh;
	for (const island of islands(mesh, valid)) {
		if (!islandDirection(next, island)) {
			for (const face of island) next = extrudeIsland(next, [face], distance);
		} else {
			next = extrudeIsland(next, island, distance);
		}
	}
	return next;
}

function compact(mesh: MeshData): { mesh: MeshData; remap: Map<number, number> } {
	const used = new Set<number>();
	for (const face of mesh.faces) {
		for (const index of face) used.add(index);
	}
	const remap = new Map<number, number>();
	const vertices: Vec3[] = [];
	for (const index of [...used].sort((a, b) => a - b)) {
		const vertex = mesh.vertices[index];
		if (!vertex) continue;
		remap.set(index, vertices.length);
		vertices.push([vertex[0], vertex[1], vertex[2]]);
	}
	return {
		mesh: {
			...mesh,
			vertices,
			faces: mesh.faces.map((face) => face.map((index) => remap.get(index) ?? 0)),
		},
		remap,
	};
}

function deduped(face: number[]): number[] {
	const mapped: number[] = [];
	for (const index of face) {
		if (mapped[mapped.length - 1] !== index) mapped.push(index);
	}
	if (mapped.length > 1 && mapped[0] === mapped[mapped.length - 1]) mapped.pop();
	return mapped;
}

export function mergeVertices(
	mesh: MeshData,
	indices: number[],
): { mesh: MeshData; index: number } {
	const unique = [...new Set(indices)].filter((index) => mesh.vertices[index] != null);
	if (unique.length < 2) return { mesh, index: unique[0] ?? 0 };
	const target = unique[0];
	const drop = new Set(unique.slice(1));
	const center = average(unique.map((index) => mesh.vertices[index]));
	const vertices = mesh.vertices.map((vertex, index) =>
		index === target ? center : ([vertex[0], vertex[1], vertex[2]] as Vec3),
	);
	const faces = mesh.faces
		.map((face) => deduped(face.map((index) => (drop.has(index) ? target : index))))
		.filter((face) => new Set(face).size >= 3);
	const compacted = compact({ ...mesh, vertices, faces });
	return { mesh: compacted.mesh, index: compacted.remap.get(target) ?? 0 };
}

function weld(mesh: MeshData, epsilon: number): MeshData {
	const epsilonSq = epsilon * epsilon;
	const vertices: Vec3[] = [];
	const remap: number[] = [];
	for (const vertex of mesh.vertices) {
		let found = -1;
		for (let index = 0; index < vertices.length; index++) {
			const other = vertices[index];
			const dist =
				(other[0] - vertex[0]) ** 2 + (other[1] - vertex[1]) ** 2 + (other[2] - vertex[2]) ** 2;
			if (dist <= epsilonSq) {
				found = index;
				break;
			}
		}
		if (found === -1) {
			remap.push(vertices.length);
			vertices.push([vertex[0], vertex[1], vertex[2]]);
		} else {
			remap.push(found);
		}
	}
	const faces = mesh.faces
		.map((face) => deduped(face.map((index) => remap[index])))
		.filter((face) => new Set(face).size >= 3);
	return compact({ ...mesh, vertices, faces }).mesh;
}

export function joinShapes(scene: Scene, ids: string[]): { scene: Scene; id: string } | null {
	const keep = new Set(ids);
	const chosen = scene.meshes.filter((mesh) => keep.has(mesh.id));
	if (chosen.length < 2) return null;
	const vertices: Vec3[] = [];
	const faces: number[][] = [];
	for (const mesh of chosen) {
		const offset = vertices.length;
		for (const vertex of mesh.vertices) {
			vertices.push([
				vertex[0] + mesh.position[0],
				vertex[1] + mesh.position[1],
				vertex[2] + mesh.position[2],
			]);
		}
		for (const face of mesh.faces) faces.push(face.map((index) => index + offset));
	}
	const joined = weld(
		{
			id: uid("shape"),
			name: chosen[0].name,
			position: [0, 0, 0],
			vertices,
			faces,
		},
		1e-4,
	);
	let placed = false;
	const meshes: MeshData[] = [];
	for (const mesh of scene.meshes) {
		if (!keep.has(mesh.id)) meshes.push(mesh);
		else if (!placed) {
			meshes.push(joined);
			placed = true;
		}
	}
	return { scene: { meshes }, id: joined.id };
}

export function deleteFaces(mesh: MeshData, faceIndices: number[]): MeshData {
	const drop = new Set(faceIndices);
	return compact({ ...mesh, faces: mesh.faces.filter((_, index) => !drop.has(index)) }).mesh;
}

export function deleteEdges(mesh: MeshData, keys: string[]): MeshData {
	const drop = new Set(keys);
	const faces = mesh.faces.filter((face) => {
		for (let i = 0; i < face.length; i++) {
			if (drop.has(edgeKey(face[i], face[(i + 1) % face.length]))) return false;
		}
		return true;
	});
	return compact({ ...mesh, faces }).mesh;
}

export function deleteVertices(mesh: MeshData, indices: number[]): MeshData {
	const drop = new Set(indices);
	const faces = mesh.faces.filter((face) => face.every((index) => !drop.has(index)));
	return compact({ ...mesh, faces }).mesh;
}

export function deleteShapes(scene: Scene, ids: string[]): Scene {
	const drop = new Set(ids);
	return { meshes: scene.meshes.filter((mesh) => !drop.has(mesh.id)) };
}

export function translateVertices(mesh: MeshData, indices: number[], delta: Vec3): MeshData {
	if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) return mesh;
	const move = new Set(indices);
	if (move.size === 0) return mesh;
	return {
		...mesh,
		vertices: mesh.vertices.map((vertex, index) =>
			move.has(index) ? [vertex[0] + delta[0], vertex[1] + delta[1], vertex[2] + delta[2]] : vertex,
		),
	};
}

export function translateShapes(scene: Scene, ids: string[], delta: Vec3): Scene {
	if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) return scene;
	const move = new Set(ids);
	return {
		meshes: scene.meshes.map((mesh) =>
			move.has(mesh.id) ? { ...mesh, position: add(mesh.position, delta) } : mesh,
		),
	};
}

export function replaceMesh(scene: Scene, mesh: MeshData): Scene {
	return { meshes: scene.meshes.map((item) => (item.id === mesh.id ? mesh : item)) };
}

function uniqueInRange(indices: number[], length: number): number[] {
	const seen = new Set<number>();
	const result: number[] = [];
	for (const index of indices) {
		if (index < 0 || index >= length || seen.has(index)) continue;
		seen.add(index);
		result.push(index);
	}
	return result;
}

export function movingVertices(mesh: MeshData, selection: Selection): number[] {
	if (selection.activeId !== mesh.id) return [];
	if (selection.mode === "vertex") return uniqueInRange(selection.vertices, mesh.vertices.length);
	if (selection.mode === "line") {
		const indices: number[] = [];
		for (const key of selection.lines) {
			const [a, b] = parseEdge(key);
			indices.push(a, b);
		}
		return uniqueInRange(indices, mesh.vertices.length);
	}
	if (selection.mode === "face") {
		const indices: number[] = [];
		for (const index of selection.faces) {
			const face = mesh.faces[index];
			if (face) indices.push(...face);
		}
		return uniqueInRange(indices, mesh.vertices.length);
	}
	return [];
}

export function worldVertex(mesh: MeshData, index: number): Vec3 {
	const vertex = mesh.vertices[index] ?? [0, 0, 0];
	return [vertex[0] + mesh.position[0], vertex[1] + mesh.position[1], vertex[2] + mesh.position[2]];
}

export function boundsCenter(mesh: MeshData): Vec3 {
	if (mesh.vertices.length === 0) return [...mesh.position];
	let minX = Infinity;
	let minY = Infinity;
	let minZ = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let maxZ = -Infinity;
	for (const vertex of mesh.vertices) {
		minX = Math.min(minX, vertex[0]);
		maxX = Math.max(maxX, vertex[0]);
		minY = Math.min(minY, vertex[1]);
		maxY = Math.max(maxY, vertex[1]);
		minZ = Math.min(minZ, vertex[2]);
		maxZ = Math.max(maxZ, vertex[2]);
	}
	return [
		mesh.position[0] + (minX + maxX) / 2,
		mesh.position[1] + (minY + maxY) / 2,
		mesh.position[2] + (minZ + maxZ) / 2,
	];
}

export function selectionPivot(scene: Scene, selection: Selection): Vec3 | null {
	if (selection.mode === "shape") {
		const chosen = scene.meshes.filter((mesh) => selection.shapeIds.includes(mesh.id));
		if (chosen.length === 0) return null;
		return average(chosen.map(boundsCenter));
	}
	const mesh = scene.meshes.find((item) => item.id === selection.activeId);
	if (!mesh) return null;
	const indices = movingVertices(mesh, selection);
	if (indices.length === 0) return null;
	return average(indices.map((index) => worldVertex(mesh, index)));
}

function sameList<T>(a: T[], b: T[]): boolean {
	return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function sanitizeSelection(scene: Scene, selection: Selection): Selection {
	const ids = new Set(scene.meshes.map((mesh) => mesh.id));
	const shapeIds = selection.shapeIds.filter((id) => ids.has(id));
	let activeId = selection.activeId && ids.has(selection.activeId) ? selection.activeId : null;
	if (!activeId) activeId = shapeIds[0] ?? scene.meshes[0]?.id ?? null;
	const mesh = scene.meshes.find((item) => item.id === activeId);
	const vertices = mesh ? selection.vertices.filter((index) => mesh.vertices[index] != null) : [];
	const faces = mesh ? selection.faces.filter((index) => mesh.faces[index] != null) : [];
	const edgeSet = new Set(mesh ? meshEdges(mesh).map(([a, b]) => edgeKey(a, b)) : []);
	const lines = mesh ? selection.lines.filter((key) => edgeSet.has(key)) : [];
	if (
		activeId === selection.activeId &&
		sameList(shapeIds, selection.shapeIds) &&
		sameList(vertices, selection.vertices) &&
		sameList(faces, selection.faces) &&
		sameList(lines, selection.lines)
	) {
		return selection;
	}
	return { ...selection, activeId, shapeIds, vertices, faces, lines };
}

export function solidArrays(mesh: MeshData): {
	positions: Float32Array;
	normals: Float32Array;
	triFace: number[];
} {
	const positions: number[] = [];
	const normals: number[] = [];
	const triFace: number[] = [];
	mesh.faces.forEach((face, faceIndex) => {
		if (face.length < 3 || face.some((index) => mesh.vertices[index] == null)) return;
		const normal = faceNormal(mesh.vertices, face);
		for (let i = 1; i < face.length - 1; i++) {
			const tri = [face[0], face[i], face[i + 1]];
			if (new Set(tri).size < 3) continue;
			for (const index of tri) {
				const vertex = mesh.vertices[index];
				positions.push(vertex[0], vertex[1], vertex[2]);
				normals.push(normal[0], normal[1], normal[2]);
			}
			triFace.push(faceIndex);
		}
	});
	return {
		positions: new Float32Array(positions),
		normals: new Float32Array(normals),
		triFace,
	};
}

export function linePositions(mesh: MeshData): Float32Array {
	const data: number[] = [];
	for (const [a, b] of meshEdges(mesh)) {
		const start = mesh.vertices[a];
		const end = mesh.vertices[b];
		if (!start || !end) continue;
		data.push(start[0], start[1], start[2], end[0], end[1], end[2]);
	}
	return new Float32Array(data);
}

export function facePositions(mesh: MeshData, faceIndices: number[]): Float32Array {
	const positions: number[] = [];
	for (const faceIndex of faceIndices) {
		const face = mesh.faces[faceIndex];
		if (!face || face.length < 3) continue;
		for (let i = 1; i < face.length - 1; i++) {
			const tri = [face[0], face[i], face[i + 1]];
			const verts = tri.map((index) => mesh.vertices[index]);
			if (verts.some((vertex) => vertex == null) || new Set(tri).size < 3) continue;
			for (const vertex of verts) {
				if (!vertex) continue;
				positions.push(vertex[0], vertex[1], vertex[2]);
			}
		}
	}
	return new Float32Array(positions);
}

/** Each undirected edge is used twice. Open surfaces, like a plane, are not closed. */
export function isClosed(mesh: MeshData): boolean {
	if (mesh.faces.length === 0) return false;
	const counts = new Map<string, number>();
	for (const face of mesh.faces) {
		for (let i = 0; i < face.length; i++) {
			const key = edgeKey(face[i], face[(i + 1) % face.length]);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return [...counts.values()].every((count) => count === 2);
}

export function normalsFaceOut(mesh: MeshData): boolean {
	if (mesh.vertices.length === 0 || mesh.faces.length === 0) return false;
	const center = average(mesh.vertices);
	return mesh.faces.every((face) => {
		const normal = faceNormal(mesh.vertices, face);
		const midpoint = average(face.map((index) => mesh.vertices[index]));
		return dot(normal, sub(midpoint, center)) > 0.02;
	});
}
