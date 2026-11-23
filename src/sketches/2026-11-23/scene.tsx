import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { CameraRig, type ViewMode } from "./controls";
import {
	type ClimateState,
	type HeightField,
	type Noise,
	type RockSite,
	type Season,
	type TreeSite,
	type WorldConfig,
	barkColor,
	groundColor,
	leafColor,
	riverMask,
	skyForDay,
	sunDirection,
	terrainHeight,
} from "./sim";
import { boulderGeo, pebbleGeo, slabGeo } from "./rocks";
import {
	birchCanopyGeo,
	birchTrunkGeo,
	oakCanopyGeo,
	oakTrunkGeo,
	pineFoliageGeo,
	pineTrunkGeo,
} from "./trees";

const dummy = new THREE.Object3D();
const _color = new THREE.Color();

type SceneProps = {
	config: WorldConfig;
	noise: Noise;
	heightField: HeightField;
	trees: TreeSite[];
	rocks: RockSite[];
	season: Season;
	climateRef: MutableRefObject<ClimateState>;
	viewMode: ViewMode;
	viewModeRef: MutableRefObject<ViewMode>;
};

export function WorldScene({
	config,
	noise,
	heightField,
	trees,
	rocks,
	season,
	climateRef,
	viewMode,
	viewModeRef,
}: SceneProps) {
	return (
		<>
			<SkyDome climateRef={climateRef} />
			<Celestials climateRef={climateRef} />
			<Lights climateRef={climateRef} />
			<TerrainMesh
				config={config}
				noise={noise}
				heightField={heightField}
				season={season}
				climateRef={climateRef}
			/>
			<WaterMesh config={config} noise={noise} heightField={heightField} climateRef={climateRef} />
			<TreeField trees={trees} season={season} />
			<RockField rocks={rocks} />
			<WeatherField climateRef={climateRef} size={config.size} />
			<CameraRig mode={viewMode} modeRef={viewModeRef} heightField={heightField} />
		</>
	);
}

function Lights({ climateRef }: { climateRef: MutableRefObject<ClimateState> }) {
	const sun = useRef<THREE.DirectionalLight>(null);
	const moon = useRef<THREE.DirectionalLight>(null);
	const ambient = useRef<THREE.AmbientLight>(null);
	const hemi = useRef<THREE.HemisphereLight>(null);

	useFrame(() => {
		const c = climateRef.current;
		const sky = skyForDay(c.dayPhase, c.season, c.weather);
		const [sx, sy, sz] = sunDirection(c.dayPhase);
		if (sun.current) {
			sun.current.position.set(sx * 80, sy * 80, sz * 80);
			sun.current.intensity = sky.sunIntensity;
			sun.current.color.set(sky.sun);
		}
		if (moon.current) {
			moon.current.position.set(-sx * 70, Math.max(6, -sy * 55), -sz * 55);
			moon.current.intensity = sky.moonIntensity;
		}
		if (ambient.current) ambient.current.intensity = sky.ambient * 0.55;
		if (hemi.current) {
			hemi.current.intensity = sky.ambient * 0.7;
			hemi.current.color.set(sky.zenith);
			hemi.current.groundColor.set(sky.horizon);
		}
	});

	return (
		<>
			<ambientLight ref={ambient} intensity={0.3} />
			<hemisphereLight ref={hemi} args={["#88aacc", "#3a5030", 0.4]} />
			<directionalLight
				ref={sun}
				castShadow
				shadow-mapSize={[1024, 1024]}
				shadow-camera-far={120}
				shadow-camera-left={-55}
				shadow-camera-right={55}
				shadow-camera-top={55}
				shadow-camera-bottom={-55}
			/>
			<directionalLight ref={moon} color="#a8b8e0" intensity={0.15} />
		</>
	);
}

type CloudPuff = {
	base: [number, number, number];
	speed: number;
	lobes: { offset: [number, number, number]; scale: [number, number, number] }[];
};

function Celestials({ climateRef }: { climateRef: MutableRefObject<ClimateState> }) {
	const sun = useRef<THREE.Mesh>(null);
	const sunGlow = useRef<THREE.Mesh>(null);
	const moon = useRef<THREE.Mesh>(null);
	const moonGlow = useRef<THREE.Mesh>(null);
	const stars = useRef<THREE.Points>(null);
	const clouds = useRef<THREE.Group>(null);
	const groundFog = useRef<THREE.Mesh>(null);

	const groundFogMat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide,
				fog: false,
				uniforms: {
					uColor: { value: new THREE.Color("#c8d4de") },
					uOpacity: { value: 0 },
				},
				vertexShader: /* glsl */ `
					varying float vH;
					varying vec2 vXZ;
					void main() {
						// Cylinder unit height → y in [-0.5, 0.5]; xz on unit radius.
						vH = position.y + 0.5;
						vXZ = position.xz;
						gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
					}
				`,
				fragmentShader: /* glsl */ `
					uniform vec3 uColor;
					uniform float uOpacity;
					varying float vH;
					varying vec2 vXZ;
					void main() {
						float h = clamp(vH, 0.0, 1.0);
						// Dense near the ground, fades out toward the top of the bank.
						float vertical = pow(1.0 - h, 1.75);
						float radial = 1.0 - smoothstep(0.62, 1.0, length(vXZ));
						float a = uOpacity * vertical * radial;
						if (a < 0.004) discard;
						gl_FragColor = vec4(uColor, a);
					}
				`,
			}),
		[],
	);

	useEffect(() => () => groundFogMat.dispose(), [groundFogMat]);

	const starGeo = useMemo(() => {
		const count = 900;
		const pos = new Float32Array(count * 3);
		const rand = (i: number) => {
			const x = Math.sin(i * 127.1) * 43758.5453;
			return x - Math.floor(x);
		};
		for (let i = 0; i < count; i++) {
			const u = rand(i);
			const v = rand(i + 17);
			const theta = u * Math.PI * 2;
			const phi = Math.acos(2 * v - 1);
			const r = 140;
			const y = Math.abs(Math.cos(phi)) * r * 0.92 + 8;
			const xz = Math.sin(phi) * r;
			pos[i * 3] = Math.cos(theta) * xz;
			pos[i * 3 + 1] = y;
			pos[i * 3 + 2] = Math.sin(theta) * xz;
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		return g;
	}, []);

	const cloudPuffs = useMemo(() => {
		const items: CloudPuff[] = [];
		for (let i = 0; i < 18; i++) {
			const a = (i / 18) * Math.PI * 2 + (i % 3) * 0.35;
			const r = 42 + (i % 5) * 8;
			const lobes = [
				{ offset: [0, 0, 0] as [number, number, number], scale: [5.5, 1.6, 3.2] as [number, number, number] },
				{ offset: [2.8, 0.2, 0.6] as [number, number, number], scale: [3.8, 1.4, 2.6] as [number, number, number] },
				{ offset: [-2.4, 0.15, -0.8] as [number, number, number], scale: [3.4, 1.3, 2.4] as [number, number, number] },
				{ offset: [0.6, 0.55, -1.6] as [number, number, number], scale: [3.0, 1.5, 2.8] as [number, number, number] },
				{ offset: [-0.8, 0.35, 1.8] as [number, number, number], scale: [2.6, 1.2, 2.2] as [number, number, number] },
			];
			items.push({
				base: [Math.cos(a) * r, 26 + (i % 4) * 2.8, Math.sin(a) * r],
				speed: 0.012 + (i % 5) * 0.005,
				lobes,
			});
		}
		return items;
	}, []);

	useEffect(() => () => starGeo.dispose(), [starGeo]);

	useFrame(({ clock, camera }) => {
		const c = climateRef.current;
		const sky = skyForDay(c.dayPhase, c.season, c.weather);
		const [sx, sy, sz] = sunDirection(c.dayPhase);
		const dist = 90;
		const origin = camera.position;
		const sunDir = new THREE.Vector3(sx, sy, sz).normalize();
		const moonDir = new THREE.Vector3(-sx, -sy, -sz).normalize();
		if (moonDir.y < 0.05) moonDir.y = 0.05;
		moonDir.normalize();
		const sunPos = origin.clone().addScaledVector(sunDir, dist);
		const moonPos = origin.clone().addScaledVector(moonDir, dist);
		const cover = Number.isFinite(c.cloudCover) ? c.cloudCover : 0;
		const fogAmt = Number.isFinite(c.fogAmount) ? c.fogAmount : 0;
		const stormy = c.weather === "rain" || c.weather === "snow";

		if (sun.current) {
			sun.current.position.copy(sunPos);
			sun.current.visible = sy > -0.12 && cover < 0.85;
			sun.current.frustumCulled = false;
			(sun.current.material as THREE.MeshBasicMaterial).color.set(sky.sun);
		}
		if (sunGlow.current) {
			sunGlow.current.position.copy(sunPos);
			sunGlow.current.visible = sy > -0.08 && cover < 0.85;
			sunGlow.current.frustumCulled = false;
			const mat = sunGlow.current.material as THREE.MeshBasicMaterial;
			mat.opacity = Math.min(0.55, 0.15 + sky.sunIntensity * 0.25) * (1 - cover * 0.7);
			sunGlow.current.scale.setScalar(1.2 + sky.sunIntensity * 0.4);
		}
		if (moon.current) {
			moon.current.position.copy(moonPos);
			moon.current.visible = sy < 0.4 && cover < 0.9;
			moon.current.frustumCulled = false;
		}
		if (moonGlow.current) {
			moonGlow.current.position.copy(moonPos);
			moonGlow.current.visible = sy < 0.4 && cover < 0.9;
			moonGlow.current.frustumCulled = false;
			(moonGlow.current.material as THREE.MeshBasicMaterial).opacity =
				(0.12 + sky.moonIntensity * 0.45) * (1 - cover * 0.6);
		}
		if (stars.current) {
			const night = Math.max(0, 1 - Math.max(0, sy) * 2.2) * (1 - cover * 0.85);
			stars.current.visible = night > 0.05;
			stars.current.frustumCulled = false;
			stars.current.position.copy(origin);
			(stars.current.material as THREE.PointsMaterial).opacity = night * 0.95;
			stars.current.rotation.y = clock.elapsedTime * 0.002;
		}

		if (clouds.current) {
			clouds.current.visible = cover > 0.04;
			clouds.current.position.set(origin.x, 0, origin.z);
			const cloudColor = stormy
				? new THREE.Color("#6a7484")
				: c.weather === "fog"
					? new THREE.Color("#c8d0d8")
					: c.season === "winter"
						? new THREE.Color("#eef2f6")
						: new THREE.Color("#f2f5f8");
			let lobeIndex = 0;
			for (let i = 0; i < cloudPuffs.length; i++) {
				const puff = cloudPuffs[i];
				const ang = clock.elapsedTime * puff.speed;
				const cx = puff.base[0] * Math.cos(ang) - puff.base[2] * Math.sin(ang * 0.65);
				const cz = puff.base[0] * Math.sin(ang * 0.65) + puff.base[2] * Math.cos(ang);
				const cy = puff.base[1] + Math.sin(clock.elapsedTime * 0.18 + i) * 0.5;
				// Rank clouds: only show more as cover rises.
				const rank = (i + 0.5) / cloudPuffs.length;
				const local = Math.max(0, Math.min(1, (cover - rank * 0.35) / 0.65));
				for (let L = 0; L < puff.lobes.length; L++) {
					const mesh = clouds.current.children[lobeIndex] as THREE.Mesh | undefined;
					lobeIndex++;
					if (!mesh) continue;
					const lobe = puff.lobes[L];
					mesh.visible = local > 0.02;
					mesh.position.set(cx + lobe.offset[0], cy + lobe.offset[1], cz + lobe.offset[2]);
					const grow = 0.75 + local * 0.45;
					mesh.scale.set(lobe.scale[0] * grow, lobe.scale[1] * grow, lobe.scale[2] * grow);
					mesh.frustumCulled = false;
					const mat = mesh.material as THREE.MeshBasicMaterial;
					mat.color.copy(cloudColor);
					mat.opacity = local * (stormy ? 0.62 : 0.42) * (0.75 + (L % 3) * 0.08);
				}
			}
		}

		if (groundFog.current) {
			const show = fogAmt > 0.03;
			groundFog.current.visible = show;
			const bankH = 2.2 + fogAmt * 10;
			// Sit the bank on the ground; height grows with fogAmount.
			groundFog.current.position.set(origin.x, bankH * 0.5, origin.z);
			groundFog.current.scale.set(72, bankH, 72);
			groundFog.current.frustumCulled = false;
			groundFogMat.uniforms.uOpacity.value = Math.min(0.72, fogAmt * 0.78);
			(groundFogMat.uniforms.uColor.value as THREE.Color).set(sky.fog);
		}
	});

	const cloudLobes = useMemo(() => {
		const nodes: { key: string }[] = [];
		cloudPuffs.forEach((p, i) => {
			p.lobes.forEach((_, L) => nodes.push({ key: `${i}-${L}` }));
		});
		return nodes;
	}, [cloudPuffs]);

	return (
		<>
			<mesh ref={sun}>
				<sphereGeometry args={[4.5, 24, 16]} />
				<meshBasicMaterial color="#fff2c8" toneMapped={false} fog={false} depthWrite={false} />
			</mesh>
			<mesh ref={sunGlow} scale={2.4}>
				<sphereGeometry args={[4.5, 16, 12]} />
				<meshBasicMaterial
					color="#ffd090"
					transparent
					opacity={0.35}
					depthWrite={false}
					toneMapped={false}
					fog={false}
				/>
			</mesh>
			<mesh ref={moon}>
				<sphereGeometry args={[3.2, 20, 14]} />
				<meshBasicMaterial color="#dfe6f0" toneMapped={false} fog={false} depthWrite={false} />
			</mesh>
			<mesh ref={moonGlow} scale={2.1}>
				<sphereGeometry args={[3.2, 12, 10]} />
				<meshBasicMaterial
					color="#b8c8e8"
					transparent
					opacity={0.25}
					depthWrite={false}
					toneMapped={false}
					fog={false}
				/>
			</mesh>
			<points ref={stars} geometry={starGeo}>
				<pointsMaterial
					color="#eef4ff"
					size={0.55}
					sizeAttenuation
					transparent
					opacity={0}
					depthWrite={false}
					toneMapped={false}
					fog={false}
				/>
			</points>
			<group ref={clouds}>
				{cloudLobes.map((n) => (
					<mesh key={n.key}>
						<sphereGeometry args={[1, 12, 10]} />
						<meshBasicMaterial
							color="#f2f5f8"
							transparent
							opacity={0}
							depthWrite={false}
							fog={false}
						/>
					</mesh>
				))}
			</group>
			{/* Ground mist bank — denser at the base, transparent at the top */}
			<mesh ref={groundFog} visible={false} material={groundFogMat}>
				<cylinderGeometry args={[1, 1, 1, 48, 6, false]} />
			</mesh>
		</>
	);
}

function SkyDome({ climateRef }: { climateRef: MutableRefObject<ClimateState> }) {
	const uniforms = useMemo(
		() => ({
			uZenith: { value: new THREE.Color("#4a7ab8") },
			uHorizon: { value: new THREE.Color("#a8c8e8") },
		}),
		[],
	);
	const { scene } = useThree();

	useEffect(() => {
		scene.fog = new THREE.FogExp2("#a8c8e8", 0.006);
		return () => {
			scene.fog = null;
		};
	}, [scene]);

	useFrame(() => {
		const c = climateRef.current;
		const sky = skyForDay(c.dayPhase, c.season, c.weather);
		uniforms.uZenith.value.set(sky.zenith);
		uniforms.uHorizon.value.set(sky.horizon);
		const fog = scene.fog as THREE.FogExp2 | null;
		const fogAmt = Number.isFinite(c.fogAmount) ? c.fogAmount : 0;
		if (fog) {
			fog.color.set(sky.fog);
			// Smooth density: clear haze → rain mist → thick fog bank.
			fog.density = 0.005 + fogAmt * 0.026;
		}
		scene.background = uniforms.uHorizon.value;
	});

	return (
		<mesh>
			<sphereGeometry args={[180, 32, 16]} />
			<shaderMaterial
				side={THREE.BackSide}
				depthWrite={false}
				uniforms={uniforms}
				vertexShader={`
					varying vec3 vPos;
					void main() {
						vPos = position;
						gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
					}
				`}
				fragmentShader={`
					uniform vec3 uZenith;
					uniform vec3 uHorizon;
					varying vec3 vPos;
					void main() {
						float h = normalize(vPos).y;
						float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
						vec3 col = mix(uHorizon, uZenith, pow(t, 0.85));
						gl_FragColor = vec4(col, 1.0);
					}
				`}
			/>
		</mesh>
	);
}

/** Live snow pack tint — applied on the CPU so the terrain never depends on a custom GLSL path. */
function paintTerrainColors(
	colors: Float32Array,
	pos: THREE.BufferAttribute,
	heightField: HeightField,
	noise: Noise,
	season: Season,
	snowCover: number,
	waterLevel: number,
) {
	const pack = Number.isFinite(snowCover) ? Math.min(1, Math.max(0, snowCover)) : 0;
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const z = pos.getZ(i);
		const y = pos.getY(i);
		const c = groundColor(heightField, noise, x, z, y, season);
		let { r, g, b } = c;

		const slope = (() => {
			const e = 0.55;
			const h = y;
			const dx = terrainHeight(heightField, x + e, z) - h;
			const dz = terrainHeight(heightField, x, z + e) - h;
			return Math.hypot(dx, dz) / e;
		})();

		const snowLine = season === "winter" ? 7 : season === "autumn" ? 8.8 : 10.5;
		const alpine = Math.min(1, Math.max(0, (y - snowLine) / 3.5)) * (1 - Math.min(1, slope * 0.7));
		const land = Math.min(1, Math.max(0, (y - waterLevel - 0.05) / 0.85));
		const patchNoise = 0.5 + 0.5 * Math.sin(x * 0.11) * Math.cos(z * 0.09);
		const patch = Math.min(1, Math.max(0, (patchNoise * 0.6 + pack * 0.55 - 0.3) / 0.5));
		const snowW = Math.max(alpine * 0.75, pack * land * patch * (1 - Math.min(1, slope * 0.55)));

		r = r + (0.9 - r) * snowW;
		g = g + (0.93 - g) * snowW;
		b = b + (0.97 - b) * snowW;

		colors[i * 3] = r;
		colors[i * 3 + 1] = g;
		colors[i * 3 + 2] = b;
	}
}

function TerrainMesh({
	config,
	noise,
	heightField,
	season,
	climateRef,
}: {
	config: WorldConfig;
	noise: Noise;
	heightField: HeightField;
	season: Season;
	climateRef: MutableRefObject<ClimateState>;
}) {
	const meshRef = useRef<THREE.Mesh>(null);
	const lastPack = useRef(-1);
	const lastSeason = useRef<Season | null>(null);

	const geom = useMemo(() => {
		const { size, segments } = config;
		const g = new THREE.PlaneGeometry(size * 2, size * 2, segments, segments);
		g.rotateX(-Math.PI / 2);
		const pos = g.attributes.position as THREE.BufferAttribute;
		const colors = new Float32Array(pos.count * 3);
		for (let i = 0; i < pos.count; i++) {
			const x = pos.getX(i);
			const z = pos.getZ(i);
			pos.setY(i, terrainHeight(heightField, x, z));
		}
		paintTerrainColors(colors, pos, heightField, noise, season, 0, config.waterLevel);
		g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
		g.computeVertexNormals();
		g.computeBoundingSphere();
		g.computeBoundingBox();
		return g;
	}, [config, noise, heightField, season]);

	useEffect(() => () => geom.dispose(), [geom]);

	useFrame(() => {
		const mesh = meshRef.current;
		if (!mesh) return;
		const c = climateRef.current;
		const pack = Number.isFinite(c.snowCover) ? c.snowCover : 0;
		const packBucket = Math.round(pack * 20) / 20;
		if (packBucket === lastPack.current && c.season === lastSeason.current) return;
		lastPack.current = packBucket;
		lastSeason.current = c.season;

		const g = mesh.geometry as THREE.BufferGeometry;
		const pos = g.attributes.position as THREE.BufferAttribute;
		const col = g.attributes.color as THREE.BufferAttribute;
		const colors = col.array as Float32Array;
		paintTerrainColors(colors, pos, heightField, noise, c.season, pack, config.waterLevel);
		col.needsUpdate = true;
	});

	return (
		<mesh ref={meshRef} geometry={geom} receiveShadow castShadow frustumCulled={false}>
			<meshStandardMaterial vertexColors roughness={0.92} metalness={0.02} />
		</mesh>
	);
}

function WaterMesh({
	config,
	noise,
	heightField,
	climateRef,
}: {
	config: WorldConfig;
	noise: Noise;
	heightField: HeightField;
	climateRef: MutableRefObject<ClimateState>;
}) {
	const mesh = useRef<THREE.Mesh>(null);
	const geom = useMemo(() => {
		const { size, segments, waterLevel } = config;
		const g = new THREE.PlaneGeometry(
			size * 2,
			size * 2,
			Math.floor(segments / 2),
			Math.floor(segments / 2),
		);
		g.rotateX(-Math.PI / 2);
		const pos = g.attributes.position as THREE.BufferAttribute;
		for (let i = 0; i < pos.count; i++) {
			const x = pos.getX(i);
			const z = pos.getZ(i);
			const river = riverMask(noise, x, z, size);
			const land = terrainHeight(heightField, x, z);
			const dip = river > 0.15 ? river * 0.25 : 0;
			pos.setY(i, waterLevel - dip + (land < waterLevel ? 0 : -0.02));
		}
		g.computeVertexNormals();
		return g;
	}, [config, noise, heightField]);

	useEffect(() => () => geom.dispose(), [geom]);

	useFrame(({ clock }) => {
		if (!mesh.current) return;
		const mat = mesh.current.material as THREE.MeshStandardMaterial;
		const c = climateRef.current;
		mesh.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.04;
		if (c.season === "winter") {
			mat.color.set("#b8d0e0");
			mat.opacity = 0.78;
			mat.roughness = 0.35;
		} else {
			mat.color.set(c.weather === "rain" ? "#3a6078" : "#2a6a88");
			mat.opacity = 0.72;
			mat.roughness = 0.18;
		}
	});

	return (
		<mesh ref={mesh} geometry={geom} receiveShadow>
			<meshStandardMaterial
				color="#2a6a88"
				transparent
				opacity={0.72}
				roughness={0.18}
				metalness={0.15}
				depthWrite={false}
			/>
		</mesh>
	);
}

function TreeField({ trees, season }: { trees: TreeSite[]; season: Season }) {
	const pines = useMemo(() => trees.filter((t) => t.kind === "pine"), [trees]);
	const oaks = useMemo(() => trees.filter((t) => t.kind === "oak"), [trees]);
	const birches = useMemo(() => trees.filter((t) => t.kind === "birch"), [trees]);
	const pineTrunk = useMemo(() => pineTrunkGeo(), []);
	const pineFoliage = useMemo(() => pineFoliageGeo(), []);
	const oakTrunk = useMemo(() => oakTrunkGeo(), []);
	const oakFoliage = useMemo(() => oakCanopyGeo(), []);
	const birchTrunk = useMemo(() => birchTrunkGeo(), []);
	const birchFoliage = useMemo(() => birchCanopyGeo(), []);

	useEffect(
		() => () => {
			pineTrunk.dispose();
			pineFoliage.dispose();
			oakTrunk.dispose();
			oakFoliage.dispose();
			birchTrunk.dispose();
			birchFoliage.dispose();
		},
		[pineTrunk, pineFoliage, oakTrunk, oakFoliage, birchTrunk, birchFoliage],
	);

	return (
		<>
			<SpeciesInstances
				sites={pines}
				season={season}
				kind="pine"
				trunkGeo={pineTrunk}
				foliageGeo={pineFoliage}
			/>
			<SpeciesInstances
				sites={oaks}
				season={season}
				kind="oak"
				trunkGeo={oakTrunk}
				foliageGeo={oakFoliage}
				bareInWinter
			/>
			<SpeciesInstances
				sites={birches}
				season={season}
				kind="birch"
				trunkGeo={birchTrunk}
				foliageGeo={birchFoliage}
				bareInWinter
			/>
		</>
	);
}

function SpeciesInstances({
	sites,
	season,
	kind,
	trunkGeo,
	foliageGeo,
	bareInWinter,
}: {
	sites: TreeSite[];
	season: Season;
	kind: TreeSite["kind"];
	trunkGeo: THREE.BufferGeometry;
	foliageGeo: THREE.BufferGeometry;
	bareInWinter?: boolean;
}) {
	const trunk = useRef<THREE.InstancedMesh>(null);
	const foliage = useRef<THREE.InstancedMesh>(null);
	const leaf = leafColor(kind, season);
	const bark = barkColor(kind);
	const bare = bareInWinter && season === "winter";

	useLayoutEffect(() => {
		if (!trunk.current) return;
		for (let i = 0; i < sites.length; i++) {
			const s = sites[i];
			const lean = (s.variant - 0.5) * 0.08;
			dummy.position.set(s.x, s.y, s.z);
			dummy.rotation.set(lean, s.rot, lean * 0.6);
			dummy.scale.setScalar(s.scale);
			dummy.updateMatrix();
			trunk.current.setMatrixAt(i, dummy.matrix);

			_color.setRGB(
				Math.min(1, bark.r * (1.05 + s.variant * 0.25)),
				Math.min(1, bark.g * (1.05 + s.variant * 0.2)),
				Math.min(1, bark.b * (1.0 + s.variant * 0.15)),
			);
			trunk.current.setColorAt(i, _color);

			if (foliage.current && !bare) {
				dummy.position.set(s.x, s.y, s.z);
				dummy.scale.setScalar(s.scale * (0.9 + s.variant * 0.25));
				dummy.updateMatrix();
				foliage.current.setMatrixAt(i, dummy.matrix);
				_color.setRGB(
					Math.min(1, leaf.r * (1.05 + s.variant * 0.35)),
					Math.min(1, leaf.g * (1.1 + s.variant * 0.25)),
					Math.min(1, leaf.b * (1.0 + s.variant * 0.3)),
				);
				foliage.current.setColorAt(i, _color);
			}
		}
		trunk.current.count = sites.length;
		trunk.current.instanceMatrix.needsUpdate = true;
		if (trunk.current.instanceColor) trunk.current.instanceColor.needsUpdate = true;
		if (foliage.current && !bare) {
			foliage.current.count = sites.length;
			foliage.current.instanceMatrix.needsUpdate = true;
			if (foliage.current.instanceColor) foliage.current.instanceColor.needsUpdate = true;
		}
	}, [sites, bark, leaf, bare]);

	if (sites.length === 0) return null;

	return (
		<>
			<instancedMesh ref={trunk} args={[trunkGeo, undefined, sites.length]} castShadow>
				<meshStandardMaterial color="#ffffff" roughness={0.9} metalness={0.02} />
			</instancedMesh>
			{!bare && (
				<instancedMesh ref={foliage} args={[foliageGeo, undefined, sites.length]} castShadow>
					<meshStandardMaterial color="#ffffff" roughness={0.82} metalness={0} />
				</instancedMesh>
			)}
		</>
	);
}

function makeRockMaterial() {
	const mat = new THREE.MeshStandardMaterial({
		color: "#ffffff",
		roughness: 0.9,
		metalness: 0.03,
	});
	mat.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader
			.replace(
				"#include <common>",
				`#include <common>
				varying vec3 vRockWorld;
				varying vec3 vRockNormal;`,
			)
			.replace(
				"#include <project_vertex>",
				`#include <project_vertex>
				#ifdef USE_INSTANCING
					vRockWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
					vRockNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
				#else
					vRockWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
					vRockNormal = normalize(mat3(modelMatrix) * normal);
				#endif`,
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				`#include <common>
				varying vec3 vRockWorld;
				varying vec3 vRockNormal;
				float rockNoise(vec3 p) {
					return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
				}
				float rockFbm(vec3 p) {
					float s = 0.0;
					float a = 0.5;
					for (int i = 0; i < 4; i++) {
						s += rockNoise(p) * a;
						p = p * 2.11 + 17.0;
						a *= 0.5;
					}
					return s;
				}`,
			)
			.replace(
				"#include <color_fragment>",
				`#include <color_fragment>
				vec3 p = vRockWorld;
				vec3 bn = abs(normalize(vRockNormal));
				bn /= max(bn.x + bn.y + bn.z, 0.001);
				float grain =
					rockFbm(p.zyx * 1.8) * bn.x +
					rockFbm(p.xzy * 1.8) * bn.y +
					rockFbm(p.xyz * 1.8) * bn.z;
				float fine = rockFbm(p * 5.5);
				float strata = 0.5 + 0.5 * sin(p.y * 2.4 + grain * 3.0);
				float crack = pow(max(0.0, 1.0 - abs(rockFbm(p * 2.2) - 0.5) * 3.2), 3.0);
				float lichen = smoothstep(0.62, 0.82, rockFbm(p * 0.7 + 4.0)) * (1.0 - bn.y * 0.4);

				vec3 slate = vec3(0.36, 0.38, 0.41);
				vec3 granite = vec3(0.48, 0.46, 0.43);
				vec3 base = mix(granite, slate, strata * 0.55);
				base = mix(base, vec3(0.58, 0.56, 0.52), smoothstep(0.65, 0.8, fine) * 0.35);
				base *= mix(0.78, 1.12, grain);
				base *= 1.0 - crack * 0.4;
				base = mix(base, vec3(0.30, 0.40, 0.24), lichen * 0.28);

				diffuseColor.rgb *= base;`,
			);
	};
	mat.customProgramCacheKey = () => "terraform-rock-ws-v2";
	return mat;
}

function RockField({ rocks }: { rocks: RockSite[] }) {
	const boulder = useMemo(() => boulderGeo(), []);
	const slab = useMemo(() => slabGeo(), []);
	const pebble = useMemo(() => pebbleGeo(), []);
	const material = useMemo(() => makeRockMaterial(), []);

	const boulders = useMemo(() => rocks.filter((r) => r.kind === "boulder"), [rocks]);
	const slabs = useMemo(() => rocks.filter((r) => r.kind === "slab"), [rocks]);
	const pebbles = useMemo(() => rocks.filter((r) => r.kind === "pebble"), [rocks]);

	useEffect(
		() => () => {
			boulder.dispose();
			slab.dispose();
			pebble.dispose();
			material.dispose();
		},
		[boulder, slab, pebble, material],
	);

	return (
		<>
			<RockKindInstances
				sites={boulders}
				geometry={boulder}
				material={material}
				tint={[0.95, 0.93, 0.9]}
				yLift={0.42}
			/>
			<RockKindInstances
				sites={slabs}
				geometry={slab}
				material={material}
				tint={[0.88, 0.9, 0.94]}
				yLift={0.18}
				flat
			/>
			<RockKindInstances
				sites={pebbles}
				geometry={pebble}
				material={material}
				tint={[1.0, 0.96, 0.9]}
				yLift={0.28}
			/>
		</>
	);
}

function RockKindInstances({
	sites,
	geometry,
	material,
	tint,
	yLift,
	flat,
}: {
	sites: RockSite[];
	geometry: THREE.BufferGeometry;
	material: THREE.MeshStandardMaterial;
	tint: [number, number, number];
	yLift: number;
	flat?: boolean;
}) {
	const mesh = useRef<THREE.InstancedMesh>(null);

	useLayoutEffect(() => {
		const m = mesh.current;
		if (!m) return;
		for (let i = 0; i < sites.length; i++) {
			const s = sites[i];
			const sx = flat ? s.scale * 1.15 : s.scale * (0.85 + (i % 5) * 0.06);
			const sy = flat ? s.scale * 0.55 : s.scale * (0.75 + (i % 3) * 0.08);
			const sz = flat ? s.scale * 0.95 : s.scale * (0.8 + ((i + 2) % 4) * 0.07);
			dummy.position.set(s.x, s.y + yLift * sy, s.z);
			dummy.rotation.set(
				flat ? 0.05 * ((i % 3) - 1) : 0.2 * ((i % 5) - 2),
				s.rot,
				flat ? 0.04 * ((i % 4) - 1.5) : 0.15 * ((i % 4) - 1.5),
			);
			dummy.scale.set(sx, sy, sz);
			dummy.updateMatrix();
			m.setMatrixAt(i, dummy.matrix);

			const shade = 0.78 + (i % 7) * 0.035;
			_color.setRGB(tint[0] * shade, tint[1] * shade, tint[2] * shade);
			m.setColorAt(i, _color);
		}
		m.count = sites.length;
		m.instanceMatrix.needsUpdate = true;
		if (m.instanceColor) m.instanceColor.needsUpdate = true;
	}, [sites, tint, yLift, flat]);

	if (sites.length === 0) return null;

	return (
		<instancedMesh
			ref={mesh}
			args={[geometry, material, sites.length]}
			castShadow
			receiveShadow
		/>
	);
}

function WeatherField({
	climateRef,
	size,
}: {
	climateRef: MutableRefObject<ClimateState>;
	size: number;
}) {
	const points = useRef<THREE.Points>(null);
	const count = 2200;
	const positions = useMemo(() => {
		const arr = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			arr[i * 3] = (Math.random() * 2 - 1) * size;
			arr[i * 3 + 1] = Math.random() * 28 + 2;
			arr[i * 3 + 2] = (Math.random() * 2 - 1) * size;
		}
		return arr;
	}, [size]);

	const geom = useMemo(() => {
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		return g;
	}, [positions]);

	useEffect(() => () => geom.dispose(), [geom]);

	useFrame(({ camera }, dt) => {
		const c = climateRef.current;
		const pts = points.current;
		if (!pts) return;
		const amount = Number.isFinite(c.precipAmount) ? c.precipAmount : 0;
		const cover = Number.isFinite(c.cloudCover) ? c.cloudCover : 0;
		// Intensity eases in sim; clouds still gate so drops don't fall from blue sky.
		const cloudGate = Math.min(1, Math.max(0, (cover - 0.22) / 0.45));
		const intensity = amount * cloudGate;
		const show = intensity > 0.015;
		pts.visible = show;
		if (!show) return;

		// Keep precipitation around the camera so fly/walk always see it.
		pts.position.set(camera.position.x, 0, camera.position.z);

		const pos = pts.geometry.attributes.position as THREE.BufferAttribute;
		// Prefer snow look while snowing, or while a snow spell is still fading out.
		const snow =
			c.weather === "snow" || (c.weather !== "rain" && c.precipSynced === "snow" && amount > 0.02);
		const speed = (snow ? 5.5 : 14 + intensity * 12) * (0.55 + intensity * 0.55);
		const drift = snow ? 1.6 : 0.35 + intensity * 0.45;
		const span = size * 0.85;
		// Light spells use fewer particles; heavy fills most of the budget.
		const activeFrac = snow
			? 0.35 + intensity * 0.65
			: 0.18 + intensity * 0.5;
		const activeCount = Math.floor(count * activeFrac);
		for (let i = 0; i < count; i++) {
			if (i >= activeCount) {
				pos.setY(i, -10);
				continue;
			}
			let y = pos.getY(i) - dt * speed * (0.55 + (i % 5) * 0.14);
			let x = pos.getX(i) + Math.sin(i * 0.7 + y * 0.12) * drift * dt;
			let z = pos.getZ(i) + Math.cos(i * 0.5 + y * 0.08) * drift * 0.6 * dt;
			if (y < 0) {
				y = 18 + Math.random() * 16;
				x = (Math.random() * 2 - 1) * span;
				z = (Math.random() * 2 - 1) * span;
			}
			pos.setY(i, y);
			pos.setX(i, x);
			pos.setZ(i, z);
		}
		pos.needsUpdate = true;
		const mat = pts.material as THREE.PointsMaterial;
		mat.color.set(snow ? "#f4f8ff" : "#9ab0c8");
		mat.size = snow ? 0.14 + intensity * 0.12 : 0.045 + intensity * 0.04;
		mat.opacity = (snow ? 0.55 : 0.4) + intensity * 0.4;
	});

	return (
		<points ref={points} geometry={geom} visible={false}>
			<pointsMaterial color="#9ab0c8" size={0.1} transparent opacity={0.75} depthWrite={false} />
		</points>
	);
}

