// Top-down night city. On foot or in a stolen car, with a wanted level and payphone jobs.

import {
	CITY,
	ROADS_X,
	ROADS_Y,
	edselSpawns,
	type CarSpawn,
	type Point,
	type Solid,
	type Tree,
} from "./city";
import { missionById, type MissionId } from "./missions";

export const SPEECH_TIME = 4.2;
export const CARRY_SLOW = 0.08;

const FOOT_R = 12;
const FOOT_SPEED = 176;
const SPRINT_SPEED = 268;
const WANTED_MAX = 3;

type Drive = {
	accel: number;
	brake: number;
	drag: number;
	max: number;
	reverse: number;
	turn: number;
};

const DRIVE: Record<string, Drive> = {
	car: { accel: 540, brake: 760, drag: 360, max: 470, reverse: 170, turn: 2.55 },
	edsel: { accel: 250, brake: 520, drag: 280, max: 300, reverse: 110, turn: 1.85 },
	taxi: { accel: 280, brake: 400, drag: 240, max: 200, reverse: 80, turn: 2.1 },
	cop: { accel: 520, brake: 700, drag: 340, max: 440, reverse: 140, turn: 2.45 },
};

export type Mode = "ready" | "play" | "phone" | "busted";
export type Ai = "none" | "taxi" | "cop";
export type BoxState = "shop" | "carry" | "line";
export type LanderState = "hangar" | "carry" | "planted";
export type TapeState = "studio" | "carry" | "stage";

export type Input = { x: number; y: number; sprint: boolean; interact: boolean };

export type Car = {
	id: number;
	x: number;
	y: number;
	angle: number;
	speed: number;
	color: string;
	paint: CarSpawn["paint"];
	ai: Ai;
	edselIndex: number;
	path: Point[];
	pathI: number;
	pathDir: number;
	r: number;
	length: number;
	width: number;
	stolen: boolean;
	stuck: number;
	way: Point | null;
};

export type Ped = {
	x: number;
	y: number;
	axis: "x" | "y";
	min: number;
	max: number;
	dir: number;
	speed: number;
	color: string;
	down: number;
};

export type Particle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	max: number;
	size: number;
	color: string;
};

export type Floater = { x: number; y: number; text: string; life: number; max: number };
export type Skid = { x: number; y: number; x2: number; y2: number; a: number };
export type Cube = { x: number; y: number };

export type Game = {
	mode: Mode;
	age: number;
	player: { x: number; y: number; angle: number; vx: number; vy: number; carId: number | null };
	cars: Car[];
	peds: Ped[];
	nextId: number;
	wanted: number;
	heat: number;
	stealCd: number;
	hitCd: number;
	bustHold: number;
	bustT: number;
	cash: number;
	done: Record<MissionId, boolean>;
	active: MissionId | null;
	speech: number;
	crushed: boolean[];
	lander: LanderState;
	tape: TapeState;
	boxes: BoxState[];
	banner: string;
	bannerT: number;
	prompt: string;
	objective: string;
	near: string;
	shake: number;
	particles: Particle[];
	floaters: Floater[];
	skids: Skid[];
	cubes: Cube[];
	sfx: string[];
	copTimer: number;
	hintT: number;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function wrap(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function hypot(x: number, y: number): number {
	return Math.hypot(x, y);
}

export function distance(a: Point, b: Point): number {
	return hypot(a.x - b.x, a.y - b.y);
}

function carFrom(spawn: CarSpawn, id: number): Car {
	const edsel = spawn.paint === "edsel";
	const cop = spawn.paint === "cop";
	return {
		id,
		x: spawn.x,
		y: spawn.y,
		angle: spawn.angle,
		speed: 0,
		color: spawn.color,
		paint: spawn.paint,
		ai: spawn.ai,
		edselIndex: spawn.edselIndex,
		path: spawn.path.map((point) => ({ ...point })),
		pathI: 0,
		pathDir: 1,
		r: edsel ? 18 : cop ? 16 : 15,
		length: edsel ? 50 : cop ? 42 : 38,
		width: edsel ? 26 : 22,
		stolen: false,
		stuck: 0,
		way: null,
	};
}

export function createGame(): Game {
	const cars = CITY.cars.map((spawn, index) => carFrom(spawn, index + 1));
	const game: Game = {
		mode: "ready",
		age: 0,
		player: { x: CITY.start.x, y: CITY.start.y, angle: -Math.PI / 2, vx: 0, vy: 0, carId: null },
		cars,
		peds: CITY.peds.map((ped) => ({ ...ped, down: 0 })),
		nextId: cars.length + 1,
		wanted: 0,
		heat: 0,
		stealCd: 0,
		hitCd: 0,
		bustHold: 0,
		bustT: 0,
		cash: 0,
		done: { speech: false, edsel: false, apollo: false, tape: false, wii: false },
		active: null,
		speech: 0,
		crushed: [false, false, false],
		lander: "hangar",
		tape: "studio",
		boxes: ["shop", "shop", "shop"],
		banner: "",
		bannerT: 0,
		prompt: "",
		objective: "",
		near: "",
		shake: 0,
		particles: [],
		floaters: [],
		skids: [],
		cubes: [],
		sfx: [],
		copTimer: 0,
		hintT: 0,
	};
	freeBody(game.player, FOOT_R);
	return game;
}

export function jobsDone(game: Game): number {
	return Object.values(game.done).filter(Boolean).length;
}

export function carryCount(game: Game): number {
	let count = 0;
	if (game.lander === "carry") count += 1;
	if (game.tape === "carry") count += 1;
	count += game.boxes.filter((box) => box === "carry").length;
	return count;
}

export function driven(game: Game): Car | null {
	const id = game.player.carId;
	if (id == null) return null;
	return game.cars.find((car) => car.id === id) ?? null;
}

export function targetOf(game: Game): Point | null {
	switch (game.active) {
		case "speech":
			return CITY.podium;
		case "edsel": {
			const car = driven(game);
			if (car?.paint === "edsel" && !game.crushed[car.edselIndex]) return CITY.crusher;
			const next = game.cars.find(
				(item) => item.paint === "edsel" && !game.crushed[item.edselIndex],
			);
			return next ? { x: next.x, y: next.y } : CITY.crusher;
		}
		case "apollo":
			return game.lander === "carry" ? CITY.pad : CITY.crate;
		case "tape":
			return game.tape === "carry" ? CITY.stage : CITY.tape;
		case "wii": {
			const index = game.boxes.findIndex((box) => box === "shop");
			if (index >= 0) return CITY.boxes[index] ?? CITY.line;
			return CITY.line;
		}
		default:
			return null;
	}
}

export function startMission(game: Game, id: MissionId) {
	if (game.done[id]) return;
	if (game.active && game.active !== id) resetMission(game, game.active);
	game.active = id;
	resetMission(game, id);
	game.mode = "play";
	game.sfx.push("ring");
	const mission = missionById(id);
	say(game, game.player.x, game.player.y - 20, mission.title);
}

export function dropMission(game: Game) {
	if (!game.active) return;
	resetMission(game, game.active);
	game.active = null;
	game.mode = "play";
}

export function closePhone(game: Game) {
	if (game.mode === "phone") game.mode = "play";
}

function resetMission(game: Game, id: MissionId) {
	if (id === "speech") game.speech = 0;
	if (id === "edsel") {
		game.crushed = [false, false, false];
		game.cubes = [];
		const driving = driven(game);
		if (driving?.paint === "edsel") {
			game.player.carId = null;
			game.player.x = CITY.start.x;
			game.player.y = CITY.start.y;
		}
		game.cars = game.cars.filter((car) => car.paint !== "edsel");
		for (const spawn of edselSpawns()) {
			game.cars.push(carFrom(spawn, game.nextId));
			game.nextId += 1;
		}
	}
	if (id === "apollo") game.lander = "hangar";
	if (id === "tape") game.tape = "studio";
	if (id === "wii") game.boxes = ["shop", "shop", "shop"];
}

export function stepGame(game: Game, input: Input, dt: number) {
	const step = Math.min(dt, 0.033);
	game.age += step;
	game.shake = Math.max(0, game.shake - step * 10);
	game.bannerT = Math.max(0, game.bannerT - step);
	game.hintT = Math.max(0, game.hintT - step);
	if (game.bannerT === 0) game.banner = "";
	tickDecor(game, step);

	if (game.mode === "busted") {
		game.bustT -= step;
		if (game.bustT <= 0) finishBust(game);
		return;
	}
	if (game.mode !== "play") return;

	game.stealCd = Math.max(0, game.stealCd - step);
	game.hitCd = Math.max(0, game.hitCd - step);

	if (game.player.carId != null) drivePlayer(game, input, step);
	else walk(game, input, step);

	for (const car of game.cars) {
		if (car.id === game.player.carId) continue;
		if (car.ai === "taxi") stepTaxi(game, car, step);
		else if (car.ai === "cop") stepCop(game, car, step);
	}
	separateCars(game);
	stepPeds(game, step);
	stepWanted(game, step);
	stepMission(game, step);
	if (input.interact) tryInteract(game);
	refreshText(game);
}

function walk(game: Game, input: Input, dt: number) {
	const player = game.player;
	const mag = hypot(input.x, input.y);
	if (mag > 0.12) {
		const scale = Math.min(1, mag);
		const speed =
			(input.sprint ? SPRINT_SPEED : FOOT_SPEED) * scale * (1 - carryCount(game) * CARRY_SLOW);
		player.vx = (input.x / mag) * speed;
		player.vy = (input.y / mag) * speed;
		player.angle = Math.atan2(player.vy, player.vx);
	} else {
		player.vx = 0;
		player.vy = 0;
	}
	player.x += player.vx * dt;
	player.y += player.vy * dt;
	resolveCircle(player, FOOT_R, null);
	separateFromCars(player, FOOT_R, game, null);
}

function drivePlayer(game: Game, input: Input, dt: number) {
	const car = driven(game);
	if (!car) return;
	const spec = car.paint === "edsel" ? DRIVE.edsel : DRIVE.car;
	const throttle = clamp(-input.y, -1, 1);
	const steer = clamp(input.x, -1, 1);
	stepVehicle(car, throttle, steer, dt, spec);
	resolveCircle(car, car.r, car);
	game.player.x = car.x;
	game.player.y = car.y;
	game.player.angle = car.angle;
	game.player.vx = Math.cos(car.angle) * car.speed;
	game.player.vy = Math.sin(car.angle) * car.speed;
	if (Math.abs(steer) > 0.55 && Math.abs(car.speed) > 150) dropSkid(game, car);
	if (Math.abs(car.speed) > 80 && game.age % 0.08 < dt) puff(game, car.x, car.y, "#ffd0f2");
}

function stepVehicle(car: Car, throttle: number, steer: number, dt: number, spec: Drive) {
	if (throttle > 0) car.speed += throttle * spec.accel * dt;
	else if (throttle < 0) car.speed += throttle * spec.brake * dt;
	else {
		const drag = spec.drag * dt;
		if (Math.abs(car.speed) <= drag) car.speed = 0;
		else car.speed -= Math.sign(car.speed) * drag;
	}
	car.speed = clamp(car.speed, -spec.reverse, spec.max);
	const factor = clamp(Math.abs(car.speed) / 90, 0.22, 1);
	const reverse = car.speed < -8 ? -1 : 1;
	car.angle += steer * spec.turn * factor * reverse * dt;
	car.x += Math.cos(car.angle) * car.speed * dt;
	car.y += Math.sin(car.angle) * car.speed * dt;
}

function stepTaxi(game: Game, car: Car, dt: number) {
	if (car.path.length < 2) return;
	const target = car.path[car.pathI];
	if (!target) return;
	aimCar(game, car, target, dt, DRIVE.taxi, 26);
	if (distance(car, target) < 28) {
		const next = car.pathI + car.pathDir;
		if (next < 0 || next >= car.path.length) car.pathDir *= -1;
		car.pathI = clamp(car.pathI + car.pathDir, 0, car.path.length - 1);
	}
}

function nearestNode(point: Point): { c: number; r: number } {
	let c = 0;
	let r = 0;
	let best = Infinity;
	ROADS_X.forEach((x, column) => {
		ROADS_Y.forEach((y, row) => {
			const d = hypot(x - point.x, y - point.y);
			if (d < best) {
				best = d;
				c = column;
				r = row;
			}
		});
	});
	return { c, r };
}

function nextRoadNode(
	fromC: number,
	fromR: number,
	toC: number,
	toR: number,
): { c: number; r: number } {
	if (fromC === toC && fromR === toR) return { c: toC, r: toR };
	const cols = ROADS_X.length;
	const rows = ROADS_Y.length;
	const key = (c: number, r: number) => c + r * cols;
	const prev = new Map<number, number>();
	const queue: { c: number; r: number }[] = [{ c: fromC, r: fromR }];
	const seen = new Set<number>([key(fromC, fromR)]);
	let found = false;
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) break;
		if (current.c === toC && current.r === toR) {
			found = true;
			break;
		}
		const neighbors = [
			{ c: current.c + 1, r: current.r },
			{ c: current.c - 1, r: current.r },
			{ c: current.c, r: current.r + 1 },
			{ c: current.c, r: current.r - 1 },
		];
		for (const next of neighbors) {
			if (next.c < 0 || next.r < 0 || next.c >= cols || next.r >= rows) continue;
			const id = key(next.c, next.r);
			if (seen.has(id)) continue;
			seen.add(id);
			prev.set(id, key(current.c, current.r));
			queue.push(next);
		}
	}
	if (!found) return { c: toC, r: toR };
	let cursor = key(toC, toR);
	const start = key(fromC, fromR);
	while (prev.get(cursor) !== undefined && prev.get(cursor) !== start) {
		const parent = prev.get(cursor);
		if (parent === undefined) break;
		cursor = parent;
	}
	return { c: cursor % cols, r: Math.floor(cursor / cols) };
}

function copTarget(car: Car, body: Point): Point {
	const here = nearestNode(car);
	const goal = nearestNode(body);
	if (here.c === goal.c && here.r === goal.r) {
		car.way = null;
		return body;
	}
	if (car.way && distance(car, car.way) > 48) return car.way;
	const next = nextRoadNode(here.c, here.r, goal.c, goal.r);
	const x = ROADS_X[next.c];
	const y = ROADS_Y[next.r];
	if (x === undefined || y === undefined) return body;
	car.way = { x, y };
	return car.way;
}

function stepCop(game: Game, car: Car, dt: number) {
	const body = bodyPoint(game);
	const ahead = {
		x: body.x + game.player.vx * 0.25,
		y: body.y + game.player.vy * 0.25,
	};
	aimCar(game, car, copTarget(car, ahead), dt, DRIVE.cop, 36);
	if (Math.abs(car.speed) < 12) car.stuck += dt;
	else car.stuck = 0;
	if (car.stuck > 2.4) {
		const spot = copSpot(game);
		car.x = spot.x;
		car.y = spot.y;
		car.speed = 180;
		car.stuck = 0;
		car.way = null;
		car.angle = Math.atan2(body.y - spot.y, body.x - spot.x);
	}
	const reach = distance(car, body);
	if (reach < car.r + (game.player.carId ? 18 : FOOT_R) + 8) game.bustHold += dt;
}

function aimCar(game: Game, car: Car, target: Point, dt: number, spec: Drive, slow: number) {
	const dx = target.x - car.x;
	const dy = target.y - car.y;
	const desired = Math.atan2(dy, dx);
	const diff = wrap(desired - car.angle);
	const steer = clamp(diff / 0.55, -1, 1);
	const dist = hypot(dx, dy);
	let throttle = Math.abs(diff) > 1.15 ? 0.25 : 1;
	if (dist < slow) throttle = 0.2;
	const blocker = game.cars.find((other) => {
		if (other.id === car.id) return false;
		const ox = other.x - car.x;
		const oy = other.y - car.y;
		const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
		return ahead > 0 && ahead < 54 && hypot(ox, oy) < 40;
	});
	if (blocker) throttle = -0.4;
	stepVehicle(car, throttle, steer, dt, spec);
	resolveCircle(car, car.r, car);
}

function stepPeds(game: Game, dt: number) {
	const car = driven(game);
	for (const ped of game.peds) {
		if (ped.down > 0) {
			ped.down -= dt;
			continue;
		}
		const delta = ped.speed * ped.dir * dt;
		if (ped.axis === "x") {
			ped.x += delta;
			if (ped.x < ped.min || ped.x > ped.max) {
				ped.dir *= -1;
				ped.x = clamp(ped.x, ped.min, ped.max);
			}
		} else {
			ped.y += delta;
			if (ped.y < ped.min || ped.y > ped.max) {
				ped.dir *= -1;
				ped.y = clamp(ped.y, ped.min, ped.max);
			}
		}
		if (!car || Math.abs(car.speed) < 80) continue;
		if (hypot(ped.x - car.x, ped.y - car.y) > car.r + 12) continue;
		ped.down = 1.15;
		ped.x += Math.cos(car.angle) * 16;
		ped.y += Math.sin(car.angle) * 16;
		say(game, ped.x, ped.y, "Watch it!");
		if (game.hitCd <= 0) {
			game.wanted = Math.min(WANTED_MAX, game.wanted + 1);
			game.heat = 0;
			game.hitCd = 3;
		}
	}
}

function stepWanted(game: Game, dt: number) {
	const cops = game.cars.filter((car) => car.ai === "cop");
	if (game.wanted <= 0) {
		if (cops.length)
			game.cars = game.cars.filter((car) => car.ai !== "cop" || car.id === game.player.carId);
		game.bustHold = 0;
		return;
	}
	const body = bodyPoint(game);
	const nearest = cops.reduce((best, car) => Math.min(best, distance(car, body)), Infinity);
	if (nearest > 560) game.heat += dt;
	else game.heat = 0;
	if (game.heat > 7) {
		game.wanted -= 1;
		game.heat = 0;
		if (game.wanted <= 0) {
			game.cars = game.cars.filter((car) => car.ai !== "cop");
			game.bustHold = 0;
			return;
		}
	}
	game.copTimer -= dt;
	if (cops.length < game.wanted && game.copTimer <= 0) {
		spawnCop(game);
		game.copTimer = 1.1;
	}
	if (game.bustHold > 0.62) bust(game);
	else if (nearest > 48) game.bustHold = Math.max(0, game.bustHold - dt * 0.35);
}

function spawnCop(game: Game) {
	const spot = copSpot(game);
	const body = bodyPoint(game);
	const car = carFrom(
		{
			x: spot.x,
			y: spot.y,
			angle: Math.atan2(body.y - spot.y, body.x - spot.x),
			color: "#e8f4ff",
			paint: "cop",
			ai: "none",
			edselIndex: -1,
			path: [],
		},
		game.nextId,
	);
	game.nextId += 1;
	car.ai = "cop";
	car.speed = 160;
	game.cars.push(car);
}

function copSpot(game: Game): Point {
	const body = bodyPoint(game);
	let best: Point | null = null;
	let bestScore = -1;
	for (const x of [120, 760, 1400, 2040, 2680]) {
		for (const y of [120, 760, 1400, 2040]) {
			const d = hypot(x - body.x, y - body.y);
			if (d < 480) continue;
			const score = d > 1400 ? 1400 - d : d;
			if (score > bestScore) {
				bestScore = score;
				best = { x, y };
			}
		}
	}
	if (best) return best;
	return { x: body.x + 640, y: body.y };
}

function bust(game: Game) {
	const car = driven(game);
	if (car) {
		car.speed = 0;
		car.ai = "none";
		game.player.carId = null;
	}
	if (game.lander === "carry") game.lander = "hangar";
	if (game.tape === "carry") game.tape = "studio";
	game.boxes = game.boxes.map((box) => (box === "carry" ? "shop" : box));
	game.speech = 0;
	game.mode = "busted";
	game.bustT = 1.3;
	game.wanted = 0;
	game.heat = 0;
	game.bustHold = 0;
	game.cars = game.cars.filter((item) => item.ai !== "cop");
	game.shake = 10;
	game.sfx.push("bust");
}

function finishBust(game: Game) {
	game.player.x = CITY.respawn.x;
	game.player.y = CITY.respawn.y;
	game.player.vx = 0;
	game.player.vy = 0;
	game.player.carId = null;
	freeBody(game.player, FOOT_R);
	game.mode = "play";
	say(game, game.player.x, game.player.y - 24, "Back on the sidewalk.");
}

function stepMission(game: Game, dt: number) {
	const id = game.active;
	if (!id) return;
	const here = bodyPoint(game);
	const onFoot = game.player.carId == null;

	if (id === "speech") {
		const near = distance(here, CITY.podium) < 110;
		if (near && onFoot) game.speech = Math.min(SPEECH_TIME, game.speech + dt);
		else game.speech = Math.max(0, game.speech - dt * 0.4);
		if (distance(here, CITY.podium) < 150 && !onFoot && game.hintT <= 0) {
			say(game, here.x, here.y - 18, "Step out. It's a speech.");
			game.hintT = 2.2;
		}
		if (game.speech >= SPEECH_TIME) complete(game, id);
		return;
	}

	if (id === "edsel") {
		const car = driven(game);
		if (car?.paint === "edsel" && distance(car, CITY.crusher) < 84) crush(game, car);
		else if (car && car.paint !== "edsel" && distance(car, CITY.crusher) < 48 && game.hintT <= 0) {
			say(game, car.x, car.y - 20, "Not a lemon.");
			game.hintT = 1.8;
		}
		if (game.crushed.every(Boolean)) complete(game, id);
		return;
	}

	if (id === "apollo" && onFoot && game.lander === "carry" && distance(here, CITY.pad) < 42) {
		game.lander = "planted";
		complete(game, id);
	}
	if (id === "tape" && onFoot && game.tape === "carry" && distance(here, CITY.stage) < 42) {
		game.tape = "stage";
		complete(game, id);
	}
	if (id === "wii" && onFoot && distance(here, CITY.line) < 46) {
		let moved = false;
		game.boxes = game.boxes.map((box) => {
			if (box !== "carry") return box;
			moved = true;
			return "line";
		});
		if (moved) game.sfx.push("steal");
		if (game.boxes.every((box) => box === "line")) complete(game, id);
	}
}

function crush(game: Game, car: Car) {
	const index = car.edselIndex;
	if (index < 0 || game.crushed[index]) return;
	game.crushed[index] = true;
	game.cubes.push({ x: car.x, y: car.y });
	game.cars = game.cars.filter((item) => item.id !== car.id);
	game.player.carId = null;
	game.player.x = CITY.crusher.x;
	game.player.y = CITY.crusher.y + 70;
	game.player.vx = 0;
	game.player.vy = 0;
	freeBody(game.player, FOOT_R);
	game.shake = 7;
	game.sfx.push("crush");
	burst(game, car.x, car.y, "#f3e2b0");
	const left = game.crushed.filter((item) => !item).length;
	say(game, car.x, car.y - 16, left === 0 ? "That's the lot." : `${3 - left}/3 lemons`);
}

function complete(game: Game, id: MissionId) {
	const mission = missionById(id);
	game.done[id] = true;
	game.active = null;
	game.cash += mission.pay;
	game.banner = mission.done;
	game.bannerT = 4.8;
	game.sfx.push("job");
	game.shake = 4;
	say(game, game.player.x, game.player.y - 28, `+$${mission.pay}`);
}

function tryInteract(game: Game) {
	const player = game.player;
	if (player.carId != null) {
		exitCar(game);
		return;
	}
	if (takePickup(game)) return;
	const phone = nearestPhone(player);
	const car = nearestCar(game, player);
	if (phone && phone.d < 96 && (!car || phone.d <= car.d + 6)) {
		game.mode = "phone";
		game.sfx.push("ring");
		return;
	}
	if (car && car.d < 50) enterCar(game, car.car);
}

function takePickup(game: Game): boolean {
	const player = game.player;
	if (game.active === "apollo" && game.lander === "hangar" && distance(player, CITY.crate) < 40) {
		game.lander = "carry";
		game.sfx.push("steal");
		say(game, player.x, player.y - 18, "Lander in hand.");
		return true;
	}
	if (game.active === "tape" && game.tape === "studio" && distance(player, CITY.tape) < 40) {
		game.tape = "carry";
		game.sfx.push("steal");
		say(game, player.x, player.y - 18, "Got the tape.");
		return true;
	}
	if (game.active === "wii") {
		const index = game.boxes.findIndex(
			(box, i) => box === "shop" && distance(player, CITY.boxes[i]) < 36,
		);
		if (index >= 0) {
			game.boxes[index] = "carry";
			game.sfx.push("steal");
			const left = game.boxes.filter((box) => box === "shop").length;
			say(game, player.x, player.y - 18, left === 0 ? "Arms full." : "Box taken.");
			return true;
		}
	}
	return false;
}

function enterCar(game: Game, car: Car) {
	if (!car.stolen) {
		car.stolen = true;
		const bump = car.paint === "cop" ? 2 : 1;
		if (game.stealCd <= 0) {
			game.wanted = Math.min(WANTED_MAX, game.wanted + bump);
			game.stealCd = 6;
		} else game.wanted = Math.min(WANTED_MAX, Math.max(game.wanted, 1));
		game.heat = 0;
		game.sfx.push("steal");
	}
	if (car.ai !== "none") car.ai = "none";
	car.speed = Math.max(0, car.speed) * 0.45;
	game.bustHold = 0;
	game.player.carId = car.id;
	game.player.x = car.x;
	game.player.y = car.y;
}

function exitCar(game: Game) {
	const car = driven(game);
	if (!car) return;
	const options = [Math.PI / 2, -Math.PI / 2, Math.PI, 0];
	for (const extra of options) {
		const angle = car.angle + extra;
		const x = car.x + Math.cos(angle) * (car.r + 18);
		const y = car.y + Math.sin(angle) * (car.r + 18);
		if (!circleHits(x, y, FOOT_R, game, car.id)) {
			game.player.x = x;
			game.player.y = y;
			game.player.carId = null;
			game.player.vx = 0;
			game.player.vy = 0;
			car.speed = 0;
			return;
		}
	}
	game.player.carId = null;
	car.speed = 0;
}

function refreshText(game: Game) {
	const mission = game.active ? missionById(game.active) : null;
	game.objective = mission ? objectiveLine(game, mission.id) : "";
	game.prompt = "";
	game.near = "";
	const player = game.player;
	if (player.carId != null) {
		const car = driven(game);
		game.near = "car";
		if (game.active === "edsel" && car?.paint === "edsel")
			game.prompt = "Drive it into the crusher";
		else game.prompt = "Get out";
		return;
	}
	if (game.active === "apollo" && game.lander === "hangar" && distance(player, CITY.crate) < 40) {
		game.prompt = "Pick up the lander";
		game.near = "pickup";
		return;
	}
	if (game.active === "tape" && game.tape === "studio" && distance(player, CITY.tape) < 40) {
		game.prompt = "Pick up the tape";
		game.near = "pickup";
		return;
	}
	if (game.active === "wii") {
		const nearBox = game.boxes.some(
			(box, i) => box === "shop" && distance(player, CITY.boxes[i]) < 36,
		);
		if (nearBox) {
			game.prompt = "Pick up a box";
			game.near = "pickup";
			return;
		}
	}
	if (game.active === "speech" && distance(player, CITY.podium) < 130) {
		game.prompt = "Stay on the mark";
		game.near = "podium";
		return;
	}
	const phone = nearestPhone(player);
	const car = nearestCar(game, player);
	if (phone && phone.d < 96 && (!car || phone.d <= car.d + 6)) {
		game.prompt = "Answer the payphone";
		game.near = "phone";
		return;
	}
	if (car && car.d < 50) {
		game.prompt = car.car.paint === "edsel" ? "Take the lemon" : "Take the car";
		game.near = "car";
	}
}

function objectiveLine(game: Game, id: MissionId): string {
	if (id === "speech")
		return `Stand at the podium  ${Math.round((game.speech / SPEECH_TIME) * 100)}%`;
	if (id === "edsel") return `Crush the lemons  ${game.crushed.filter(Boolean).length}/3`;
	if (id === "apollo")
		return game.lander === "carry" ? "Plant the lander on the beach" : "Pick up the lander";
	if (id === "tape")
		return game.tape === "carry" ? "Deliver the tape to the stage" : "Pick up the tape";
	const have = game.boxes.filter((box) => box !== "shop").length;
	const delivered = game.boxes.filter((box) => box === "line").length;
	if (game.boxes.some((box) => box === "shop")) return `Collect the boxes  ${have}/3`;
	return `Deliver the boxes  ${delivered}/3`;
}

function nearestPhone(point: Point): { d: number } | null {
	let best = Infinity;
	for (const phone of CITY.phones) best = Math.min(best, distance(point, phone));
	return Number.isFinite(best) ? { d: best } : null;
}

function nearestCar(game: Game, point: Point): { d: number; car: Car } | null {
	let best: { d: number; car: Car } | null = null;
	for (const car of game.cars) {
		if (car.id === game.player.carId) continue;
		const d = distance(point, car) - car.r;
		if (!best || d < best.d) best = { d, car };
	}
	return best;
}

function bodyPoint(game: Game): Point {
	return { x: game.player.x, y: game.player.y };
}

function say(game: Game, x: number, y: number, text: string) {
	game.floaters.push({ x, y, text, life: 1.6, max: 1.6 });
	if (game.floaters.length > 8) game.floaters.splice(0, game.floaters.length - 8);
}

function puff(game: Game, x: number, y: number, color: string) {
	game.particles.push({
		x,
		y,
		vx: (Math.random() - 0.5) * 20,
		vy: (Math.random() - 0.5) * 20,
		life: 0.35,
		max: 0.35,
		size: 3,
		color,
	});
}

function burst(game: Game, x: number, y: number, color: string) {
	for (let i = 0; i < 16; i++) {
		const angle = (i / 16) * Math.PI * 2;
		game.particles.push({
			x,
			y,
			vx: Math.cos(angle) * (40 + Math.random() * 80),
			vy: Math.sin(angle) * (40 + Math.random() * 80),
			life: 0.5,
			max: 0.5,
			size: 3 + Math.random() * 3,
			color: i % 2 ? color : "#2de2ff",
		});
	}
}

function dropSkid(game: Game, car: Car) {
	const side = car.angle + Math.PI / 2;
	const ox = Math.cos(side) * (car.width * 0.38);
	const oy = Math.sin(side) * (car.width * 0.38);
	const back = -Math.cos(car.angle) * 8;
	const by = -Math.sin(car.angle) * 8;
	game.skids.push({
		x: car.x + ox + back,
		y: car.y + oy + by,
		x2: car.x - ox + back,
		y2: car.y - oy + by,
		a: 0.45,
	});
	if (game.skids.length > 90) game.skids.splice(0, game.skids.length - 90);
}

function tickDecor(game: Game, dt: number) {
	for (const particle of game.particles) {
		particle.life -= dt;
		particle.x += particle.vx * dt;
		particle.y += particle.vy * dt;
	}
	game.particles = game.particles.filter((particle) => particle.life > 0);
	if (game.particles.length > 80) game.particles.splice(0, game.particles.length - 80);
	for (const floater of game.floaters) floater.life -= dt;
	game.floaters = game.floaters.filter((floater) => floater.life > 0);
	for (const skid of game.skids) skid.a = Math.max(0, skid.a - dt * 0.035);
	if (game.skids.length > 20 && game.skids[0].a <= 0) game.skids.shift();
}

type Hit = { nx: number; ny: number; pen: number };

function circleRect(cx: number, cy: number, r: number, rect: Solid): Hit | null {
	const nearestX = clamp(cx, rect.x, rect.x + rect.w);
	const nearestY = clamp(cy, rect.y, rect.y + rect.h);
	let dx = cx - nearestX;
	let dy = cy - nearestY;
	const distSq = dx * dx + dy * dy;
	if (distSq > r * r) return null;
	if (distSq < 1e-6) {
		const left = cx - rect.x;
		const right = rect.x + rect.w - cx;
		const top = cy - rect.y;
		const bottom = rect.y + rect.h - cy;
		const min = Math.min(left, right, top, bottom);
		if (min === left) return { nx: -1, ny: 0, pen: r + left };
		if (min === right) return { nx: 1, ny: 0, pen: r + right };
		if (min === top) return { nx: 0, ny: -1, pen: r + top };
		return { nx: 0, ny: 1, pen: r + bottom };
	}
	const dist = Math.sqrt(distSq);
	return { nx: dx / dist, ny: dy / dist, pen: r - dist };
}

function resolveCircle(
	body: { x: number; y: number; speed?: number; angle?: number },
	r: number,
	car: Car | null,
) {
	let nx = 0;
	let ny = 0;
	let hit = false;
	for (let pass = 0; pass < 2; pass++) {
		for (const solid of CITY.solids) {
			const collision = circleRect(body.x, body.y, r, solid);
			if (!collision) continue;
			body.x += collision.nx * collision.pen;
			body.y += collision.ny * collision.pen;
			nx = collision.nx;
			ny = collision.ny;
			hit = true;
		}
		for (const tree of CITY.trees) {
			const pushed = pushCircle(body, r, tree);
			if (!pushed) continue;
			nx = pushed.nx;
			ny = pushed.ny;
			hit = true;
		}
	}
	if (hit && car && car.speed) dampSpeed(car, nx, ny);
}

function pushCircle(
	body: { x: number; y: number },
	r: number,
	tree: Tree,
): { nx: number; ny: number } | null {
	const dx = body.x - tree.x;
	const dy = body.y - tree.y;
	const dist = hypot(dx, dy);
	const min = r + tree.r;
	if (dist >= min) return null;
	if (dist < 1e-4) {
		body.x += min;
		return { nx: 1, ny: 0 };
	}
	const nx = dx / dist;
	const ny = dy / dist;
	const pen = min - dist;
	body.x += nx * pen;
	body.y += ny * pen;
	return { nx, ny };
}

function dampSpeed(car: Car, nx: number, ny: number) {
	const fx = Math.cos(car.angle);
	const fy = Math.sin(car.angle);
	const into = fx * nx + fy * ny;
	if (car.speed > 0 && into < 0) car.speed *= Math.max(0, 1 + into);
	if (car.speed < 0 && into > 0) car.speed *= Math.max(0, 1 - into);
}

function separateCars(game: Game) {
	const cars = game.cars;
	for (let i = 0; i < cars.length; i++) {
		for (let j = i + 1; j < cars.length; j++) {
			const a = cars[i];
			const b = cars[j];
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const dist = hypot(dx, dy);
			const min = a.r + b.r;
			if (dist >= min || dist < 1e-4) {
				if (dist < 1e-4) b.x += min;
				continue;
			}
			const pen = (min - dist) / 2;
			const nx = dx / dist;
			const ny = dy / dist;
			a.x -= nx * pen;
			a.y -= ny * pen;
			b.x += nx * pen;
			b.y += ny * pen;
			if (a.speed > 40 || b.speed > 40) {
				a.speed *= 0.72;
				b.speed *= 0.72;
			}
		}
	}
	const player = game.player;
	if (player.carId != null) {
		const car = driven(game);
		if (car) {
			player.x = car.x;
			player.y = car.y;
		}
	} else separateFromCars(player, FOOT_R, game, null);
}

function separateFromCars(
	body: { x: number; y: number },
	r: number,
	game: Game,
	ignore: number | null,
) {
	for (const car of game.cars) {
		if (car.id === ignore) continue;
		pushCircle(body, r, { x: car.x, y: car.y, r: car.r });
	}
}

function circleHits(x: number, y: number, r: number, game: Game, ignore: number | null): boolean {
	for (const solid of CITY.solids) {
		if (circleRect(x, y, r, solid)) return true;
	}
	for (const tree of CITY.trees) {
		if (hypot(x - tree.x, y - tree.y) < r + tree.r) return true;
	}
	for (const car of game.cars) {
		if (car.id === ignore) continue;
		if (hypot(x - car.x, y - car.y) < r + car.r) return true;
	}
	return false;
}

function freeBody(body: { x: number; y: number }, r: number) {
	for (let i = 0; i < 8; i++) {
		let moved = false;
		for (const solid of CITY.solids) {
			const hit = circleRect(body.x, body.y, r, solid);
			if (!hit) continue;
			body.x += hit.nx * hit.pen;
			body.y += hit.ny * hit.pen;
			moved = true;
		}
		if (!moved) break;
	}
}
