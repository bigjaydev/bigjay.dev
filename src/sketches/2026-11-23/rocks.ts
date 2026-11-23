import * as THREE from "three";

/** Chunky rock prototype meshes (surface shading is world-space in the material). */

function hash2(x: number, y: number) {
	const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
	return s - Math.floor(s);
}

function valueNoise(x: number, y: number) {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const fx = x - x0;
	const fy = y - y0;
	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);
	const a = hash2(x0, y0);
	const b = hash2(x0 + 1, y0);
	const c = hash2(x0, y0 + 1);
	const d = hash2(x0 + 1, y0 + 1);
	return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 5) {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	for (let i = 0; i < octaves; i++) {
		sum += valueNoise(x * freq, y * freq) * amp;
		amp *= 0.5;
		freq *= 2.05;
	}
	return sum;
}

function displaceSphere(radius: number, detail: number, amp: number, seed: number) {
	const g = new THREE.IcosahedronGeometry(radius, detail);
	const pos = g.attributes.position as THREE.BufferAttribute;
	const v = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i);
		const n = fbm(v.x * 2.4 + seed, v.z * 2.4 - seed, 4);
		const m = fbm(v.y * 3.1 - seed, v.x * 3.1 + seed * 0.5, 3);
		const d = 1 + (n - 0.45) * amp + (m - 0.5) * amp * 0.45;
		v.multiplyScalar(d);
		if (v.y < -radius * 0.35) v.y *= 0.72;
		pos.setXYZ(i, v.x, v.y, v.z);
	}
	g.computeVertexNormals();
	return g;
}

export function boulderGeo() {
	return displaceSphere(0.62, 2, 0.38, 1.7);
}

export function slabGeo() {
	const g = new THREE.BoxGeometry(1.35, 0.38, 1.05, 5, 2, 4);
	const pos = g.attributes.position as THREE.BufferAttribute;
	const v = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i);
		const n = fbm(v.x * 2.2 + 4, v.z * 2.2 - 2, 3);
		v.x *= 1 + (n - 0.5) * 0.12;
		v.z *= 1 + (n - 0.5) * 0.1;
		v.y += (n - 0.5) * 0.08;
		const edge = Math.max(Math.abs(v.x) / 0.7, Math.abs(v.z) / 0.55);
		if (edge > 0.85) v.y *= 0.7 + hash2(v.x * 10, v.z * 10) * 0.35;
		pos.setXYZ(i, v.x, v.y, v.z);
	}
	g.computeVertexNormals();
	return g;
}

export function pebbleGeo() {
	return displaceSphere(0.42, 1, 0.28, 5.3);
}
