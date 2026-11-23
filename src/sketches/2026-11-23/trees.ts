import * as THREE from "three";

/** Build shared prototype geometries for richer tree silhouettes. */

export function pineTrunkGeo() {
	const g = new THREE.CylinderGeometry(0.12, 0.22, 1.8, 7);
	g.translate(0, 0.9, 0);
	return g;
}

/** Layered evergreen whorls stacked up the trunk. */
export function pineFoliageGeo() {
	return mergeMeshes([
		coneAt(0, 2.65, 0, 0.72, 1.15, 0),
		coneAt(0.03, 2.15, -0.02, 0.95, 1.1, 0.25),
		coneAt(-0.03, 1.65, 0.03, 1.15, 1.05, -0.2),
		coneAt(0.02, 1.2, 0.01, 1.28, 0.95, 0.1),
	]);
}

type BranchSpec = {
	ax: number;
	ay: number;
	az: number;
	length: number;
	rBase: number;
	rTip: number;
	yaw: number;
	pitch: number;
};

/** Main oak scaffold — stays visible when deciduous leaves drop. */
const OAK_PRIMARIES: BranchSpec[] = [
	{ ax: 0.16, ay: 1.35, az: 0.04, length: 1.05, rBase: 0.1, rTip: 0.042, yaw: 0.2, pitch: 0.48 },
	{ ax: -0.14, ay: 1.48, az: 0.1, length: 0.95, rBase: 0.095, rTip: 0.04, yaw: 2.05, pitch: 0.55 },
	{ ax: 0.06, ay: 1.62, az: -0.16, length: 0.88, rBase: 0.088, rTip: 0.038, yaw: -1.45, pitch: 0.62 },
	{ ax: -0.08, ay: 1.28, az: -0.12, length: 0.82, rBase: 0.082, rTip: 0.035, yaw: 3.4, pitch: 0.42 },
	{ ax: 0.12, ay: 1.78, az: 0.12, length: 0.78, rBase: 0.078, rTip: 0.032, yaw: 1.05, pitch: 0.68 },
	{ ax: -0.1, ay: 1.88, az: -0.06, length: 0.72, rBase: 0.072, rTip: 0.03, yaw: -2.55, pitch: 0.72 },
	{ ax: 0.02, ay: 2.05, az: 0.02, length: 0.55, rBase: 0.06, rTip: 0.025, yaw: 0.55, pitch: 0.95 },
	{ ax: -0.04, ay: 1.15, az: 0.14, length: 0.7, rBase: 0.07, rTip: 0.028, yaw: 1.7, pitch: 0.35 },
];

const BIRCH_PRIMARIES: BranchSpec[] = [
	{ ax: 0.07, ay: 1.55, az: 0.02, length: 0.62, rBase: 0.042, rTip: 0.018, yaw: 0.35, pitch: 0.72 },
	{ ax: -0.06, ay: 1.7, az: 0.05, length: 0.55, rBase: 0.038, rTip: 0.016, yaw: 2.4, pitch: 0.78 },
	{ ax: 0.03, ay: 1.9, az: -0.06, length: 0.5, rBase: 0.035, rTip: 0.015, yaw: -1.2, pitch: 0.82 },
	{ ax: -0.04, ay: 2.1, az: -0.02, length: 0.45, rBase: 0.032, rTip: 0.014, yaw: 3.1, pitch: 0.88 },
	{ ax: 0.05, ay: 2.25, az: 0.04, length: 0.4, rBase: 0.03, rTip: 0.012, yaw: 1.15, pitch: 0.92 },
	{ ax: -0.03, ay: 1.4, az: -0.05, length: 0.48, rBase: 0.034, rTip: 0.014, yaw: -2.3, pitch: 0.65 },
	{ ax: 0.02, ay: 2.4, az: -0.03, length: 0.35, rBase: 0.026, rTip: 0.01, yaw: -0.4, pitch: 1.05 },
];

/** Grow a child limb from a parent's tip. */
function forkFrom(
	parent: BranchSpec,
	yawDelta: number,
	pitchDelta: number,
	lengthScale: number,
	radiusScale = 0.7,
): BranchSpec {
	const tip = tipOf(parent);
	return {
		ax: tip.x,
		ay: tip.y,
		az: tip.z,
		length: parent.length * lengthScale,
		rBase: parent.rTip * radiusScale * 1.35,
		rTip: parent.rTip * radiusScale * 0.55,
		yaw: parent.yaw + yawDelta,
		pitch: Math.min(1.25, Math.max(0.12, parent.pitch + pitchDelta)),
	};
}

/** Mid-span spur — keeps winter silhouette bushy without all tips. */
function spurFrom(
	parent: BranchSpec,
	along: number,
	yawDelta: number,
	pitchDelta: number,
	lengthScale: number,
): BranchSpec {
	const tip = tipOf(parent);
	const ax = parent.ax + (tip.x - parent.ax) * along;
	const ay = parent.ay + (tip.y - parent.ay) * along;
	const az = parent.az + (tip.z - parent.az) * along;
	return {
		ax,
		ay,
		az,
		length: parent.length * lengthScale,
		rBase: parent.rTip * 0.85,
		rTip: parent.rTip * 0.4,
		yaw: parent.yaw + yawDelta,
		pitch: Math.min(1.2, Math.max(0.1, parent.pitch + pitchDelta)),
	};
}

function expandScaffold(primaries: BranchSpec[]): BranchSpec[] {
	const all: BranchSpec[] = [...primaries];
	for (let i = 0; i < primaries.length; i++) {
		const p = primaries[i];
		all.push(forkFrom(p, 0.55 + (i % 3) * 0.15, -0.18, 0.48));
		all.push(forkFrom(p, -0.62 - (i % 2) * 0.12, 0.12, 0.42));
		all.push(spurFrom(p, 0.45, 0.9 + i * 0.2, -0.25, 0.32));
		if (i % 2 === 0) {
			all.push(spurFrom(p, 0.7, -1.05, 0.08, 0.28));
		}
	}
	return all;
}

const OAK_BRANCHES = expandScaffold(OAK_PRIMARIES);
const BIRCH_BRANCHES = expandScaffold(BIRCH_PRIMARIES);

/** Leaf-bearing tips — prefer outer forks so foliage sits at the crown edge. */
function leafTips(branches: BranchSpec[], primaries: BranchSpec[]) {
	const primarySet = new Set(primaries);
	const forks = branches.filter((b) => !primarySet.has(b));
	return forks.length > 0 ? forks : branches;
}

export function oakTrunkGeo() {
	const trunk = new THREE.CylinderGeometry(0.14, 0.24, 2.1, 8);
	trunk.translate(0, 1.05, 0);
	// Leader stub so the winter crown isn't a flat cut.
	const leader = new THREE.CylinderGeometry(0.04, 0.08, 0.55, 5);
	leader.translate(0, 2.25, 0);
	return mergeGeometries([trunk, leader, ...OAK_BRANCHES.map((b) => branchGeo(b))]);
}

/** Leaf clusters sit on outer fork tips + a crown over the leader. */
export function oakCanopyGeo() {
	const tips = leafTips(OAK_BRANCHES, OAK_PRIMARIES).map((b) => tipOf(b));
	return mergeMeshes([
		blobAt(0, 2.7, 0, 0.5),
		...tips.map((t, i) => blobAt(t.x, t.y + 0.05, t.z, 0.34 - (i % 5) * 0.02)),
		...tips
			.filter((_, i) => i % 2 === 0)
			.map((t) => blobAt(t.x * 0.7, t.y + 0.18, t.z * 0.7, 0.26)),
	]);
}

export function birchTrunkGeo() {
	const g = new THREE.CylinderGeometry(0.07, 0.11, 2.6, 6);
	g.translate(0, 1.3, 0);
	const leader = new THREE.CylinderGeometry(0.022, 0.04, 0.45, 5);
	leader.translate(0, 2.75, 0);
	return mergeGeometries([g, leader, ...BIRCH_BRANCHES.map((b) => branchGeo(b))]);
}

export function birchCanopyGeo() {
	const tips = leafTips(BIRCH_BRANCHES, BIRCH_PRIMARIES).map((b) => tipOf(b));
	return mergeMeshes([
		blobAt(0, 2.95, 0, 0.34),
		...tips.map((t, i) => blobAt(t.x, t.y + 0.04, t.z, 0.24 - (i % 4) * 0.015)),
		...tips
			.filter((_, i) => i % 2 === 0)
			.map((t) => blobAt(t.x * 0.55, t.y + 0.12, t.z * 0.55, 0.18)),
	]);
}

/** World-space tip of a branch after the same transforms as branchGeo. */
function tipOf(b: BranchSpec) {
	const { ax, ay, az, length, yaw, pitch } = b;
	const x = length * Math.cos(pitch) * Math.cos(yaw);
	const y = length * Math.sin(pitch);
	const z = -length * Math.cos(pitch) * Math.sin(yaw);
	return { x: ax + x, y: ay + y, z: az + z };
}

/**
 * Cylinder along +Y with base at origin. Oriented outward by yaw,
 * then lifted by pitch (0 = horizontal, π/2 = straight up).
 */
function branchGeo(b: BranchSpec) {
	const { ax, ay, az, length, rBase, rTip, yaw, pitch } = b;
	const g = new THREE.CylinderGeometry(rTip, rBase, length, 5);
	g.translate(0, length / 2, 0);
	g.rotateZ(-(Math.PI / 2 - pitch));
	g.rotateY(yaw);
	g.translate(ax, ay, az);
	return g;
}

function coneAt(x: number, y: number, z: number, r: number, h: number, rot: number) {
	const g = new THREE.ConeGeometry(r, h, 8);
	g.rotateY(rot);
	g.translate(x, y, z);
	return g;
}

function blobAt(x: number, y: number, z: number, r: number) {
	const g = new THREE.IcosahedronGeometry(Math.max(0.12, r), 1);
	g.translate(x, y, z);
	return g;
}

function mergeMeshes(geos: THREE.BufferGeometry[]) {
	return mergeGeometries(geos);
}

function mergeGeometries(geos: THREE.BufferGeometry[]) {
	const meshes = geos.map((g) => new THREE.Mesh(g));
	const merged = mergeMeshGeometries(meshes);
	for (const g of geos) g.dispose();
	return merged;
}

function mergeMeshGeometries(meshes: THREE.Mesh[]) {
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	let offset = 0;
	const _pos = new THREE.Vector3();
	const _nor = new THREE.Vector3();
	const _mat = new THREE.Matrix4();
	const _nmat = new THREE.Matrix3();

	for (const mesh of meshes) {
		mesh.updateMatrix();
		_mat.copy(mesh.matrix);
		_nmat.getNormalMatrix(_mat);
		const g = mesh.geometry;
		const pos = g.attributes.position;
		const nor = g.attributes.normal;
		const uv = g.attributes.uv;
		for (let i = 0; i < pos.count; i++) {
			_pos.fromBufferAttribute(pos, i).applyMatrix4(_mat);
			positions.push(_pos.x, _pos.y, _pos.z);
			if (nor) {
				_nor.fromBufferAttribute(nor, i).applyMatrix3(_nmat).normalize();
				normals.push(_nor.x, _nor.y, _nor.z);
			} else {
				normals.push(0, 1, 0);
			}
			if (uv) uvs.push(uv.getX(i), uv.getY(i));
			else uvs.push(0, 0);
		}
		const idx = g.index;
		if (idx) {
			for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
		} else {
			for (let i = 0; i < pos.count; i++) indices.push(i + offset);
		}
		offset += pos.count;
	}

	const out = new THREE.BufferGeometry();
	out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
	out.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
	out.setIndex(indices);
	out.computeVertexNormals();
	return out;
}
