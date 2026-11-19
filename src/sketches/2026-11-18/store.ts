import { create } from "zustand";
import {
	CRATER,
	GEYSERS,
	LIMIT,
	PADS,
	START,
	WATER_Y,
	blockerAt,
	clamp,
	dampAngle,
	gatherBlockers,
	settle,
	surface,
	wrapAngle,
	yawTo,
	type Pad,
} from "./world";

export type Mode = "ready" | "live" | "paused" | "dead";
export type View = "far" | "near";
export type Seat = "tank" | "foot" | "rts";
export type Chassis = "lance" | "sabre" | "anvil" | "mason";
export type BuildKind = "tower" | "supply";
export type Team = "isdf" | "scion";
export type EnemyKind = "raider" | "turret";
export type LockKind = "none" | "enemy" | "relay" | "citadel";

export const MAX_HULL = 100;
export const MAX_MISSILES = 8;

export const CHASSIS: Record<
	Chassis,
	{
		hp: number;
		accel: number;
		speed: number;
		damage: number;
		rate: number;
		missiles: number;
		label: string;
	}
> = {
	lance: { hp: 100, accel: 82, speed: 48, damage: 18, rate: 0.18, missiles: 8, label: "LANCE" },
	sabre: { hp: 74, accel: 114, speed: 68, damage: 11, rate: 0.11, missiles: 4, label: "SABRE" },
	anvil: { hp: 156, accel: 58, speed: 34, damage: 28, rate: 0.32, missiles: 6, label: "ANVIL" },
	mason: { hp: 96, accel: 48, speed: 28, damage: 8, rate: 0.46, missiles: 0, label: "MASON" },
};

export const BUILD_COST: Record<BuildKind, number> = { tower: 90, supply: 50 };

const GUN_RATE = 0.18;
const MISSILE_RATE = 0.8;
const SHELL_SPEED = 240;
const MISSILE_SPEED = 92;
const LOCK_RANGE = 520;
const LOCK_ANGLE = 0.11;

export type Player = {
	x: number;
	y: number;
	z: number;
	yaw: number;
	vx: number;
	vz: number;
	hp: number;
	heat: number;
	overheat: number;
	missiles: number;
	missileCd: number;
	gunCd: number;
};

export type Enemy = {
	id: number;
	kind: EnemyKind;
	x: number;
	y: number;
	z: number;
	yaw: number;
	vx: number;
	vz: number;
	hp: number;
	maxHp: number;
	alive: boolean;
	gunYaw: number;
	gunPitch: number;
	cooldown: number;
	homeX: number;
	homeZ: number;
	goalX: number;
	goalZ: number;
	think: number;
	seen: number;
	losIn: number;
	phase: number;
};

export type Structure = Pad & {
	maxHp: number;
	alive: boolean;
	supplyCd: number;
	team: Team;
	gunCd: number;
	placed: boolean;
};

export type RigRole = "pilot" | "wing" | "builder";

export type Rig = {
	id: number;
	chassis: Chassis;
	role: RigRole;
	x: number;
	y: number;
	z: number;
	yaw: number;
	vx: number;
	vz: number;
	hp: number;
	maxHp: number;
	alive: boolean;
	gunYaw: number;
	gunPitch: number;
	cooldown: number;
	occupied: boolean;
	order: "follow" | "idle" | "move" | "build";
	goalX: number;
	goalZ: number;
	build: BuildKind | null;
	buildT: number;
	stuck: number;
	seen: number;
	losIn: number;
	phase: number;
};

export type Shot = {
	x: number;
	y: number;
	z: number;
	px: number;
	py: number;
	pz: number;
	vx: number;
	vy: number;
	vz: number;
	team: Team;
	missile: boolean;
	age: number;
	life: number;
	power: number;
	skim: boolean;
	target: number | string | null;
};

export type Blast = {
	x: number;
	y: number;
	z: number;
	age: number;
	life: number;
	big: boolean;
};

export type Sfx = {
	cannon: number;
	missile: number;
	boom: number;
	hurt: number;
	incoming: number;
};

export type BattleInput = {
	forward: number;
	strafe: number;
	fire: boolean;
	missile: boolean;
	boost: boolean;
	aimX: number;
	aimY: number;
	zoom: number;
};

type Data = {
	mode: Mode;
	won: boolean;
	view: View;
	seat: Seat;
	mapOpen: boolean;
	age: number;
	aimYaw: number;
	aimPitch: number;
	boost: number;
	player: Player;
	bodyHp: number;
	hullMax: number;
	ridden: number;
	rigs: Rig[];
	scrap: number;
	selected: number;
	arm: BuildKind | null;
	rtsX: number;
	rtsZ: number;
	rtsZoom: number;
	enemies: Enemy[];
	structures: Structure[];
	shots: Shot[];
	blasts: Blast[];
	navX: number;
	navZ: number;
	kills: number;
	shake: number;
	hurt: number;
	hitMark: number;
	banner: string;
	bannerT: number;
	lockKind: LockKind;
	lockIndex: number;
	lockName: string;
	lockHp: number;
	lockMax: number;
	spawnIn: number;
	sfx: Sfx;
};

type Actions = {
	launch: () => void;
	restart: () => void;
	pause: () => void;
	resume: () => void;
	interact: () => void;
	command: () => void;
	armBuild: (kind: BuildKind) => void;
	selectBuilder: (index: number) => void;
	commandAt: (x: number, z: number) => void;
	toggleMap: () => void;
	closeMap: () => void;
	setNav: (x: number, z: number) => void;
	toggleView: () => void;
	step: (input: BattleInput, dt: number) => void;
};

function citadel(): Pad {
	const pad = PADS.find((item) => item.kind === "citadel");
	if (!pad) throw new Error("Citadel pad missing");
	return pad;
}

function makeStructures(): Structure[] {
	const pads: Structure[] = PADS.map((pad) => ({
		...pad,
		maxHp: pad.hp,
		alive: true,
		supplyCd: 0,
		team: pad.kind === "relay" || pad.kind === "citadel" ? "scion" : "isdf",
		gunCd: 0,
		placed: true,
	}));
	const slots: Structure[] = [];
	for (let index = 0; index < 8; index++) slots.push(emptySlot("tower", index));
	for (let index = 0; index < 4; index++) slots.push(emptySlot("supply", index));
	return pads.concat(slots);
}

function emptySlot(kind: BuildKind, index: number): Structure {
	return {
		id: `slot-${kind}-${index}`,
		kind,
		name: kind === "tower" ? "Tower" : "Supply",
		x: 0,
		z: 0,
		y: 0,
		flat: 12,
		hp: 0,
		maxHp: 0,
		alive: false,
		supplyCd: 0,
		team: "isdf",
		gunCd: 0,
		placed: false,
	};
}

function makeRig(
	id: number,
	chassis: Chassis,
	role: RigRole,
	x: number,
	z: number,
	phase: number,
	occupied: boolean,
): Rig {
	const hp = CHASSIS[chassis].hp;
	const yaw = yawTo(x, z, CRATER.x, CRATER.z);
	return {
		id,
		chassis,
		role,
		x,
		y: surface(x, z) + 1.7,
		z,
		yaw,
		vx: 0,
		vz: 0,
		hp,
		maxHp: hp,
		alive: true,
		gunYaw: yaw,
		gunPitch: 0,
		cooldown: phase,
		occupied,
		order: role === "builder" ? "idle" : "follow",
		goalX: x,
		goalZ: z,
		build: null,
		buildT: 0,
		stuck: 0,
		seen: 0,
		losIn: phase,
		phase,
	};
}

function makeRigs(): Rig[] {
	return [
		makeRig(0, "lance", "pilot", START.x, START.z, 0.1, true),
		makeRig(1, "sabre", "wing", START.x - 36, START.z + 6, 0.25, false),
		makeRig(2, "anvil", "wing", START.x + 24, START.z + 16, 0.7, false),
		makeRig(3, "mason", "builder", START.x - 18, START.z - 16, 0.4, false),
		makeRig(4, "mason", "builder", START.x + 16, START.z - 18, 0.85, false),
	];
}

function makeEnemy(id: number, kind: EnemyKind, x: number, z: number, phase: number): Enemy {
	const hp = kind === "turret" ? 90 : 130;
	return {
		id,
		kind,
		x,
		y: surface(x, z) + 1.7,
		z,
		yaw: phase * Math.PI * 2,
		vx: 0,
		vz: 0,
		hp,
		maxHp: hp,
		alive: true,
		gunYaw: 0,
		gunPitch: 0,
		cooldown: phase,
		homeX: x,
		homeZ: z,
		goalX: x,
		goalZ: z,
		think: phase * 3,
		seen: 0,
		losIn: phase,
		phase,
	};
}

function ring(
	x: number,
	z: number,
	radius: number,
	count: number,
	spin: number,
): Array<[number, number]> {
	return Array.from({ length: count }, (_, index) => {
		const angle = spin + (index / count) * Math.PI * 2;
		return [x + Math.cos(angle) * radius, z + Math.sin(angle) * radius] as [number, number];
	});
}

function makeEnemies(): Enemy[] {
	const fort = citadel();
	const spots: Array<{ kind: EnemyKind; x: number; z: number }> = [];
	const approach = yawTo(START.x, START.z, fort.x, fort.z);
	spots.push(
		{
			kind: "raider",
			x: START.x + Math.sin(approach) * 480,
			z: START.z + Math.cos(approach) * 480,
		},
		{
			kind: "raider",
			x: START.x + Math.sin(approach + 0.55) * 820,
			z: START.z + Math.cos(approach + 0.55) * 820,
		},
	);
	for (const pad of PADS) {
		if (pad.kind !== "relay") continue;
		spots.push(
			{ kind: "turret", x: pad.x + 16, z: pad.z + 11 },
			{ kind: "turret", x: pad.x - 14, z: pad.z - 13 },
			{ kind: "raider", x: pad.x + 40, z: pad.z - 28 },
			{ kind: "raider", x: pad.x - 32, z: pad.z + 36 },
		);
	}
	for (const [x, z] of ring(fort.x, fort.z, 38, 5, 0.35)) spots.push({ kind: "turret", x, z });
	for (const [x, z] of ring(fort.x, fort.z, 86, 4, 0.15)) spots.push({ kind: "raider", x, z });
	spots.push(
		{ kind: "raider", x: -900, z: -450 },
		{ kind: "raider", x: 450, z: 1150 },
		{ kind: "raider", x: -1500, z: 1850 },
	);
	return spots.map((spot, index) =>
		makeEnemy(index + 1, spot.kind, spot.x, spot.z, (index % 7) / 7),
	);
}

function makePlayer(): Player {
	return {
		x: START.x,
		y: surface(START.x, START.z) + 1.7,
		z: START.z,
		yaw: yawTo(START.x, START.z, CRATER.x, CRATER.z),
		vx: 0,
		vz: 0,
		hp: MAX_HULL,
		heat: 0,
		overheat: 0,
		missiles: MAX_MISSILES,
		missileCd: 0,
		gunCd: 0,
	};
}

function fresh(): Data {
	const aim = yawTo(START.x, START.z, CRATER.x, CRATER.z);
	return {
		mode: "ready",
		won: false,
		view: "far",
		seat: "tank",
		mapOpen: false,
		age: 0,
		aimYaw: aim,
		aimPitch: 0,
		boost: 1,
		player: makePlayer(),
		bodyHp: MAX_HULL,
		hullMax: CHASSIS.lance.hp,
		ridden: 0,
		rigs: makeRigs(),
		scrap: 180,
		selected: 3,
		arm: null,
		rtsX: START.x,
		rtsZ: START.z,
		rtsZoom: 76,
		enemies: makeEnemies(),
		structures: makeStructures(),
		shots: [],
		blasts: [],
		navX: CRATER.x,
		navZ: CRATER.z,
		kills: 0,
		shake: 0,
		hurt: 0,
		hitMark: 0,
		banner: "",
		bannerT: 0,
		lockKind: "none",
		lockIndex: -1,
		lockName: "",
		lockHp: 0,
		lockMax: 0,
		spawnIn: 20,
		sfx: { cannon: 0, missile: 0, boom: 0, hurt: 0, incoming: 0 },
	};
}

function say(state: Data, text: string, time = 3) {
	state.banner = text;
	state.bannerT = time;
}

function addBlast(state: Data, x: number, y: number, z: number, big: boolean) {
	state.blasts.push({ x, y, z, age: 0, life: big ? 1.1 : 0.5, big });
	if (state.blasts.length > 16) state.blasts.shift();
	state.sfx.boom += 1;
}

function hurtPlayer(state: Data, amount: number) {
	if (state.mode !== "live" || state.seat === "rts" || state.player.hp <= 0 || amount <= 0) return;
	state.player.hp = Math.max(0, state.player.hp - amount);
	state.hurt = Math.min(1, state.hurt + Math.min(0.55, amount * 0.045));
	state.shake = Math.min(1.4, state.shake + Math.min(0.45, amount * 0.03));
	if (amount >= 5) state.sfx.hurt += 1;
	if (state.seat === "foot") state.bodyHp = state.player.hp;
	const rig = state.seat === "tank" ? state.rigs[state.ridden] : undefined;
	if (rig) rig.hp = state.player.hp;
	if (state.player.hp > 0) return;
	if (rig) {
		rig.alive = false;
		rig.hp = 0;
		rig.occupied = false;
	}
	state.mode = "dead";
	state.mapOpen = false;
	addBlast(state, state.player.x, state.player.y + 1, state.player.z, true);
	say(state, state.seat === "foot" ? "SUIT LOST" : "HULL LOST", 8);
}

function hurtEnemy(state: Data, enemy: Enemy, amount: number) {
	if (!enemy.alive || amount <= 0) return;
	enemy.hp -= amount;
	state.hitMark = 1;
	if (enemy.hp > 0) return;
	enemy.alive = false;
	enemy.hp = 0;
	enemy.vx = 0;
	enemy.vz = 0;
	state.kills += 1;
	state.scrap += 18;
	addBlast(state, enemy.x, enemy.y + 1, enemy.z, false);
	say(state, enemy.kind === "turret" ? "TURRET DOWN" : "RAIDER DOWN", 1.5);
}

function hurtStructure(state: Data, structure: Structure, amount: number) {
	if (!structure.alive || structure.maxHp <= 0 || amount <= 0) return;
	structure.hp -= amount;
	state.hitMark = 1;
	if (structure.hp > 0) return;
	structure.alive = false;
	structure.hp = 0;
	addBlast(state, structure.x, structure.y + 5, structure.z, true);
	if (structure.kind === "citadel") {
		state.won = true;
		say(state, "CITADEL DOWN", 8);
	} else {
		say(state, `${structure.name.toUpperCase()} DOWN`, 2.4);
	}
}

function splash(state: Data, x: number, y: number, z: number, amount: number) {
	for (const enemy of state.enemies) {
		if (!enemy.alive) continue;
		const dist = Math.hypot(enemy.x - x, enemy.y + 1 - y, enemy.z - z);
		if (dist < 12) hurtEnemy(state, enemy, amount * (1 - dist / 12));
	}
	for (const structure of state.structures) {
		if (!structure.alive || structure.maxHp <= 0 || structure.team === "isdf") continue;
		const reach = structure.kind === "citadel" ? 24 : 14;
		const dist = Math.hypot(structure.x - x, structure.z - z);
		if (dist > reach) continue;
		const falloff = 1 - dist / reach;
		hurtStructure(state, structure, amount * (0.55 + 0.45 * falloff));
	}
}

function segmentDistSq(
	x0: number,
	y0: number,
	z0: number,
	x1: number,
	y1: number,
	z1: number,
	cx: number,
	cy: number,
	cz: number,
): number {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const dz = z1 - z0;
	const lengthSq = dx * dx + dy * dy + dz * dz || 1;
	const t = clamp(-((x0 - cx) * dx + (y0 - cy) * dy + (z0 - cz) * dz) / lengthSq, 0, 1);
	const px = x0 + dx * t - cx;
	const py = y0 + dy * t - cy;
	const pz = z0 + dz * t - cz;
	return px * px + py * py + pz * pz;
}

function segmentDistSqXZ(
	x0: number,
	z0: number,
	x1: number,
	z1: number,
	cx: number,
	cz: number,
): number {
	const dx = x1 - x0;
	const dz = z1 - z0;
	const lengthSq = dx * dx + dz * dz || 1;
	const t = clamp(-((x0 - cx) * dx + (z0 - cz) * dz) / lengthSq, 0, 1);
	const px = x0 + dx * t - cx;
	const pz = z0 + dz * t - cz;
	return px * px + pz * pz;
}

function shotGap(shot: Shot, cx: number, cy: number, cz: number): number {
	if (shot.skim) return segmentDistSqXZ(shot.px, shot.pz, shot.x, shot.z, cx, cz);
	return segmentDistSq(shot.px, shot.py, shot.pz, shot.x, shot.y, shot.z, cx, cy, cz);
}

function lineOfSight(
	x0: number,
	y0: number,
	z0: number,
	x1: number,
	y1: number,
	z1: number,
): boolean {
	for (let step = 1; step <= 4; step++) {
		const t = step / 5;
		const x = x0 + (x1 - x0) * t;
		const y = y0 + (y1 - y0) * t;
		const z = z0 + (z1 - z0) * t;
		if (surface(x, z) > y + 1.6) return false;
	}
	return true;
}

function solidRadius(structure: Structure): number {
	if (structure.kind === "citadel" && structure.alive) return 18;
	if (structure.kind === "relay" && structure.alive) return 6.5;
	if (structure.kind === "tower" && structure.alive && structure.placed) return 3.2;
	return 0;
}

function repel(x: number, z: number, structures: Structure[]): { x: number; z: number } {
	let px = x;
	let pz = z;
	for (const structure of structures) {
		const radius = solidRadius(structure);
		if (radius <= 0) continue;
		const dx = px - structure.x;
		const dz = pz - structure.z;
		const dist = Math.hypot(dx, dz);
		if (dist >= radius || dist < 0.001) continue;
		px = structure.x + (dx / dist) * radius;
		pz = structure.z + (dz / dist) * radius;
	}
	return { x: px, z: pz };
}

function hover(entity: { x: number; y: number; z: number }, dt: number) {
	const target = surface(entity.x, entity.z) + 1.65;
	entity.y += (target - entity.y) * (1 - Math.exp(-8 * dt));
}

function tipAt(x: number, y: number, z: number, yaw: number, pitch: number, reach: number) {
	const cos = Math.cos(pitch);
	return {
		x: x + Math.sin(yaw) * cos * reach,
		y: y + 1.3 + Math.sin(pitch) * reach,
		z: z + Math.cos(yaw) * cos * reach,
	};
}

function fireShell(
	state: Data,
	team: Team,
	x: number,
	y: number,
	z: number,
	yaw: number,
	pitch: number,
	inheritX: number,
	inheritZ: number,
	announce: boolean,
	power = 12,
	life = 2.6,
	speed = SHELL_SPEED,
) {
	if (state.shots.length > 96) return;
	const cos = Math.cos(pitch);
	state.shots.push({
		x,
		y,
		z,
		px: x,
		py: y,
		pz: z,
		vx: Math.sin(yaw) * cos * speed + inheritX,
		vy: Math.sin(pitch) * speed,
		vz: Math.cos(yaw) * cos * speed + inheritZ,
		team,
		missile: false,
		age: 0,
		life,
		power,
		skim: true,
		target: null,
	});
	if (!announce) return;
	if (team === "isdf") state.sfx.cannon += 1;
	else state.sfx.incoming += 1;
}

function updateLock(state: Data) {
	let best = Infinity;
	let kind: LockKind = "none";
	let index = -1;
	const heldEnemy = state.lockKind === "enemy" ? state.lockIndex : -1;
	const heldStructure =
		state.lockKind === "relay" || state.lockKind === "citadel" ? state.lockIndex : -1;
	const { x, z } = state.player;
	for (let i = 0; i < state.enemies.length; i++) {
		const enemy = state.enemies[i];
		if (!enemy.alive) continue;
		if (Math.hypot(enemy.x - x, enemy.z - z) > LOCK_RANGE) continue;
		const angle = Math.abs(wrapAngle(yawTo(x, z, enemy.x, enemy.z) - state.aimYaw));
		const limit = i === heldEnemy ? 0.5 : 0.22;
		if (angle < limit && angle < best) {
			best = angle;
			kind = "enemy";
			index = i;
		}
	}
	for (let i = 0; i < state.structures.length; i++) {
		const structure = state.structures[i];
		if (!structure.alive || !structure.placed || structure.team !== "scion" || structure.maxHp <= 0)
			continue;
		if (Math.hypot(structure.x - x, structure.z - z) > LOCK_RANGE + 180) continue;
		const angle = Math.abs(wrapAngle(yawTo(x, z, structure.x, structure.z) - state.aimYaw));
		const acquire = structure.kind === "citadel" ? 0.2 : 0.22;
		const limit = i === heldStructure ? 0.5 : acquire;
		if (angle < limit && angle < best) {
			best = angle;
			kind = structure.kind === "citadel" ? "citadel" : "relay";
			index = i;
		}
	}
	state.lockKind = kind;
	state.lockIndex = index;
	if (kind === "enemy") {
		const enemy = state.enemies[index];
		state.lockName = enemy.kind === "turret" ? "TURRET" : "RAIDER";
		state.lockHp = enemy.hp;
		state.lockMax = enemy.maxHp;
	} else if (kind === "relay" || kind === "citadel") {
		const structure = state.structures[index];
		state.lockName = structure.name.toUpperCase();
		state.lockHp = structure.hp;
		state.lockMax = structure.maxHp;
	}
}

function lockedAim(state: Data): { yaw: number; pitch: number } | null {
	const player = state.player;
	let tx = 0;
	let ty = 0;
	let tz = 0;
	let vx = 0;
	let vz = 0;
	if (state.lockKind === "enemy") {
		const enemy = state.enemies[state.lockIndex];
		if (!enemy?.alive) return null;
		tx = enemy.x;
		ty = enemy.y + 1.1;
		tz = enemy.z;
		vx = enemy.vx;
		vz = enemy.vz;
	} else if (state.lockKind === "relay" || state.lockKind === "citadel") {
		const structure = state.structures[state.lockIndex];
		if (!structure?.alive) return null;
		tx = structure.x;
		ty = structure.y + (structure.kind === "citadel" ? 11 : 6);
		tz = structure.z;
	} else {
		return null;
	}
	const dist = Math.hypot(tx - player.x, tz - player.z);
	const flight = clamp(dist / SHELL_SPEED, 0, 2.4);
	tx += vx * flight;
	tz += vz * flight;
	return {
		yaw: yawTo(player.x, player.z, tx, tz),
		pitch: clamp(Math.atan2(ty - (player.y + 1.3), Math.max(12, dist)), -0.42, 0.46),
	};
}

function mirrorRig(state: Data) {
	if (state.seat !== "tank") return;
	const rig = state.rigs[state.ridden];
	if (!rig) return;
	rig.x = state.player.x;
	rig.y = state.player.y;
	rig.z = state.player.z;
	rig.yaw = state.player.yaw;
	rig.vx = state.player.vx;
	rig.vz = state.player.vz;
	rig.hp = state.player.hp;
	rig.alive = state.player.hp > 0;
	rig.occupied = true;
	rig.gunYaw = state.aimYaw;
	rig.gunPitch = state.aimPitch;
}

function driveConsole(state: Data, input: BattleInput, dt: number) {
	const yaw = state.aimYaw;
	const speed = 86 * (state.rtsZoom / 48);
	state.rtsX = clamp(
		state.rtsX + (Math.sin(yaw) * input.forward - Math.cos(yaw) * input.strafe) * speed * dt,
		-LIMIT,
		LIMIT,
	);
	state.rtsZ = clamp(
		state.rtsZ + (Math.cos(yaw) * input.forward + Math.sin(yaw) * input.strafe) * speed * dt,
		-LIMIT,
		LIMIT,
	);
	state.aimYaw = wrapAngle(state.aimYaw - input.aimX * 0.0022);
	state.rtsZoom = clamp(state.rtsZoom + input.zoom * 6, 24, 110);
}

function driveFoot(state: Data, input: BattleInput, dt: number) {
	const player = state.player;
	const fx = Math.sin(state.aimYaw);
	const fz = Math.cos(state.aimYaw);
	const rx = -Math.cos(state.aimYaw);
	const rz = Math.sin(state.aimYaw);
	player.vx += (fx * input.forward + rx * input.strafe) * 56 * dt;
	player.vz += (fz * input.forward + rz * input.strafe) * 56 * dt;
	const idle = input.forward === 0 && input.strafe === 0;
	const drag = Math.exp((idle ? -8 : -3) * dt);
	player.vx *= drag;
	player.vz *= drag;
	const speed = Math.hypot(player.vx, player.vz);
	const max = 9.2;
	if (speed > max) {
		player.vx = (player.vx / speed) * max;
		player.vz = (player.vz / speed) * max;
	}
	const foot = settle(
		player.x,
		player.z,
		player.x + player.vx * dt,
		player.z + player.vz * dt,
		0.55,
	);
	player.x = foot.x;
	player.z = foot.z;
	const ground = surface(player.x, player.z);
	player.y += (ground - player.y) * (1 - Math.exp(-10 * dt));
	player.yaw = state.aimYaw;
	player.gunCd = Math.max(0, player.gunCd - dt);
	if (input.fire && player.gunCd <= 0) {
		const tip = tipAt(player.x, player.y, player.z, state.aimYaw, state.aimPitch, 0.7);
		fireShell(
			state,
			"isdf",
			tip.x,
			tip.y,
			tip.z,
			state.aimYaw,
			state.aimPitch,
			0,
			0,
			false,
			9,
			0.85,
			340,
		);
		player.gunCd = 0.16;
	}
	state.bodyHp = player.hp;
}

function drivePlayer(state: Data, input: BattleInput, dt: number) {
	if (state.seat === "rts") {
		driveConsole(state, input, dt);
		return;
	}
	const player = state.player;
	state.aimYaw = wrapAngle(state.aimYaw - input.aimX * 0.00235);
	state.aimPitch = clamp(state.aimPitch - input.aimY * 0.00165, -0.42, 0.46);
	if (state.seat === "foot") {
		driveFoot(state, input, dt);
		return;
	}
	const spec = CHASSIS[state.rigs[state.ridden]?.chassis ?? "lance"];

	const fx = Math.sin(state.aimYaw);
	const fz = Math.cos(state.aimYaw);
	const rx = -Math.cos(state.aimYaw);
	const rz = Math.sin(state.aimYaw);
	const boosting = input.boost && state.boost > 0.02;
	state.boost = boosting
		? Math.max(0, state.boost - dt * 0.45)
		: Math.min(1, state.boost + dt * 0.22);
	const accel = boosting ? spec.accel * 1.55 : spec.accel;
	player.vx += (fx * input.forward + rx * input.strafe * 0.75) * accel * dt;
	player.vz += (fz * input.forward + rz * input.strafe * 0.75) * accel * dt;
	const idle = input.forward === 0 && input.strafe === 0;
	const drag = Math.exp((idle ? -2.5 : -0.5) * dt);
	player.vx *= drag;
	player.vz *= drag;
	const max = (boosting ? spec.speed * 1.45 : spec.speed) * (input.forward < 0 ? 0.55 : 1);
	const speed = Math.hypot(player.vx, player.vz);
	if (speed > max) {
		player.vx = (player.vx / speed) * max;
		player.vz = (player.vz / speed) * max;
	}
	const driven = settle(
		player.x,
		player.z,
		player.x + player.vx * dt,
		player.z + player.vz * dt,
		2.1,
	);
	player.x = driven.x;
	player.z = driven.z;
	const pushed = repel(player.x, player.z, state.structures);
	player.x = clamp(pushed.x, -LIMIT, LIMIT);
	player.z = clamp(pushed.z, -LIMIT, LIMIT);
	hover(player, dt);
	player.yaw =
		speed > 7
			? dampAngle(player.yaw, Math.atan2(player.vx, player.vz), dt, 5)
			: dampAngle(player.yaw, state.aimYaw, dt, 3.2);

	player.gunCd = Math.max(0, player.gunCd - dt);
	player.missileCd = Math.max(0, player.missileCd - dt);
	player.overheat = Math.max(0, player.overheat - dt);
	player.heat = Math.max(0, player.heat - dt * (player.overheat > 0 ? 0.5 : 0.36));

	const lead = input.fire ? lockedAim(state) : null;
	const gunYaw = lead?.yaw ?? state.aimYaw;
	const gunPitch = lead?.pitch ?? state.aimPitch;
	if (input.fire && player.gunCd <= 0 && player.overheat <= 0) {
		const tip = tipAt(player.x, player.y, player.z, gunYaw, gunPitch, 3.2);
		fireShell(
			state,
			"isdf",
			tip.x,
			tip.y,
			tip.z,
			gunYaw,
			gunPitch,
			player.vx * 0.2,
			player.vz * 0.2,
			true,
			spec.damage,
		);
		player.gunCd = spec.rate;
		player.heat = Math.min(1, player.heat + 0.08 + spec.damage * 0.003);
		state.shake = Math.min(1, state.shake + 0.045);
		if (player.heat >= 1) {
			player.overheat = 1.15;
			say(state, "CANNON HOT", 1.1);
		}
	}

	if (input.missile && player.missileCd <= 0 && player.missiles > 0 && spec.missiles > 0) {
		const tip = tipAt(player.x, player.y, player.z, state.aimYaw, state.aimPitch, 2.5);
		const target =
			state.lockKind === "enemy"
				? state.lockIndex
				: state.lockKind === "relay" || state.lockKind === "citadel"
					? (state.structures[state.lockIndex]?.id ?? null)
					: null;
		state.shots.push({
			x: tip.x,
			y: tip.y,
			z: tip.z,
			px: tip.x,
			py: tip.y,
			pz: tip.z,
			vx: Math.sin(state.aimYaw) * Math.cos(state.aimPitch) * MISSILE_SPEED,
			vy: Math.sin(state.aimPitch) * MISSILE_SPEED,
			vz: Math.cos(state.aimYaw) * Math.cos(state.aimPitch) * MISSILE_SPEED,
			team: "isdf",
			missile: true,
			age: 0,
			life: 5,
			power: 0,
			skim: false,
			target,
		});
		state.sfx.missile += 1;
		player.missiles -= 1;
		player.missileCd = MISSILE_RATE;
	}
	mirrorRig(state);
}

function rallyPoint(state: Data, x: number, z: number): { x: number; z: number } {
	let bestX = CRATER.x;
	let bestZ = CRATER.z;
	let best = Math.hypot(bestX - x, bestZ - z);
	for (const structure of state.structures) {
		if (!structure.alive || !structure.placed) continue;
		if (structure.kind !== "relay" && structure.kind !== "citadel") continue;
		const dist = Math.hypot(structure.x - x, structure.z - z);
		if (dist < best) {
			best = dist;
			bestX = structure.x;
			bestZ = structure.z;
		}
	}
	return { x: bestX, z: bestZ };
}

type Contact = { x: number; y: number; z: number; vx: number; vz: number };

function acquireContact(state: Data, x: number, z: number, range: number): Contact | null {
	let best = range;
	let found: Contact | null = null;
	const consider = (cx: number, cy: number, cz: number, cvx: number, cvz: number) => {
		const dist = Math.hypot(cx - x, cz - z);
		if (dist >= best) return;
		best = dist;
		found = { x: cx, y: cy, z: cz, vx: cvx, vz: cvz };
	};
	if (state.player.hp > 0 && state.seat !== "rts") {
		consider(state.player.x, state.player.y, state.player.z, state.player.vx, state.player.vz);
	}
	for (const rig of state.rigs) {
		if (!rig.alive || rig.occupied) continue;
		consider(rig.x, rig.y, rig.z, rig.vx, rig.vz);
	}
	for (const structure of state.structures) {
		if (structure.kind !== "tower" || !structure.alive || !structure.placed) continue;
		consider(structure.x, structure.y + 2, structure.z, 0, 0);
	}
	return found;
}

function driveEnemy(state: Data, enemy: Enemy, dt: number) {
	if (!enemy.alive) return;
	const range = enemy.kind === "turret" ? 380 : 640;
	const contact = acquireContact(state, enemy.x, enemy.z, range);
	const player = contact ?? { x: enemy.homeX, y: enemy.y, z: enemy.homeZ, vx: 0, vz: 0 };
	const dist = contact ? Math.hypot(player.x - enemy.x, player.z - enemy.z) : range + 1;
	enemy.losIn -= dt;
	if (enemy.losIn <= 0) {
		enemy.losIn = 0.25;
		if (
			contact &&
			state.age > 2.5 &&
			dist < range &&
			lineOfSight(enemy.x, enemy.y + 2.2, enemy.z, player.x, player.y + 1.2, player.z)
		) {
			enemy.seen = 2.6;
		}
	}
	if (enemy.seen > 0) enemy.seen -= dt;
	const engaged = enemy.seen > 0 && contact !== null;
	const face = yawTo(enemy.x, enemy.z, player.x, player.z);

	if (enemy.kind === "turret") {
		hover(enemy, dt);
		if (!engaged) return;
		enemy.gunYaw = dampAngle(enemy.gunYaw, face, dt, 3);
		enemy.gunPitch = clamp((player.y - enemy.y) / Math.max(28, dist), -0.3, 0.4);
		enemy.cooldown -= dt;
		if (enemy.cooldown <= 0 && Math.abs(wrapAngle(face - enemy.gunYaw)) < 0.16) {
			const tip = tipAt(enemy.x, enemy.y, enemy.z, enemy.gunYaw, enemy.gunPitch, 2.3);
			fireShell(
				state,
				"scion",
				tip.x,
				tip.y,
				tip.z,
				enemy.gunYaw,
				enemy.gunPitch,
				0,
				0,
				dist < 420,
			);
			enemy.cooldown = 1.2;
		}
		return;
	}

	enemy.think -= dt;
	if (engaged) {
		const fleeing = enemy.hp < enemy.maxHp * 0.34;
		if (fleeing) {
			const rally = rallyPoint(state, enemy.x, enemy.z);
			enemy.goalX = rally.x;
			enemy.goalZ = rally.z;
		} else {
			const orbit = enemy.phase * Math.PI * 2 + state.age * 0.5;
			const crowded = state.enemies.some(
				(other) =>
					other !== enemy &&
					other.alive &&
					other.kind === "raider" &&
					Math.hypot(other.x - player.x, other.z - player.z) < dist - 24,
			);
			const radius = (dist < 46 ? dist + 36 : 64 + enemy.phase * 70) + (crowded ? 46 : 0);
			enemy.goalX = player.x + Math.cos(orbit) * radius;
			enemy.goalZ = player.z + Math.sin(orbit) * radius;
		}
		enemy.gunYaw = dampAngle(enemy.gunYaw, face, dt, 2.5);
		enemy.gunPitch = clamp((player.y - enemy.y) / Math.max(36, dist), -0.25, 0.35);
		enemy.cooldown -= dt;
		if (enemy.cooldown <= 0 && dist < 440 && Math.abs(wrapAngle(face - enemy.gunYaw)) < 0.2) {
			const flight = clamp(dist / SHELL_SPEED, 0, 2.4);
			const aim = yawTo(
				enemy.x,
				enemy.z,
				player.x + player.vx * flight,
				player.z + player.vz * flight,
			);
			const tip = tipAt(enemy.x, enemy.y, enemy.z, enemy.gunYaw, enemy.gunPitch, 2.7);
			fireShell(
				state,
				"scion",
				tip.x,
				tip.y,
				tip.z,
				aim,
				enemy.gunPitch,
				enemy.vx * 0.15,
				enemy.vz * 0.15,
				dist < 420,
			);
			enemy.cooldown = 1;
		}
	} else if (
		enemy.think <= 0 ||
		(enemy.x - enemy.goalX) ** 2 + (enemy.z - enemy.goalZ) ** 2 < 160
	) {
		const angle = enemy.phase * 10 + state.age * 0.35;
		const radius = 20 + enemy.phase * 80;
		enemy.goalX = enemy.homeX + Math.cos(angle) * radius;
		enemy.goalZ = enemy.homeZ + Math.sin(angle) * radius;
		enemy.think = 3.5 + enemy.phase * 3;
	}

	const desired = yawTo(enemy.x, enemy.z, enemy.goalX, enemy.goalZ);
	enemy.yaw = dampAngle(enemy.yaw, desired, dt, engaged ? 2.3 : 1.5);
	enemy.vx += Math.sin(enemy.yaw) * 38 * dt;
	enemy.vz += Math.cos(enemy.yaw) * 38 * dt;
	for (const geyser of GEYSERS) {
		const gx = enemy.x - geyser.x;
		const gz = enemy.z - geyser.z;
		const gap = Math.hypot(gx, gz);
		if (gap < 16 && gap > 0.1) {
			enemy.vx += (gx / gap) * 26 * dt;
			enemy.vz += (gz / gap) * 26 * dt;
		}
	}
	enemy.vx *= Math.exp(-1.5 * dt);
	enemy.vz *= Math.exp(-1.5 * dt);
	const speed = Math.hypot(enemy.vx, enemy.vz);
	const max = engaged ? 30 : 16;
	if (speed > max) {
		enemy.vx = (enemy.vx / speed) * max;
		enemy.vz = (enemy.vz / speed) * max;
	}
	const step = settle(enemy.x, enemy.z, enemy.x + enemy.vx * dt, enemy.z + enemy.vz * dt, 2);
	enemy.x = step.x;
	enemy.z = step.z;
	hover(enemy, dt);
	if (!engaged) enemy.gunYaw = dampAngle(enemy.gunYaw, enemy.yaw, dt, 2);
}

function pushGeyser(x: number, z: number, vx: number, vz: number, dt: number) {
	let nx = vx;
	let nz = vz;
	for (const geyser of GEYSERS) {
		const dx = x - geyser.x;
		const dz = z - geyser.z;
		const gap = Math.hypot(dx, dz);
		if (gap < 16 && gap > 0.1) {
			nx += (dx / gap) * 30 * dt;
			nz += (dz / gap) * 30 * dt;
		}
	}
	return { vx: nx, vz: nz };
}

function steerRig(
	rig: Rig,
	goalX: number,
	goalZ: number,
	dt: number,
	accel: number,
	maxSpeed: number,
) {
	const desired = yawTo(rig.x, rig.z, goalX, goalZ);
	rig.yaw = dampAngle(rig.yaw, desired, dt, 2.6);
	rig.vx += Math.sin(rig.yaw) * accel * dt;
	rig.vz += Math.cos(rig.yaw) * accel * dt;
	const pushed = pushGeyser(rig.x, rig.z, rig.vx, rig.vz, dt);
	rig.vx = pushed.vx * Math.exp(-1.5 * dt);
	rig.vz = pushed.vz * Math.exp(-1.5 * dt);
	const speed = Math.hypot(rig.vx, rig.vz);
	if (speed > maxSpeed) {
		rig.vx = (rig.vx / speed) * maxSpeed;
		rig.vz = (rig.vz / speed) * maxSpeed;
	}
	const step = settle(rig.x, rig.z, rig.x + rig.vx * dt, rig.z + rig.vz * dt, 2);
	rig.x = step.x;
	rig.z = step.z;
	hover(rig, dt);
}

function finishBuild(state: Data, rig: Rig) {
	const kind = rig.build;
	if (!kind) return;
	const slot = state.structures.find((item) => item.kind === kind && !item.placed);
	if (!slot) {
		state.scrap += BUILD_COST[kind];
		say(state, "NO ROOM", 1.4);
	} else {
		slot.x = rig.goalX;
		slot.z = rig.goalZ;
		slot.y = surface(rig.goalX, rig.goalZ);
		slot.placed = true;
		slot.alive = true;
		slot.hp = kind === "tower" ? 220 : 0;
		slot.maxHp = slot.hp;
		slot.team = "isdf";
		say(state, kind === "tower" ? "TOWER UP" : "SUPPLY UP", 1.8);
	}
	rig.order = "idle";
	rig.build = null;
	rig.buildT = 0;
}

function driveAllies(state: Data, dt: number) {
	const player = state.player;
	for (const rig of state.rigs) {
		if (!rig.alive || rig.occupied || rig.role === "pilot") continue;
		const spec = CHASSIS[rig.chassis];
		if (rig.role === "builder") {
			const dist = Math.hypot(rig.goalX - rig.x, rig.goalZ - rig.z);
			if (rig.order === "build" && dist < 7) {
				rig.vx *= Math.exp(-6 * dt);
				rig.vz *= Math.exp(-6 * dt);
				rig.buildT += dt / 6.5;
				hover(rig, dt);
				if (rig.buildT >= 1) finishBuild(state, rig);
				continue;
			}
			if (rig.order === "idle") {
				const pad = state.structures.find((item) => item.kind === "base");
				const side = rig.phase < 0.5 ? -1 : 1;
				rig.goalX = (pad?.x ?? START.x) + side * 20;
				rig.goalZ = (pad?.z ?? START.z) - 14;
			}
			const gap = Math.hypot(rig.goalX - rig.x, rig.goalZ - rig.z);
			if (gap > 8 && Math.hypot(rig.vx, rig.vz) < 1.4) rig.stuck += dt;
			else rig.stuck = 0;
			const slip = rig.stuck > 1.1 ? 18 : 0;
			steerRig(
				rig,
				rig.goalX + Math.cos(rig.phase * 8) * slip,
				rig.goalZ + Math.sin(rig.phase * 8) * slip,
				dt,
				36,
				spec.speed * 0.7,
			);
			continue;
		}

		let foe: Enemy | null = null;
		let foeDist = 520;
		for (const enemy of state.enemies) {
			if (!enemy.alive) continue;
			const dist = Math.hypot(enemy.x - rig.x, enemy.z - rig.z);
			if (dist < foeDist) {
				foeDist = dist;
				foe = enemy;
			}
		}
		rig.losIn -= dt;
		if (rig.losIn <= 0) {
			rig.losIn = 0.3;
			if (
				foe &&
				foeDist < 480 &&
				lineOfSight(rig.x, rig.y + 1.6, rig.z, foe.x, foe.y + 1.1, foe.z)
			) {
				rig.seen = 2.2;
			}
		}
		if (rig.seen > 0) rig.seen -= dt;
		const fighting = foe !== null && rig.seen > 0 && rig.hp > rig.maxHp * 0.28;
		if (fighting && foe) {
			const flank = rig.phase < 0.5 ? 1 : -1;
			const face = yawTo(foe.x, foe.z, player.x, player.z);
			rig.goalX = foe.x + Math.cos(face + flank * 1.2) * (52 + rig.phase * 24);
			rig.goalZ = foe.z + Math.sin(face + flank * 1.2) * (52 + rig.phase * 24);
			const flight = clamp(foeDist / SHELL_SPEED, 0, 2.4);
			const aim = yawTo(rig.x, rig.z, foe.x + foe.vx * flight, foe.z + foe.vz * flight);
			rig.gunYaw = dampAngle(rig.gunYaw, aim, dt, 3);
			rig.gunPitch = clamp((foe.y - rig.y) / Math.max(30, foeDist), -0.3, 0.35);
			rig.cooldown -= dt;
			if (rig.cooldown <= 0 && foeDist < 430 && Math.abs(wrapAngle(aim - rig.gunYaw)) < 0.22) {
				const tip = tipAt(rig.x, rig.y, rig.z, rig.gunYaw, rig.gunPitch, 2.6);
				fireShell(
					state,
					"isdf",
					tip.x,
					tip.y,
					tip.z,
					rig.gunYaw,
					rig.gunPitch,
					rig.vx * 0.15,
					rig.vz * 0.15,
					false,
					spec.damage,
				);
				rig.cooldown = spec.rate + 0.12;
			}
		} else {
			const side = rig.phase < 0.5 ? -1 : 1;
			const lead = rig.hp < rig.maxHp * 0.28 ? 6 : -14;
			rig.goalX = player.x - Math.cos(player.yaw) * 16 * side + Math.sin(player.yaw) * lead;
			rig.goalZ = player.z + Math.sin(player.yaw) * 16 * side + Math.cos(player.yaw) * lead;
			rig.gunYaw = dampAngle(rig.gunYaw, rig.yaw, dt, 2);
		}
		steerRig(
			rig,
			rig.goalX,
			rig.goalZ,
			dt,
			spec.accel * 0.85,
			fighting ? spec.speed : spec.speed * 0.82,
		);
		for (const other of state.rigs) {
			if (other === rig || !other.alive) continue;
			const dx = rig.x - other.x;
			const dz = rig.z - other.z;
			const gap = Math.hypot(dx, dz);
			if (gap > 8 || gap < 0.01) continue;
			rig.x += (dx / gap) * (8 - gap) * 0.35;
			rig.z += (dz / gap) * (8 - gap) * 0.35;
		}
	}
}

function runTowers(state: Data, dt: number) {
	for (const structure of state.structures) {
		if (structure.kind !== "tower" || !structure.placed || !structure.alive) continue;
		structure.gunCd -= dt;
		if (structure.gunCd > 0) continue;
		let foe: Enemy | null = null;
		let best = 360;
		for (const enemy of state.enemies) {
			if (!enemy.alive) continue;
			const dist = Math.hypot(enemy.x - structure.x, enemy.z - structure.z);
			if (dist < best) {
				best = dist;
				foe = enemy;
			}
		}
		if (!foe) continue;
		if (!lineOfSight(structure.x, structure.y + 3, structure.z, foe.x, foe.y + 1, foe.z)) continue;
		const yaw = yawTo(structure.x, structure.z, foe.x + foe.vx * 0.25, foe.z + foe.vz * 0.25);
		const pitch = clamp((foe.y - structure.y) / Math.max(24, best), -0.25, 0.4);
		const tip = tipAt(structure.x, structure.y + 1.4, structure.z, yaw, pitch, 1.6);
		fireShell(state, "isdf", tip.x, tip.y, tip.z, yaw, pitch, 0, 0, false, 16, 1.6);
		structure.gunCd = 0.72;
	}
}

function hurtRig(state: Data, rig: Rig, amount: number) {
	if (!rig.alive || amount <= 0) return;
	rig.hp -= amount;
	if (rig.hp > 0) return;
	rig.alive = false;
	rig.hp = 0;
	rig.vx = 0;
	rig.vz = 0;
	if (rig.order === "build" && rig.build) state.scrap += BUILD_COST[rig.build];
	rig.order = "idle";
	rig.build = null;
	addBlast(state, rig.x, rig.y + 1, rig.z, true);
	say(state, rig.role === "builder" ? "MASON LOST" : "WING LOST", 1.6);
}

function separate(state: Data) {
	const enemies = state.enemies;
	for (let i = 0; i < enemies.length; i++) {
		const a = enemies[i];
		if (!a.alive || a.kind !== "raider") continue;
		for (let j = i + 1; j < enemies.length; j++) {
			const b = enemies[j];
			if (!b.alive || b.kind !== "raider") continue;
			const dx = a.x - b.x;
			const dz = a.z - b.z;
			const distSq = dx * dx + dz * dz;
			if (distSq > 100 || distSq < 0.01) continue;
			const dist = Math.sqrt(distSq);
			const push = ((10 - dist) / dist) * 0.55;
			a.x += dx * push;
			a.z += dz * push;
			b.x -= dx * push;
			b.z -= dz * push;
		}
	}
	for (const enemy of enemies) {
		if (!enemy.alive) continue;
		const pushed = repel(enemy.x, enemy.z, state.structures);
		enemy.x = clamp(pushed.x, -LIMIT, LIMIT);
		enemy.z = clamp(pushed.z, -LIMIT, LIMIT);
	}
}

function missilePoint(
	state: Data,
	target: number | string | null,
): { x: number; y: number; z: number } | null {
	if (typeof target === "number") {
		const enemy = state.enemies[target];
		if (!enemy?.alive) return null;
		return { x: enemy.x, y: enemy.y + 1.3, z: enemy.z };
	}
	if (typeof target === "string") {
		const structure = state.structures.find((item) => item.id === target);
		if (!structure?.alive) return null;
		return { x: structure.x, y: structure.y + 9, z: structure.z };
	}
	return null;
}

function updateShots(state: Data, dt: number) {
	const keep: Shot[] = [];
	for (const shot of state.shots) {
		shot.age += dt;
		if (shot.age > shot.life) continue;
		shot.px = shot.x;
		shot.py = shot.y;
		shot.pz = shot.z;
		if (shot.missile) {
			const point = missilePoint(state, shot.target);
			if (point) {
				const dx = point.x - shot.x;
				const dy = point.y - shot.y;
				const dz = point.z - shot.z;
				const dist = Math.hypot(dx, dy, dz) || 1;
				const steer = Math.min(1, dt * 2.6);
				shot.vx += ((dx / dist) * MISSILE_SPEED - shot.vx) * steer;
				shot.vy += ((dy / dist) * MISSILE_SPEED - shot.vy) * steer;
				shot.vz += ((dz / dist) * MISSILE_SPEED - shot.vz) * steer;
				const speed = Math.hypot(shot.vx, shot.vy, shot.vz) || 1;
				shot.vx = (shot.vx / speed) * MISSILE_SPEED;
				shot.vy = (shot.vy / speed) * MISSILE_SPEED;
				shot.vz = (shot.vz / speed) * MISSILE_SPEED;
			}
		}
		shot.x += shot.vx * dt;
		shot.z += shot.vz * dt;
		if (shot.skim) {
			shot.y = surface(shot.x, shot.z) + 2.15 + Math.max(0, shot.vy) * shot.age * 0.22;
		} else {
			shot.y += shot.vy * dt;
		}

		let hit = false;
		if (shot.team === "scion") {
			const distSq = shotGap(shot, state.player.x, state.player.y + 1.1, state.player.z);
			if ((shot.skim ? distSq < 10 : distSq < 5.3) && state.seat !== "rts") {
				hurtPlayer(state, 12);
				addBlast(state, state.player.x, state.player.y + 1, state.player.z, false);
				hit = true;
			}
			if (!hit) {
				for (const rig of state.rigs) {
					if (!rig.alive || rig.occupied) continue;
					const reach = shot.skim ? 3.6 : rig.chassis === "anvil" ? 2.8 : 2.3;
					const gap = shotGap(shot, rig.x, rig.y + 1, rig.z);
					if (gap > reach * reach) continue;
					hurtRig(state, rig, 12);
					addBlast(state, rig.x, rig.y + 1, rig.z, false);
					hit = true;
					break;
				}
			}
			if (!hit) {
				for (const structure of state.structures) {
					if (structure.kind !== "tower" || !structure.alive || !structure.placed) continue;
					const gap = shotGap(shot, structure.x, structure.y + 2, structure.z);
					if (gap > (shot.skim ? 22 : 16)) continue;
					hurtStructure(state, structure, 14);
					addBlast(state, structure.x, structure.y + 2, structure.z, false);
					hit = true;
					break;
				}
			}
		} else {
			for (const enemy of state.enemies) {
				if (!enemy.alive) continue;
				const radius = (enemy.kind === "turret" ? 3.2 : 6.5) * (shot.skim ? 1 : 0.75);
				const distSq = shotGap(shot, enemy.x, enemy.y + 1.1, enemy.z);
				if (distSq > radius * radius) continue;
				if (shot.missile) splash(state, shot.x, shot.y, shot.z, 150);
				else hurtEnemy(state, enemy, shot.power);
				addBlast(state, enemy.x, enemy.y + 1.1, enemy.z, shot.missile);
				hit = true;
				break;
			}
			if (!hit) {
				for (const structure of state.structures) {
					if (!structure.alive || structure.maxHp <= 0 || structure.team === "isdf") continue;
					const radius = structure.kind === "citadel" ? 18 : shot.skim ? 8 : 6;
					const cy = structure.y + (structure.kind === "citadel" ? 11 : 6);
					const distSq = shotGap(shot, structure.x, cy, structure.z);
					if (distSq > radius * radius) continue;
					if (shot.missile) splash(state, shot.x, shot.y, shot.z, 160);
					else hurtStructure(state, structure, structure.kind === "citadel" ? 20 : 22);
					addBlast(state, shot.x, shot.y, shot.z, shot.missile);
					hit = true;
					break;
				}
			}
		}
		if (hit) continue;
		if (shot.skim) {
			const cover = gatherBlockers(shot.x, shot.z);
			for (let i = 0; i < cover; i++) {
				const solid = blockerAt(i);
				const reach = solid.radius + 0.6;
				if ((shot.x - solid.x) ** 2 + (shot.z - solid.z) ** 2 > reach * reach) continue;
				addBlast(state, shot.x, shot.y, shot.z, false);
				hit = true;
				break;
			}
		}
		if (hit) continue;
		if (!shot.skim && shot.y <= surface(shot.x, shot.z) + 0.25) {
			addBlast(state, shot.x, surface(shot.x, shot.z) + 0.3, shot.z, shot.missile);
			if (shot.missile && shot.team === "isdf") splash(state, shot.x, shot.y, shot.z, 150);
			continue;
		}
		keep.push(shot);
	}
	state.shots = keep;
}

function support(state: Data, dt: number) {
	const player = state.player;
	for (const geyser of GEYSERS) {
		if (Math.hypot(player.x - geyser.x, player.z - geyser.z) < 8) hurtPlayer(state, 22 * dt);
	}
	let onPad = false;
	for (const structure of state.structures) {
		if (structure.kind !== "supply" || !structure.placed) continue;
		structure.supplyCd = Math.max(0, structure.supplyCd - dt);
		if (Math.hypot(player.x - structure.x, player.z - structure.z) > 13) continue;
		onPad = true;
		player.hp = Math.min(MAX_HULL, player.hp + 20 * dt);
		if (player.missiles < MAX_MISSILES && structure.supplyCd <= 0) {
			player.missiles += 1;
			structure.supplyCd = 0.55;
		}
	}
	if (onPad && state.banner !== "SUPPLY") say(state, "SUPPLY", 1.2);

	state.spawnIn -= dt;
	if (state.spawnIn > 0 || state.won || state.mode !== "live") return;
	state.spawnIn = 28;
	const fort = state.structures.find((item) => item.kind === "citadel");
	if (!fort?.alive) return;
	const dead = state.enemies.find((enemy) => enemy.kind === "raider" && !enemy.alive);
	if (!dead) return;
	const relays = state.structures.filter((item) => item.kind === "relay" && item.alive);
	const origin = relays.length > 0 && dead.id % 2 === 0 ? relays[dead.id % relays.length] : fort;
	const angle = dead.phase * Math.PI * 2 + state.age;
	const radius = origin.kind === "citadel" ? 96 : 52;
	dead.x = origin.x + Math.cos(angle) * radius;
	dead.z = origin.z + Math.sin(angle) * radius;
	dead.y = surface(dead.x, dead.z) + 2;
	dead.vx = 0;
	dead.vz = 0;
	dead.hp = dead.maxHp;
	dead.alive = true;
	dead.seen = 0;
	dead.cooldown = 1;
	dead.homeX = dead.x;
	dead.homeZ = dead.z;
}

function decay(state: Data, dt: number) {
	state.age += dt;
	state.shake = Math.max(0, state.shake - dt * 1.8);
	state.hurt = Math.max(0, state.hurt - dt * 0.85);
	state.hitMark = Math.max(0, state.hitMark - dt * 2.6);
	state.bannerT = Math.max(0, state.bannerT - dt);
	if (state.bannerT <= 0) state.banner = "";
	for (let i = state.blasts.length - 1; i >= 0; i--) {
		const blast = state.blasts[i];
		blast.age += dt;
		if (blast.age >= blast.life) state.blasts.splice(i, 1);
	}
}

function leaveTank(state: Data) {
	const rig = state.rigs[state.ridden];
	if (rig) {
		rig.x = state.player.x;
		rig.y = state.player.y;
		rig.z = state.player.z;
		rig.yaw = state.player.yaw;
		rig.vx = 0;
		rig.vz = 0;
		rig.hp = state.player.hp;
		rig.occupied = false;
		rig.alive = state.player.hp > 0;
	}
	const yaw = state.player.yaw;
	state.player.x = clamp(state.player.x - Math.cos(yaw) * 4.5, -LIMIT, LIMIT);
	state.player.z = clamp(state.player.z + Math.sin(yaw) * 4.5, -LIMIT, LIMIT);
	state.player.vx = 0;
	state.player.vz = 0;
	state.player.y = surface(state.player.x, state.player.z);
	state.player.hp = state.bodyHp;
	state.hullMax = MAX_HULL;
	state.seat = "foot";
	say(state, "ON FOOT", 1.2);
}

function mountNearest(state: Data) {
	let best = -1;
	let dist = 7.5;
	for (let index = 0; index < state.rigs.length; index++) {
		const rig = state.rigs[index];
		if (!rig.alive || rig.occupied) continue;
		const gap = Math.hypot(rig.x - state.player.x, rig.z - state.player.z);
		if (gap < dist) {
			dist = gap;
			best = index;
		}
	}
	if (best < 0) {
		say(state, "NO TANK", 1);
		return;
	}
	const rig = state.rigs[best];
	state.bodyHp = state.player.hp;
	for (const other of state.rigs) other.occupied = false;
	rig.occupied = true;
	state.ridden = best;
	state.seat = "tank";
	state.player.x = rig.x;
	state.player.y = rig.y;
	state.player.z = rig.z;
	state.player.yaw = rig.yaw;
	state.player.vx = 0;
	state.player.vz = 0;
	state.player.hp = rig.hp;
	state.hullMax = rig.maxHp;
	state.player.missiles = Math.min(state.player.missiles, CHASSIS[rig.chassis].missiles);
	say(state, CHASSIS[rig.chassis].label, 1.2);
}

function nearestConsole(state: Data): { x: number; z: number } | null {
	let best: { x: number; z: number } | null = null;
	let dist = 80;
	const px = state.player.x;
	const pz = state.player.z;
	for (const structure of state.structures) {
		if (!structure.placed) continue;
		if (structure.kind === "base") {
			const doorX = structure.x - 14;
			const doorZ = structure.z + 18;
			const doorGap = Math.hypot(doorX - px, doorZ - pz);
			const padGap = Math.hypot(structure.x - px, structure.z - pz);
			if (doorGap < 20 || padGap < 48) {
				const gap = Math.min(doorGap, padGap);
				if (gap < dist) {
					dist = gap;
					best = { x: doorX, z: doorZ };
				}
			}
		} else if (structure.kind === "tower" && structure.alive) {
			const gap = Math.hypot(structure.x - px, structure.z - pz);
			if (gap < 16 && gap < dist) {
				dist = gap;
				best = { x: structure.x, z: structure.z };
			}
		}
	}
	return best;
}

function tankBeside(state: Data): number {
	let best = 99;
	for (const rig of state.rigs) {
		if (!rig.alive || rig.occupied) continue;
		best = Math.min(best, Math.hypot(rig.x - state.player.x, rig.z - state.player.z));
	}
	return best;
}

function enterConsole(state: Data, post: { x: number; z: number }) {
	if (state.seat === "tank") leaveTank(state);
	state.player.x = post.x;
	state.player.z = post.z;
	state.player.vx = 0;
	state.player.vz = 0;
	state.player.y = surface(post.x, post.z);
	state.seat = "rts";
	state.rtsX = post.x;
	state.rtsZ = post.z;
	say(state, "COMMAND", 1.6);
}

function siteOk(state: Data, x: number, z: number): boolean {
	if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return false;
	const lake = Math.hypot(x - CRATER.x, z - CRATER.z);
	if (lake > 200 && lake < 1080 && surface(x, z) <= WATER_Y + 0.05) return false;
	for (const structure of state.structures) {
		if (!structure.placed) continue;
		if (Math.hypot(structure.x - x, structure.z - z) < 20) return false;
	}
	return true;
}

export const useBattle = create<Data & Actions>((set, get) => ({
	...fresh(),

	launch: () => {
		const state = get();
		if (state.mode === "dead") {
			get().restart();
			return;
		}
		set({ mode: "live", mapOpen: false, age: 0 });
		say(get(), "NAV SET · CITADEL", 4.5);
	},

	restart: () => {
		set({ ...fresh(), mode: "live" });
		say(get(), "NAV SET · CITADEL", 4.5);
	},

	toggleMap: () => {
		const state = get();
		if (state.mode !== "live") return;
		set({ mapOpen: !state.mapOpen });
	},

	closeMap: () => {
		if (get().mapOpen) set({ mapOpen: false });
	},

	setNav: (x, z) => {
		const state = get();
		state.navX = clamp(x, -LIMIT, LIMIT);
		state.navZ = clamp(z, -LIMIT, LIMIT);
		say(state, "NAV BEACON", 1.6);
		set({ navX: state.navX, navZ: state.navZ });
	},

	toggleView: () => set({ view: get().view === "far" ? "near" : "far" }),

	pause: () => {
		if (get().mode !== "live") return;
		set({ mode: "paused", mapOpen: false });
	},

	resume: () => {
		if (get().mode === "paused") set({ mode: "live" });
	},

	interact: () => {
		const state = get();
		if (state.mode !== "live" || state.seat === "rts") return;
		const post = nearestConsole(state);
		if (post && !(state.seat === "foot" && tankBeside(state) < 6)) {
			enterConsole(state, post);
			set({ seat: "rts", ridden: state.ridden, hullMax: state.hullMax, bodyHp: state.bodyHp });
			return;
		}
		if (state.seat === "tank") leaveTank(state);
		else mountNearest(state);
		set({
			seat: state.seat,
			ridden: state.ridden,
			hullMax: state.hullMax,
			bodyHp: state.bodyHp,
		});
	},

	command: () => {
		const state = get();
		if (state.mode !== "live") return;
		if (state.seat === "rts") {
			state.seat = "foot";
			say(state, "ON FOOT", 1.2);
			set({ seat: "foot" });
			return;
		}
		const post = nearestConsole(state);
		if (!post) {
			say(state, "NO CONSOLE", 1.2);
			return;
		}
		enterConsole(state, post);
		set({ seat: "rts", ridden: state.ridden, hullMax: state.hullMax, bodyHp: state.bodyHp });
	},

	armBuild: (kind) => {
		const state = get();
		if (state.seat !== "rts") return;
		const next = state.arm === kind ? null : kind;
		say(state, next === "tower" ? "PLACE TOWER" : next === "supply" ? "PLACE SUPPLY" : "MOVE", 1.4);
		set({ arm: next });
	},

	selectBuilder: (index) => {
		const rig = get().rigs[index];
		if (!rig || rig.role !== "builder" || !rig.alive) return;
		say(get(), "MASON", 1);
		set({ selected: index });
	},

	commandAt: (x, z) => {
		const state = get();
		if (state.mode !== "live" || state.seat !== "rts") return;
		const px = clamp(x, -LIMIT, LIMIT);
		const pz = clamp(z, -LIMIT, LIMIT);
		let picked = -1;
		let near = 14;
		for (let index = 0; index < state.rigs.length; index++) {
			const rig = state.rigs[index];
			if (rig.role !== "builder" || !rig.alive) continue;
			const dist = Math.hypot(rig.x - px, rig.z - pz);
			if (dist < near) {
				near = dist;
				picked = index;
			}
		}
		if (picked >= 0 && state.arm === null) {
			say(state, "MASON", 1);
			set({ selected: picked });
			return;
		}
		const rig = state.rigs[state.selected];
		if (!rig || rig.role !== "builder" || !rig.alive || rig.occupied) {
			say(state, "SELECT A MASON", 1.2);
			return;
		}
		if (state.arm) {
			if (!siteOk(state, px, pz)) {
				say(state, "BAD GROUND", 1.2);
				return;
			}
			const cost = BUILD_COST[state.arm];
			if (state.scrap < cost) {
				say(state, "NEED SCRAP", 1.2);
				return;
			}
			const slot = state.structures.find((item) => item.kind === state.arm && !item.placed);
			if (!slot) {
				say(state, "NO ROOM", 1.2);
				return;
			}
			state.scrap -= cost;
			rig.order = "build";
			rig.build = state.arm;
			rig.goalX = px;
			rig.goalZ = pz;
			rig.buildT = 0;
			rig.stuck = 0;
			say(state, "BUILDING", 1.4);
			set({ scrap: state.scrap, arm: null });
			return;
		}
		rig.order = "move";
		rig.build = null;
		rig.goalX = px;
		rig.goalZ = pz;
		say(state, "MOVING", 1);
	},

	/**
	 * Physics mutates this store in place. set() runs only when React needs to
	 * hear about it (launch, death, the citadel, the map), so the frame loop
	 * does not reconcile the scene.
	 */
	step: (input, dt) => {
		const state = get();
		const stepDt = Math.min(0.05, Math.max(0, dt));
		if (state.mode !== "live") return;
		if (state.mapOpen) {
			decay(state, stepDt);
			return;
		}
		const won = state.won;
		const kills = state.kills;
		drivePlayer(state, input, stepDt);
		for (const enemy of state.enemies) driveEnemy(state, enemy, stepDt);
		driveAllies(state, stepDt);
		runTowers(state, stepDt);
		separate(state);
		updateLock(state);
		updateShots(state, stepDt);
		if (state.player.hp > 0) support(state, stepDt);
		decay(state, stepDt);
		if (state.player.hp <= 0)
			set({ mode: "dead", mapOpen: false, kills: state.kills, scrap: state.scrap });
		else if (!won && state.won) set({ won: true, kills: state.kills, scrap: state.scrap });
		else if (state.kills !== kills) set({ kills: state.kills, scrap: state.scrap });
	},
}));

export function nearCommand(): boolean {
	return nearestConsole(useBattle.getState()) !== null;
}
