/** Seeded generative world: eroded heightfield, water, flora, climate. */

export type Season = "spring" | "summer" | "autumn" | "winter";
export type Weather = "clear" | "rain" | "snow" | "fog";

export type TreeKind = "pine" | "oak" | "birch";
export type RockKind = "boulder" | "slab" | "pebble";

export type TreeSite = {
	x: number;
	z: number;
	y: number;
	kind: TreeKind;
	scale: number;
	rot: number;
	variant: number;
};

export type RockSite = {
	x: number;
	z: number;
	y: number;
	kind: RockKind;
	scale: number;
	rot: number;
};

export type WorldConfig = {
	seed: number;
	size: number;
	segments: number;
	waterLevel: number;
};

export type ClimateState = {
	dayPhase: number;
	yearPhase: number;
	season: Season;
	weather: Weather;
	/** 0..1 ground snow pack built by snowfall, melted by warmth/rain. */
	snowCover: number;
	/** 0..1 smoothed fog density / ground mist. */
	fogAmount: number;
	/** 0..1 smoothed sky cloud cover. */
	cloudCover: number;
	/** 0..1 falling rain/snow intensity — eases in/out per spell. */
	precipAmount: number;
	/** Peak intensity this rain/snow spell aims for. */
	precipPeak: number;
	/** Onset / fade rates (higher = snappier), rolled per spell. */
	precipRise: number;
	precipFall: number;
	/** Weather we last rolled a precip profile against. */
	precipSynced: Weather;
};

/** Discrete height + moisture field after noise + thermal erosion. */
export type HeightField = {
	n: number;
	size: number;
	waterLevel: number;
	height: Float32Array;
	moist: Float32Array;
};

export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
export const WEATHERS: Weather[] = ["clear", "rain", "snow", "fog"];

export function mulberry32(seed: number) {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

function fade(t: number) {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

export function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

export function clamp(v: number, a = 0, b = 1) {
	return Math.min(b, Math.max(a, v));
}

export function smoothstep(edge0: number, edge1: number, x: number) {
	const t = clamp((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

/** Value noise with a fixed permutation table from seed. */
export function makeNoise(seed: number) {
	const rand = mulberry32(seed);
	const perm = new Uint8Array(512);
	const p = new Uint8Array(256);
	for (let i = 0; i < 256; i++) p[i] = i;
	for (let i = 255; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		const tmp = p[i];
		p[i] = p[j];
		p[j] = tmp;
	}
	for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

	function grad(hash: number, x: number, y: number) {
		const h = hash & 3;
		const u = h < 2 ? x : y;
		const v = h < 2 ? y : x;
		return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
	}

	function noise2(x: number, y: number) {
		const X = Math.floor(x) & 255;
		const Y = Math.floor(y) & 255;
		const xf = x - Math.floor(x);
		const yf = y - Math.floor(y);
		const u = fade(xf);
		const v = fade(yf);
		const aa = perm[perm[X] + Y];
		const ab = perm[perm[X] + Y + 1];
		const ba = perm[perm[X + 1] + Y];
		const bb = perm[perm[X + 1] + Y + 1];
		const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
		const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
		return lerp(x1, x2, v);
	}

	function fbm(x: number, y: number, octaves = 5, lac = 2, gain = 0.5) {
		let amp = 1;
		let freq = 1;
		let sum = 0;
		let norm = 0;
		for (let i = 0; i < octaves; i++) {
			sum += noise2(x * freq, y * freq) * amp;
			norm += amp;
			amp *= gain;
			freq *= lac;
		}
		return sum / norm;
	}

	/** Ridged multifractal — sharp mountain spines. */
	function ridged(x: number, y: number, octaves = 5, lac = 2.1, gain = 0.5) {
		let amp = 0.5;
		let freq = 1;
		let sum = 0;
		let weight = 1;
		for (let i = 0; i < octaves; i++) {
			let n = 1 - Math.abs(noise2(x * freq, y * freq));
			n *= n * weight;
			sum += n * amp;
			weight = clamp(n * 2);
			amp *= gain;
			freq *= lac;
		}
		return sum;
	}

	/** Domain warp: sample fbm through displaced coordinates. */
	function warped(x: number, y: number, octaves = 5) {
		const wx = fbm(x + 19.1, y + 7.3, 3) * 0.55;
		const wy = fbm(x - 11.4, y + 23.7, 3) * 0.55;
		return fbm(x + wx, y + wy, octaves);
	}

	return { noise2, fbm, ridged, warped, rand };
}

export type Noise = ReturnType<typeof makeNoise>;

export function seasonFromYear(yearPhase: number): Season {
	const t = ((yearPhase % 1) + 1) % 1;
	if (t < 0.25) return "spring";
	if (t < 0.5) return "summer";
	if (t < 0.75) return "autumn";
	return "winter";
}

export function defaultClimate(): ClimateState {
	return {
		dayPhase: 0.32,
		yearPhase: 0.18,
		season: "spring",
		weather: "clear",
		snowCover: 0,
		fogAmount: 0.05,
		cloudCover: 0.12,
		precipAmount: 0,
		precipPeak: 0.55,
		precipRise: 0.25,
		precipFall: 0.3,
		precipSynced: "clear",
	};
}

function approach(current: number, target: number, dt: number, up: number, down: number) {
	const rate = target > current ? up : down;
	const next = current + (target - current) * Math.min(1, dt * rate);
	return clamp(next);
}

/** Targets for fog / clouds. Rain & snow always drag clouds in. */
export function atmosphereTargets(weather: Weather): { fog: number; clouds: number } {
	if (weather === "fog") return { fog: 1, clouds: 0.55 };
	if (weather === "rain") return { fog: 0.55, clouds: 0.95 };
	if (weather === "snow") return { fog: 0.35, clouds: 0.92 };
	return { fog: 0.04, clouds: 0.1 }; // clear
}

export function stepAtmosphere(state: ClimateState, dt: number) {
	const t = atmosphereTargets(state.weather);
	// Fog rises in / burns off slower than weather clicks.
	state.fogAmount = approach(state.fogAmount ?? 0, t.fog, dt, 0.35, 0.55);
	// Clouds thicken ahead of precip feel; clear skies open slower.
	state.cloudCover = approach(state.cloudCover ?? 0, t.clouds, dt, 0.45, 0.3);
}

function isPrecipWeather(w: Weather) {
	return w === "rain" || w === "snow";
}

/** Roll a new storm profile: light/slow vs heavy/fast (and mixes). */
export function rollPrecipProfile(state: ClimateState, rand = Math.random) {
	const peak = 0.22 + rand() * 0.78; // drizzle → downpour / flurry → blizzard
	const burst = rand(); // how aggressive the onset feels
	let rise: number;
	let fall: number;
	if (burst > 0.62) {
		// Comes on hard and can stop fairly quick.
		rise = 0.55 + rand() * 1.05;
		fall = 0.35 + rand() * 0.7;
	} else if (burst > 0.28) {
		// Ordinary front.
		rise = 0.2 + rand() * 0.35;
		fall = 0.18 + rand() * 0.35;
	} else {
		// Slow build, often only a light spell.
		rise = 0.06 + rand() * 0.12;
		fall = 0.08 + rand() * 0.18;
	}
	// Light peaks rarely slam in; heavy peaks can still ease in slowly.
	if (peak < 0.4) rise = Math.min(rise, 0.12 + rand() * 0.14);
	state.precipPeak = peak;
	state.precipRise = rise;
	state.precipFall = fall;
}

/** Ease falling rain/snow in and out — never snap on weather click. */
export function stepPrecipitation(state: ClimateState, dt: number, rand = Math.random) {
	const active = isPrecipWeather(state.weather);
	const was = state.precipSynced;
	if (state.weather !== was) {
		if (active) {
			rollPrecipProfile(state, rand);
			// Leaving fog/clear into precip: keep current amount so it builds from here.
			// Switching rain↔snow: keep intensity, just retarget peak.
		} else if (isPrecipWeather(was)) {
			// Ending a spell — sometimes cuts out fast, sometimes lingers.
			state.precipFall = 0.1 + rand() * 0.65;
			state.precipPeak = 0;
		}
		state.precipSynced = state.weather;
	}

	const target = active ? state.precipPeak : 0;
	const amount = Number.isFinite(state.precipAmount) ? state.precipAmount : 0;
	state.precipAmount = approach(amount, target, dt, state.precipRise || 0.25, state.precipFall || 0.3);
}

/** Seasonal weather odds — used by the auto weather cycle. */
export function weatherWeights(season: Season): Record<Weather, number> {
	if (season === "winter") return { clear: 0.32, rain: 0.06, snow: 0.48, fog: 0.14 };
	// Dry season: almost no fog, only rare showers. No snow.
	if (season === "summer") return { clear: 0.86, rain: 0.1, snow: 0, fog: 0.04 };
	// Wet / misty season — late autumn can still flake.
	if (season === "autumn") return { clear: 0.28, rain: 0.4, snow: 0.08, fog: 0.24 };
	// Mild spring: fair, lighter rain, no snow.
	return { clear: 0.66, rain: 0.24, snow: 0, fog: 0.1 };
}

export function pickSeasonalWeather(
	season: Season,
	rand = Math.random(),
	avoid?: Weather,
): Weather {
	const w = weatherWeights(season);
	const keys = WEATHERS.filter((k) => w[k] > 0 && k !== avoid);
	const pool = keys.length > 0 ? keys : WEATHERS.filter((k) => w[k] > 0);
	if (pool.length === 0) return "clear";
	let sum = 0;
	for (const key of pool) sum += w[key];
	let t = rand * sum;
	for (const key of pool) {
		t -= w[key];
		if (t <= 0) return key;
	}
	return pool[pool.length - 1]!;
}

/** True when this weather can occur in the season (weight > 0). */
export function weatherAllowed(season: Season, weather: Weather) {
	return weatherWeights(season)[weather] > 0;
}

/** Accumulate pack while snowing; melt in rain / warm clear spells. Scales with eased precip. */
export function stepSnowCover(
	cover: number,
	weather: Weather,
	season: Season,
	dt: number,
	precipAmount = 0,
): number {
	let next = Number.isFinite(cover) ? cover : 0;
	const p = clamp(Number.isFinite(precipAmount) ? precipAmount : 0);
	if (weather === "snow" && p > 0.02) {
		const rate = season === "winter" ? 0.12 : season === "autumn" ? 0.08 : 0.06;
		next += dt * rate * p;
	} else if (weather === "rain" && p > 0.02) {
		next -= dt * (season === "winter" ? 0.05 : 0.18) * p;
	} else if (weather === "fog") {
		next -= dt * (season === "winter" ? 0.01 : 0.04);
	} else if (p <= 0.05) {
		const melt =
			season === "summer" ? 0.14 : season === "spring" ? 0.09 : season === "autumn" ? 0.05 : 0.02;
		next -= dt * melt;
	}
	return clamp(next);
}

export function riverMask(noise: Noise, x: number, z: number, size: number) {
	const nx = x / size;
	const nz = z / size;
	const meander = noise.fbm(nx * 1.4 + 3.1, nz * 0.35 + 1.7, 3) * size * 0.22;
	const dist = Math.abs(x - meander);
	const width = 2.2 + noise.fbm(nx * 2.2, nz * 2.2 + 9, 2) * 1.5;
	const bank = Math.max(0, 1 - dist / width);

	// Tributary gullies: ridges of noise that deepen near the main channel.
	const gully = noise.ridged(nx * 3.2 + 4, nz * 3.2 - 2, 3);
	const feed = smoothstep(0.55, 0.85, gully) * smoothstep(14, 3, dist) * 0.55;

	return clamp(bank * bank + feed);
}

export function lakeMask(noise: Noise, x: number, z: number, size: number) {
	const nx = x / size;
	const nz = z / size;
	const a = noise.fbm(nx * 1.1 + 12, nz * 1.1 - 4, 4);
	const b = noise.fbm(nx * 2.4 - 7, nz * 2.1 + 5, 3);
	const basin = a * 0.7 + b * 0.3;
	const radial = 1 - Math.hypot(nx * 1.15, nz * 1.05);
	return basin > 0.26 && radial > 0.12 ? (basin - 0.26) * 2.4 : 0;
}

export function rawHeight(noise: Noise, x: number, z: number, size: number) {
	const nx = x / size;
	const nz = z / size;

	// Domain-warped continents + ridged massifs (Vault80 / Inria style hybrid).
	const continent = noise.warped(nx * 0.85 + 2, nz * 0.85 - 1, 5);
	const mountains = noise.ridged(nx * 1.8 + 5, nz * 1.8 - 3, 5);
	const foothills = noise.fbm(nx * 2.4, nz * 2.4 + 8, 4);
	const detail = noise.fbm(nx * 7.5 + 1, nz * 7.5 - 3, 3);

	let h =
		continent * 7.2 +
		mountains * mountains * 9.5 +
		foothills * 2.4 +
		detail * 0.55;

	// Soft valley bias along the river corridor before carving.
	const river = riverMask(noise, x, z, size);
	h = lerp(h, Math.min(h, 2.8), river * 0.65);

	const edge = Math.max(Math.abs(nx), Math.abs(nz));
	const rim = Math.pow(Math.max(0, edge - 0.72) / 0.28, 1.6) * 5.5;
	return h + rim;
}

function idx(n: number, ix: number, iz: number) {
	return ix + iz * n;
}

function worldXZ(n: number, size: number, ix: number, iz: number) {
	const cell = (size * 2) / (n - 1);
	return {
		x: -size + ix * cell,
		z: -size + iz * cell,
	};
}

/** Musgrave-style thermal weathering: collapse slopes past a talus angle. */
function thermalErode(height: Float32Array, n: number, cell: number, iterations: number) {
	const talus = Math.tan((38 * Math.PI) / 180) * cell;
	const next = new Float32Array(height);
	for (let iter = 0; iter < iterations; iter++) {
		next.set(height);
		for (let iz = 1; iz < n - 1; iz++) {
			for (let ix = 1; ix < n - 1; ix++) {
				const i = idx(n, ix, iz);
				const h = height[i];
				let maxDiff = 0;
				let tix = ix;
				let tiz = iz;
				for (let dz = -1; dz <= 1; dz++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dx === 0 && dz === 0) continue;
						const j = idx(n, ix + dx, iz + dz);
						const diff = h - height[j];
						if (diff > maxDiff) {
							maxDiff = diff;
							tix = ix + dx;
							tiz = iz + dz;
						}
					}
				}
				if (maxDiff > talus) {
					const move = (maxDiff - talus) * 0.5;
					next[i] -= move;
					next[idx(n, tix, tiz)] += move;
				}
			}
		}
		height.set(next);
	}
}

/** Lightweight hydraulic scratches along steep flow (Sebastian Lague–inspired). */
function hydraulicScratch(
	height: Float32Array,
	n: number,
	cell: number,
	noise: Noise,
	drops: number,
) {
	const rand = mulberry32((noise.rand() * 1e9) | 0);
	for (let d = 0; d < drops; d++) {
		let ix = 1 + Math.floor(rand() * (n - 2));
		let iz = 1 + Math.floor(rand() * (n - 2));
		let sediment = 0;
		for (let step = 0; step < 28; step++) {
			const i = idx(n, ix, iz);
			let best = 0;
			let bx = 0;
			let bz = 0;
			for (let dz = -1; dz <= 1; dz++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dz === 0) continue;
					const nh = ix + dx;
					const nz = iz + dz;
					if (nh < 1 || nz < 1 || nh >= n - 1 || nz >= n - 1) continue;
					const diff = height[i] - height[idx(n, nh, nz)];
					if (diff > best) {
						best = diff;
						bx = dx;
						bz = dz;
					}
				}
			}
			if (best <= 0.0001) {
				height[i] += sediment * 0.4;
				break;
			}
			const slope = best / cell;
			const erode = clamp((slope - 0.35) / 1.2) * 0.045;
			const take = Math.min(erode, best * 0.35);
			height[i] -= take;
			sediment += take;
			const capacity = slope * 0.12;
			if (sediment > capacity) {
				const dep = (sediment - capacity) * 0.35;
				height[i] += dep;
				sediment -= dep;
			}
			ix += bx;
			iz += bz;
		}
	}
}

export function buildHeightField(noise: Noise, config: WorldConfig): HeightField {
	const n = config.segments + 1;
	const size = config.size;
	const waterLevel = config.waterLevel;
	const cell = (size * 2) / (n - 1);
	const height = new Float32Array(n * n);
	const moist = new Float32Array(n * n);

	for (let iz = 0; iz < n; iz++) {
		for (let ix = 0; ix < n; ix++) {
			const { x, z } = worldXZ(n, size, ix, iz);
			let h = rawHeight(noise, x, z, size);
			const river = riverMask(noise, x, z, size);
			const lake = lakeMask(noise, x, z, size);
			h -= river * 3.4;
			if (lake > 0) h = Math.min(h, waterLevel - 0.35 - lake * 1.8);
			if (river > 0.55) h = Math.min(h, waterLevel - 0.5);
			height[idx(n, ix, iz)] = h;
			moist[idx(n, ix, iz)] = clamp(river * 0.85 + lake * 0.7 + (h < waterLevel + 1.2 ? 0.35 : 0));
		}
	}

	thermalErode(height, n, cell, 18);
	hydraulicScratch(height, n, cell, noise, 2200);

	// Re-assert water basins after erosion so lakes/rivers stay wet.
	for (let iz = 0; iz < n; iz++) {
		for (let ix = 0; ix < n; ix++) {
			const { x, z } = worldXZ(n, size, ix, iz);
			const i = idx(n, ix, iz);
			const river = riverMask(noise, x, z, size);
			const lake = lakeMask(noise, x, z, size);
			if (lake > 0.05) height[i] = Math.min(height[i], waterLevel - 0.4 - lake * 1.2);
			if (river > 0.6) height[i] = Math.min(height[i], waterLevel - 0.45);
			moist[i] = clamp(
				moist[i] * 0.5 + river * 0.7 + lake * 0.55 + (height[i] < waterLevel + 0.9 ? 0.4 : 0),
			);
		}
	}

	return { n, size, waterLevel, height, moist };
}

export function sampleField(field: Float32Array, n: number, size: number, x: number, z: number) {
	const cell = (size * 2) / (n - 1);
	const fx = (x + size) / cell;
	const fz = (z + size) / cell;
	const x0 = clamp(Math.floor(fx), 0, n - 2);
	const z0 = clamp(Math.floor(fz), 0, n - 2);
	const tx = clamp(fx - x0);
	const tz = clamp(fz - z0);
	const h00 = field[idx(n, x0, z0)];
	const h10 = field[idx(n, x0 + 1, z0)];
	const h01 = field[idx(n, x0, z0 + 1)];
	const h11 = field[idx(n, x0 + 1, z0 + 1)];
	return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

export function terrainHeight(hf: HeightField, x: number, z: number) {
	return sampleField(hf.height, hf.n, hf.size, x, z);
}

export function moistureAt(hf: HeightField, x: number, z: number) {
	return sampleField(hf.moist, hf.n, hf.size, x, z);
}

export function slopeAt(hf: HeightField, x: number, z: number) {
	const e = 0.55;
	const h = terrainHeight(hf, x, z);
	const dx = terrainHeight(hf, x + e, z) - h;
	const dz = terrainHeight(hf, x, z + e) - h;
	return Math.hypot(dx, dz) / e;
}

export type GroundColor = { r: number; g: number; b: number };

/** CPU fallback tint — shader does the rich splat at runtime. */
export function groundColor(
	hf: HeightField,
	noise: Noise,
	x: number,
	z: number,
	y: number,
	season: Season,
): GroundColor {
	const slope = slopeAt(hf, x, z);
	const moist = moistureAt(hf, x, z);
	const mottled = 0.88 + noise.noise2(x * 0.07, z * 0.07) * 0.12;

	let r = 0.33;
	let g = 0.47;
	let b = 0.27;
	if (season === "autumn") {
		r = 0.44;
		g = 0.38;
		b = 0.2;
	} else if (season === "winter") {
		r = 0.7;
		g = 0.74;
		b = 0.78;
	}

	const rock = smoothstep(0.45, 1.1, slope);
	r = lerp(r, 0.45, rock);
	g = lerp(g, 0.42, rock);
	b = lerp(b, 0.4, rock);

	const sand = smoothstep(hf.waterLevel - 0.2, hf.waterLevel + 1.4, y) *
		(1 - smoothstep(hf.waterLevel + 1.4, hf.waterLevel + 3.2, y)) *
		(1 - rock);
	r = lerp(r, 0.72, sand * 0.7);
	g = lerp(g, 0.62, sand * 0.7);
	b = lerp(b, 0.42, sand * 0.7);

	r = lerp(r, 0.28, moist * 0.45);
	g = lerp(g, 0.34, moist * 0.45);
	b = lerp(b, 0.26, moist * 0.45);

	// CPU tint only keeps alpine hint; live snow pack is driven in the terrain shader.
	const snowLine = season === "winter" ? 6.5 : season === "autumn" ? 8.5 : 10;
	const alpine = smoothstep(snowLine, snowLine + 4, y) * (1 - rock * 0.4) * 0.35;
	r = lerp(r, 0.9, alpine);
	g = lerp(g, 0.92, alpine);
	b = lerp(b, 0.95, alpine);

	return { r: r * mottled, g: g * mottled, b: b * mottled };
}

export function leafColor(kind: TreeKind, season: Season): GroundColor {
	if (kind === "pine") {
		if (season === "winter") return { r: 0.22, g: 0.4, b: 0.28 };
		if (season === "autumn") return { r: 0.28, g: 0.46, b: 0.3 };
		return { r: 0.26, g: 0.52, b: 0.32 };
	}
	if (kind === "birch") {
		if (season === "winter") return { r: 0.78, g: 0.82, b: 0.86 };
		if (season === "autumn") return { r: 0.92, g: 0.68, b: 0.22 };
		if (season === "spring") return { r: 0.62, g: 0.8, b: 0.36 };
		return { r: 0.52, g: 0.7, b: 0.32 };
	}
	if (season === "winter") return { r: 0.5, g: 0.42, b: 0.32 };
	if (season === "autumn") return { r: 0.88, g: 0.4, b: 0.14 };
	if (season === "spring") return { r: 0.42, g: 0.68, b: 0.32 };
	return { r: 0.32, g: 0.58, b: 0.26 };
}

export function barkColor(kind: TreeKind): GroundColor {
	if (kind === "birch") return { r: 0.9, g: 0.88, b: 0.82 };
	if (kind === "pine") return { r: 0.52, g: 0.36, b: 0.22 };
	return { r: 0.55, g: 0.38, b: 0.22 };
}

export function placeTrees(hf: HeightField, noise: Noise, count: number): TreeSite[] {
	const sites: TreeSite[] = [];
	const rand = mulberry32((noise.rand() * 1e9) | 0);
	let attempts = 0;
	while (sites.length < count && attempts < count * 14) {
		attempts++;
		const x = (rand() * 2 - 1) * hf.size * 0.9;
		const z = (rand() * 2 - 1) * hf.size * 0.9;
		const y = terrainHeight(hf, x, z);
		if (y < hf.waterLevel + 0.4) continue;
		if (moistureAt(hf, x, z) > 0.55) continue;
		const slope = slopeAt(hf, x, z);
		if (slope > 0.8) continue;
		const n = noise.fbm(x * 0.05 + 40, z * 0.05 - 11, 3);
		if (n < -0.08) continue;
		let kind: TreeKind = "oak";
		if (y > 6.5 || n > 0.38) kind = "pine";
		else if (n < 0.1 && y < 4.2) kind = "birch";
		sites.push({
			x,
			z,
			y,
			kind,
			scale: 0.65 + rand() * 0.85,
			rot: rand() * Math.PI * 2,
			variant: rand(),
		});
	}
	return sites;
}

export function placeRocks(hf: HeightField, noise: Noise, count: number): RockSite[] {
	const sites: RockSite[] = [];
	const rand = mulberry32((noise.rand() * 1e9) | 0);
	let attempts = 0;
	while (sites.length < count && attempts < count * 14) {
		attempts++;
		const x = (rand() * 2 - 1) * hf.size * 0.88;
		const z = (rand() * 2 - 1) * hf.size * 0.88;
		const y = terrainHeight(hf, x, z);
		if (y < hf.waterLevel - 0.05) continue;
		const slope = slopeAt(hf, x, z);
		const n = noise.fbm(x * 0.07 - 3, z * 0.07 + 19, 2);
		if (slope < 0.32 && n < 0.22) continue;
		const roll = rand();
		const kind: RockKind = roll < 0.45 ? "boulder" : roll < 0.75 ? "slab" : "pebble";
		sites.push({
			x,
			z,
			y,
			kind,
			scale: kind === "pebble" ? 0.35 + rand() * 0.4 : 0.55 + rand() * 0.95,
			rot: rand() * Math.PI * 2,
		});
	}
	return sites;
}

export type SkyPalette = {
	zenith: string;
	horizon: string;
	fog: string;
	sun: string;
	ambient: number;
	sunIntensity: number;
	moonIntensity: number;
};

export function skyForDay(dayPhase: number, season: Season, weather: Weather): SkyPalette {
	const angle = dayPhase * Math.PI * 2;
	const elev = Math.sin(angle - Math.PI / 2);
	const day = Math.max(0, elev);
	const dusk = Math.max(0, 1 - Math.abs(elev) * 3) * (elev > -0.15 ? 1 : 0.4);

	let zenith = lerpColor("#0a1020", "#4a7ab8", day);
	let horizon = lerpColor("#12182a", "#a8c8e8", day);
	if (dusk > 0.05) {
		zenith = lerpHex(zenith, "#2a2048", dusk * 0.7);
		horizon = lerpHex(horizon, "#e87840", dusk);
	}

	if (season === "winter") {
		zenith = lerpHex(zenith, "#c8d4e0", 0.15 * day);
		horizon = lerpHex(horizon, "#e8eef4", 0.2 * day);
	} else if (season === "autumn") {
		horizon = lerpHex(horizon, "#d4a070", 0.18 * day);
	}

	if (weather === "fog") {
		zenith = lerpHex(zenith, "#9aa8b4", 0.55);
		horizon = lerpHex(horizon, "#b8c4cc", 0.7);
	} else if (weather === "rain") {
		zenith = lerpHex(zenith, "#3a4558", 0.45);
		horizon = lerpHex(horizon, "#5a6578", 0.5);
	} else if (weather === "snow") {
		zenith = lerpHex(zenith, "#8a96a8", 0.4);
		horizon = lerpHex(horizon, "#c8d0dc", 0.45);
	}

	const ambient = 0.12 + day * 0.45 + (weather === "fog" ? 0.12 : 0);
	const sunIntensity = Math.max(0.05, day * (weather === "clear" ? 1.35 : 0.55));
	const moonIntensity = Math.max(0.08, (1 - day) * 0.35);

	return {
		zenith,
		horizon,
		fog: horizon,
		sun: dusk > 0.2 ? "#ffb070" : "#fff4d8",
		ambient,
		sunIntensity,
		moonIntensity,
	};
}

function lerpColor(a: string, b: string, t: number) {
	return lerpHex(a, b, Math.min(1, Math.max(0, t)));
}

function lerpHex(a: string, b: string, t: number) {
	const ca = hexToRgb(a);
	const cb = hexToRgb(b);
	const r = Math.round(lerp(ca.r, cb.r, t));
	const g = Math.round(lerp(ca.g, cb.g, t));
	const bl = Math.round(lerp(ca.b, cb.b, t));
	return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function hexToRgb(hex: string) {
	const n = parseInt(hex.slice(1), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function sunDirection(dayPhase: number): [number, number, number] {
	const angle = dayPhase * Math.PI * 2;
	const elev = Math.sin(angle - Math.PI / 2);
	const az = Math.cos(angle - Math.PI / 2);
	return [az * 0.85, Math.max(-0.15, elev), 0.35];
}

export function buildWorld(seed: number): {
	config: WorldConfig;
	noise: Noise;
	heightField: HeightField;
	trees: TreeSite[];
	rocks: RockSite[];
} {
	const config: WorldConfig = {
		seed,
		size: 48,
		segments: 128,
		waterLevel: 1.15,
	};
	const noise = makeNoise(seed);
	const heightField = buildHeightField(noise, config);
	const trees = placeTrees(heightField, noise, 240);
	const rocks = placeRocks(heightField, noise, 110);
	return { config, noise, heightField, trees, rocks };
}
