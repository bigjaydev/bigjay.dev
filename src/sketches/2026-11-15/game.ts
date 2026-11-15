// Top-down rally. The car steers; guns fire at whatever is closest.
// Touching a zombie spends hull. Speed breaks the zombie and costs a little more paint.

export const ARENA_W = 3600;
export const ARENA_H = 2600;
export const CAR_R = 20;
export const MAX_LEVEL = 5;

export const OVAL = { x: ARENA_W / 2, y: ARENA_H / 2, rx: 920, ry: 560, road: 170 };

export type Mode = "ready" | "drive" | "wrecked";
export type WeaponId = "carbine" | "scatter" | "saw" | "rocket" | "flame" | "mine";
export type PickupKind = WeaponId | "repair";
export type ZombieKind = "walker" | "runner" | "brute";

export const WEAPONS: WeaponId[] = ["carbine", "scatter", "saw", "rocket", "flame", "mine"];

export const WEAPON_NAME: Record<WeaponId, string> = {
	carbine: "Carbine",
	scatter: "Scatter",
	saw: "Saws",
	rocket: "Rocket",
	flame: "Flame",
	mine: "Mines",
};

const ROMAN = ["", "I", "II", "III", "IV", "V"];

const KIND = {
	walker: { hp: 26, speed: 54, r: 13 },
	runner: { hp: 15, speed: 116, r: 10 },
	brute: { hp: 100, speed: 34, r: 19 },
} as const;

const BITE: Record<ZombieKind, number> = { walker: 8, runner: 6, brute: 17 };

export type Input = { throttle: number; steer: number };

export type Car = {
	x: number;
	y: number;
	angle: number;
	vx: number;
	vy: number;
	speed: number;
	steer: number;
	throttle: number;
	hp: number;
	maxHp: number;
	skidL: { x: number; y: number } | null;
	skidR: { x: number; y: number } | null;
};

export type Zombie = {
	x: number;
	y: number;
	kind: ZombieKind;
	hp: number;
	maxHp: number;
	speed: number;
	r: number;
	phase: number;
	bite: number;
	saw: number;
	burn: number;
	flash: number;
	alive: boolean;
};

export type Shot = {
	x: number;
	y: number;
	px: number;
	py: number;
	vx: number;
	vy: number;
	r: number;
	damage: number;
	life: number;
	kind: "bullet" | "pellet" | "rocket";
	pierce: number;
	blast: number;
};

export type Mine = {
	x: number;
	y: number;
	arm: number;
	life: number;
	blast: number;
	damage: number;
};

export type Pickup = { x: number; y: number; kind: PickupKind; born: number };

export type Prop = {
	x: number;
	y: number;
	r: number;
	rot: number;
	kind: "bale" | "wreck" | "barrel";
};

export type Decal = {
	x: number;
	y: number;
	x2: number;
	y2: number;
	rot: number;
	r: number;
	a: number;
	kind: "blood" | "skid" | "scorch" | "corpse";
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

export type Game = {
	mode: Mode;
	age: number;
	time: number;
	kills: number;
	car: Car;
	zombies: Zombie[];
	shots: Shot[];
	mines: Mine[];
	pickups: Pickup[];
	props: Prop[];
	decals: Decal[];
	particles: Particle[];
	floaters: Floater[];
	weapons: Record<WeaponId, number>;
	cool: Record<WeaponId, number>;
	shake: number;
	hurt: number;
	flame: number;
	flameAngle: number;
	spawn: number;
	nextHorde: number;
	drop: number;
	puff: number;
	rng: () => number;
};

export function levelLabel(id: WeaponId, level: number): string {
	return `${WEAPON_NAME[id]} ${ROMAN[level] ?? ""}`.trim();
}

export function sawBlades(game: Game): { x: number; y: number }[] {
	const level = game.weapons.saw;
	if (level <= 0) return [];
	const radius = 48 + level * 7;
	const spin = game.age * (2.15 + level * 0.12);
	const blades: { x: number; y: number }[] = [];
	for (let i = 0; i < level; i++) {
		const a = spin + (i * Math.PI * 2) / level;
		blades.push({
			x: game.car.x + Math.cos(a) * radius,
			y: game.car.y + Math.sin(a) * radius,
		});
	}
	return blades;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function wrap(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function mulberry32(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function emptyWeapons(): Record<WeaponId, number> {
	return { carbine: 0, scatter: 0, saw: 0, rocket: 0, flame: 0, mine: 0 };
}

function addDecal(game: Game, decal: Decal) {
	game.decals.push(decal);
	if (game.decals.length > 340) game.decals.splice(0, game.decals.length - 340);
}

function addParticle(game: Game, particle: Particle) {
	game.particles.push(particle);
	if (game.particles.length > 380) game.particles.splice(0, game.particles.length - 380);
}

function burst(
	game: Game,
	x: number,
	y: number,
	color: string,
	count: number,
	speed: number,
	life: number,
	size: number,
) {
	for (let i = 0; i < count; i++) {
		const angle = game.rng() * Math.PI * 2;
		const kick = speed * (0.35 + game.rng());
		const span = life * (0.55 + game.rng() * 0.7);
		addParticle(game, {
			x,
			y,
			vx: Math.cos(angle) * kick,
			vy: Math.sin(angle) * kick,
			life: span,
			max: span,
			size: size * (0.6 + game.rng()),
			color,
		});
	}
}

function floatText(game: Game, text: string) {
	game.floaters.push({
		x: game.car.x,
		y: game.car.y - 36 - game.floaters.length * 18,
		text,
		life: 1.2,
		max: 1.2,
	});
}

function blocked(game: Game, x: number, y: number, radius: number): boolean {
	return game.props.some((prop) => Math.hypot(prop.x - x, prop.y - y) < prop.r + radius);
}

function inside(x: number, y: number, pad: number): boolean {
	return x > pad && y > pad && x < ARENA_W - pad && y < ARENA_H - pad;
}

function makeZombie(game: Game, x: number, y: number, kind: ZombieKind): Zombie {
	const spec = KIND[kind];
	const grown = 1 + Math.min(0.4, game.time / 240);
	return {
		x,
		y,
		kind,
		hp: spec.hp * grown,
		maxHp: spec.hp * grown,
		speed: spec.speed * (1 + Math.min(0.32, game.time / 260)) * (0.9 + game.rng() * 0.22),
		r: spec.r,
		phase: game.rng() * Math.PI * 2,
		bite: 0,
		saw: 0,
		burn: 0,
		flash: 0,
		alive: true,
	};
}

function offerKind(game: Game): PickupKind {
	const open = WEAPONS.filter((id) => game.weapons[id] < MAX_LEVEL);
	const fresh = open.filter((id) => game.weapons[id] === 0);
	if (open.length === 0) return "repair";
	if (game.car.hp < 80 && game.rng() < 0.22) return "repair";
	const pool = fresh.length > 0 && game.rng() < 0.74 ? fresh : open;
	return pool[Math.floor(game.rng() * pool.length)] ?? "repair";
}

function spawnPickup(game: Game, x: number, y: number) {
	if (game.pickups.length >= 4) return;
	game.pickups.push({ x, y, kind: offerKind(game), born: game.age });
}

function tryDropAhead(game: Game): boolean {
	for (let attempt = 0; attempt < 10; attempt++) {
		const angle = game.rng() * Math.PI * 2;
		const dist = 280 + game.rng() * 460;
		const x = clamp(game.car.x + Math.cos(angle) * dist, 80, ARENA_W - 80);
		const y = clamp(game.car.y + Math.sin(angle) * dist, 80, ARENA_H - 80);
		if (Math.hypot(x - game.car.x, y - game.car.y) < 220) continue;
		if (blocked(game, x, y, 20)) continue;
		spawnPickup(game, x, y);
		return true;
	}
	return false;
}

function nearest(game: Game, x: number, y: number, maxDist: number): Zombie | null {
	let best: Zombie | null = null;
	let bestDist = maxDist;
	for (const zombie of game.zombies) {
		if (!zombie.alive) continue;
		const dist = Math.hypot(zombie.x - x, zombie.y - y);
		if (dist < bestDist) {
			best = zombie;
			bestDist = dist;
		}
	}
	return best;
}

function hurt(game: Game, zombie: Zombie, amount: number, knockX: number, knockY: number) {
	if (!zombie.alive || amount <= 0) return;
	zombie.hp -= amount;
	zombie.flash = 0.08;
	zombie.x += knockX;
	zombie.y += knockY;
	burst(game, zombie.x, zombie.y, "#7a2430", 3, 50, 0.28, 3);
	if (zombie.hp > 0) return;
	zombie.alive = false;
	game.kills += 1;
	addDecal(game, {
		x: zombie.x,
		y: zombie.y,
		x2: zombie.x,
		y2: zombie.y,
		rot: game.rng() * Math.PI,
		r: zombie.r * (0.85 + game.rng() * 0.4),
		a: 0.9,
		kind: "corpse",
	});
	for (let i = 0; i < 4; i++) {
		addDecal(game, {
			x: zombie.x + (game.rng() - 0.5) * zombie.r * 1.6,
			y: zombie.y + (game.rng() - 0.5) * zombie.r * 1.6,
			x2: 0,
			y2: 0,
			rot: game.rng() * Math.PI,
			r: 4 + game.rng() * 8,
			a: 0.75,
			kind: "blood",
		});
	}
	burst(game, zombie.x, zombie.y, "#7a2430", 8, 90, 0.4, 4);
	const chance = zombie.kind === "brute" ? 0.3 : zombie.kind === "runner" ? 0.12 : 0.055;
	if (game.rng() < chance) spawnPickup(game, zombie.x, zombie.y);
}

function blast(game: Game, x: number, y: number, radius: number, damage: number) {
	for (const zombie of game.zombies) {
		if (!zombie.alive) continue;
		const dx = zombie.x - x;
		const dy = zombie.y - y;
		const dist = Math.hypot(dx, dy);
		const reach = radius + zombie.r;
		if (dist > reach) continue;
		const falloff = 1 - dist / reach;
		const unit = dist > 0 ? dist : 1;
		hurt(
			game,
			zombie,
			damage * (0.45 + 0.55 * falloff),
			(dx / unit) * 16 * falloff,
			(dy / unit) * 16 * falloff,
		);
	}
	for (const mine of game.mines) {
		if (mine.life <= 0) continue;
		if (Math.hypot(mine.x - x, mine.y - y) > radius * 0.85) continue;
		detonate(game, mine);
	}
	addDecal(game, {
		x,
		y,
		x2: x,
		y2: y,
		rot: 0,
		r: radius * 0.55,
		a: 0.55,
		kind: "scorch",
	});
	burst(game, x, y, "#ffb25a", 14, 160, 0.45, 5);
	burst(game, x, y, "#2a2724", 8, 70, 0.7, 8);
	const dist = Math.hypot(game.car.x - x, game.car.y - y);
	const hear = radius + 240;
	if (dist < hear) game.shake = Math.min(18, game.shake + (1 - dist / hear) * 9);
}

function detonate(game: Game, mine: Mine) {
	if (mine.life <= 0) return;
	mine.life = 0;
	blast(game, mine.x, mine.y, mine.blast, mine.damage);
}

function crash(game: Game, impact: number) {
	if (impact < 140) return;
	game.car.hp -= (impact - 140) * 0.085;
	game.shake = Math.min(16, game.shake + impact / 30);
	game.hurt = 0.16;
	burst(game, game.car.x, game.car.y, "#e8e2d6", 6, 80, 0.3, 3);
}

function separate(zombies: Zombie[]) {
	for (let pass = 0; pass < 2; pass++) {
		for (let i = 0; i < zombies.length; i++) {
			const a = zombies[i];
			if (!a || !a.alive) continue;
			for (let j = i + 1; j < zombies.length; j++) {
				const b = zombies[j];
				if (!b || !b.alive) continue;
				let dx = b.x - a.x;
				let dy = b.y - a.y;
				const min = a.r + b.r;
				const dist2 = dx * dx + dy * dy;
				if (dist2 === 0) {
					a.x -= 1;
					continue;
				}
				if (dist2 >= min * min) continue;
				const dist = Math.sqrt(dist2);
				const push = (min - dist) / 2;
				dx /= dist;
				dy /= dist;
				a.x -= dx * push;
				a.y -= dy * push;
				b.x += dx * push;
				b.y += dy * push;
			}
		}
	}
}

function pushProps(game: Game, x: number, y: number, radius: number): { x: number; y: number } {
	let px = x;
	let py = y;
	for (const prop of game.props) {
		let dx = px - prop.x;
		let dy = py - prop.y;
		const min = radius + prop.r;
		const dist2 = dx * dx + dy * dy;
		if (dist2 >= min * min) continue;
		const dist = Math.sqrt(dist2) || 1;
		if (dist2 === 0) {
			dx = 1;
			dy = 0;
		}
		px = prop.x + (dx / dist) * min;
		py = prop.y + (dy / dist) * min;
	}
	return { x: px, y: py };
}

function placeProps(game: Game) {
	const kinds: Prop["kind"][] = ["wreck", "bale", "barrel", "bale", "wreck", "barrel"];
	for (let i = 0; i < 14; i++) {
		const kind = kinds[i % kinds.length] ?? "barrel";
		const radius = kind === "wreck" ? 22 : kind === "bale" ? 16 : 11;
		for (let attempt = 0; attempt < 12; attempt++) {
			const angle = game.rng() * Math.PI * 2;
			const cx = OVAL.x + Math.cos(angle) * OVAL.rx;
			const cy = OVAL.y + Math.sin(angle) * OVAL.ry;
			const radialX = Math.cos(angle) * OVAL.rx;
			const radialY = Math.sin(angle) * OVAL.ry;
			const mag = Math.hypot(radialX, radialY) || 1;
			const sign = game.rng() < 0.5 ? -1 : 1;
			const dist = 150 + game.rng() * 110;
			const x = cx + (radialX / mag) * dist * sign;
			const y = cy + (radialY / mag) * dist * sign;
			if (!inside(x, y, 70)) continue;
			if (Math.hypot(x - game.car.x, y - game.car.y) < 240) continue;
			if (game.props.some((prop) => Math.hypot(prop.x - x, prop.y - y) < prop.r + radius + 56))
				continue;
			game.props.push({ x, y, r: radius, rot: game.rng() * Math.PI, kind });
			break;
		}
	}
}

function placeRing(game: Game) {
	const plan: { kind: ZombieKind; dist: number }[] = [];
	for (let i = 0; i < 8; i++) plan.push({ kind: "walker", dist: 168 + (i % 4) * 28 });
	plan.push(
		{ kind: "runner", dist: 300 },
		{ kind: "runner", dist: 250 },
		{ kind: "walker", dist: 210 },
	);
	plan.forEach((item, index) => {
		const base = (index / plan.length) * Math.PI * 2;
		for (let attempt = 0; attempt < 8; attempt++) {
			const angle = base + (game.rng() - 0.5) * 0.6;
			const dist = item.dist + game.rng() * 24;
			const x = game.car.x + Math.cos(angle) * dist;
			const y = game.car.y + Math.sin(angle) * dist;
			if (!inside(x, y, 30) || blocked(game, x, y, 18)) continue;
			game.zombies.push(makeZombie(game, x, y, item.kind));
			return;
		}
		game.zombies.push(
			makeZombie(
				game,
				game.car.x + Math.cos(base) * item.dist,
				game.car.y + Math.sin(base) * item.dist,
				item.kind,
			),
		);
	});
	separate(game.zombies);
}

function rearWheels(car: Car): [{ x: number; y: number }, { x: number; y: number }] {
	const fx = Math.cos(car.angle);
	const fy = Math.sin(car.angle);
	const rx = -fy;
	const ry = fx;
	return [
		{ x: car.x - fx * 15 + rx * 11, y: car.y - fy * 15 + ry * 11 },
		{ x: car.x - fx * 15 - rx * 11, y: car.y - fy * 15 - ry * 11 },
	];
}

function stepCar(game: Game, input: Input, dt: number) {
	const car = game.car;
	const fx = Math.cos(car.angle);
	const fy = Math.sin(car.angle);
	const rx = -fy;
	const ry = fx;
	let forward = car.vx * fx + car.vy * fy;
	let side = car.vx * rx + car.vy * ry;

	if (input.throttle > 0) forward += 520 * input.throttle * dt;
	else if (input.throttle < 0) forward -= (forward > 24 ? 780 : 280) * dt;
	forward *= Math.exp(-0.32 * dt);
	if (input.throttle === 0 && forward !== 0) {
		const drop = 90 * dt;
		if (Math.abs(forward) <= drop) forward = 0;
		else forward -= Math.sign(forward) * drop;
	}
	forward = clamp(forward, -145, 305);

	const braking = input.throttle < 0 && forward > 30;
	const turnSlide = Math.abs(input.steer) * Math.min(1, Math.abs(forward) / 180);
	const grip = Math.max(
		0.8,
		(braking ? 1.45 : 6.4 - turnSlide * 3.4) / (1 + Math.abs(forward) / 520),
	);
	const slipping = Math.abs(side) > 36 || (braking && Math.abs(input.steer) > 0.25 && forward > 80);
	side *= Math.exp(-grip * dt);

	const speedFactor = clamp(Math.abs(forward) / 80, 0.18, 1);
	const steerSign = forward < -12 ? -1 : 1;
	car.angle += input.steer * 2.6 * speedFactor * steerSign * dt;

	const nfx = Math.cos(car.angle);
	const nfy = Math.sin(car.angle);
	car.vx = nfx * forward + -nfy * side;
	car.vy = nfy * forward + nfx * side;
	car.x += car.vx * dt;
	car.y += car.vy * dt;
	car.steer = input.steer;
	car.throttle = input.throttle;
	car.speed = Math.hypot(car.vx, car.vy);

	const pad = CAR_R + 14;
	if (car.x < pad) {
		crash(game, -car.vx);
		car.x = pad;
		car.vx = Math.max(0, car.vx);
	} else if (car.x > ARENA_W - pad) {
		crash(game, car.vx);
		car.x = ARENA_W - pad;
		car.vx = Math.min(0, car.vx);
	}
	if (car.y < pad) {
		crash(game, -car.vy);
		car.y = pad;
		car.vy = Math.max(0, car.vy);
	} else if (car.y > ARENA_H - pad) {
		crash(game, car.vy);
		car.y = ARENA_H - pad;
		car.vy = Math.min(0, car.vy);
	}

	for (const prop of game.props) {
		let dx = car.x - prop.x;
		let dy = car.y - prop.y;
		const min = CAR_R + prop.r;
		const dist2 = dx * dx + dy * dy;
		if (dist2 >= min * min) continue;
		const dist = Math.sqrt(dist2) || 1;
		if (dist2 === 0) {
			dx = 1;
			dy = 0;
		}
		const ux = dx / dist;
		const uy = dy / dist;
		car.x = prop.x + ux * min;
		car.y = prop.y + uy * min;
		const into = car.vx * ux + car.vy * uy;
		if (into < 0) {
			car.vx -= into * ux;
			car.vy -= into * uy;
			crash(game, -into);
		}
	}
	car.speed = Math.hypot(car.vx, car.vy);

	const [left, right] = rearWheels(car);
	if (slipping && car.speed > 50) {
		if (car.skidL && Math.hypot(left.x - car.skidL.x, left.y - car.skidL.y) < 28) {
			addDecal(game, {
				x: car.skidL.x,
				y: car.skidL.y,
				x2: left.x,
				y2: left.y,
				rot: car.angle,
				r: 2,
				a: 0.45,
				kind: "skid",
			});
		}
		if (car.skidR && Math.hypot(right.x - car.skidR.x, right.y - car.skidR.y) < 28) {
			addDecal(game, {
				x: car.skidR.x,
				y: car.skidR.y,
				x2: right.x,
				y2: right.y,
				rot: car.angle,
				r: 2,
				a: 0.45,
				kind: "skid",
			});
		}
		car.skidL = left;
		car.skidR = right;
		if (game.rng() < 0.4) {
			burst(game, left.x, left.y, "#6a5e4c", 1, 20, 0.25, 3);
		}
	} else {
		car.skidL = null;
		car.skidR = null;
	}
}

function stepZombies(game: Game, dt: number) {
	const car = game.car;
	for (const zombie of game.zombies) {
		if (!zombie.alive) continue;
		zombie.bite = Math.max(0, zombie.bite - dt);
		zombie.saw = Math.max(0, zombie.saw - dt);
		zombie.burn = Math.max(0, zombie.burn - dt);
		zombie.flash = Math.max(0, zombie.flash - dt);
		const dx = car.x - zombie.x;
		const dy = car.y - zombie.y;
		const dist = Math.hypot(dx, dy) || 1;
		const wobble = Math.sin(game.age * 2.4 + zombie.phase) * 0.45;
		let dirX = dx / dist - (dy / dist) * wobble;
		let dirY = dy / dist + (dx / dist) * wobble;
		const len = Math.hypot(dirX, dirY) || 1;
		dirX /= len;
		dirY /= len;
		zombie.x += dirX * zombie.speed * dt;
		zombie.y += dirY * zombie.speed * dt;
	}
	separate(game.zombies);
	for (const zombie of game.zombies) {
		if (!zombie.alive) continue;
		const next = pushProps(game, zombie.x, zombie.y, zombie.r);
		zombie.x = clamp(next.x, zombie.r + 8, ARENA_W - zombie.r - 8);
		zombie.y = clamp(next.y, zombie.r + 8, ARENA_H - zombie.r - 8);
	}
}

function collideCar(game: Game) {
	const car = game.car;
	for (const zombie of game.zombies) {
		if (!zombie.alive) continue;
		let dx = zombie.x - car.x;
		let dy = zombie.y - car.y;
		const min = CAR_R + zombie.r;
		const dist2 = dx * dx + dy * dy;
		if (dist2 >= min * min) continue;
		const dist = Math.sqrt(dist2) || 1;
		if (dist2 === 0) {
			dx = 1;
			dy = 0;
		}
		const ux = dx / dist;
		const uy = dy / dist;
		zombie.x = car.x + ux * (min + 1);
		zombie.y = car.y + uy * (min + 1);
		if (zombie.bite > 0) continue;
		zombie.bite = 0.4;
		const speed = car.speed;
		car.hp -= BITE[zombie.kind] * (0.62 + speed / 520);
		game.hurt = 0.14;
		game.shake = Math.min(14, game.shake + (zombie.kind === "brute" ? 6 : 3.5));
		const ram = speed > 90 ? speed * (zombie.kind === "brute" ? 0.055 : 0.125) : speed * 0.02;
		hurt(game, zombie, ram, ux * (8 + speed * 0.02), uy * (8 + speed * 0.02));
		burst(game, car.x + ux * CAR_R, car.y + uy * CAR_R, "#e8e2d6", 4, 70, 0.25, 3);
	}
}

function shoot(
	game: Game,
	x: number,
	y: number,
	angle: number,
	speed: number,
	life: number,
	damage: number,
	radius: number,
	kind: Shot["kind"],
	pierce: number,
	blastRadius: number,
) {
	if (game.shots.length > 90) return;
	game.shots.push({
		x,
		y,
		px: x,
		py: y,
		vx: Math.cos(angle) * speed,
		vy: Math.sin(angle) * speed,
		r: radius,
		damage,
		life,
		kind,
		pierce,
		blast: blastRadius,
	});
}

function fireCarbine(game: Game, level: number): boolean {
	const target = nearest(game, game.car.x, game.car.y, 520);
	if (!target) return false;
	const base = Math.atan2(target.y - game.car.y, target.x - game.car.x);
	const count = level >= 5 ? 3 : level >= 3 ? 2 : 1;
	for (let i = 0; i < count; i++) {
		const spread = (i - (count - 1) / 2) * 0.09;
		shoot(
			game,
			game.car.x,
			game.car.y,
			base + spread,
			720,
			0.85,
			13 + level,
			3.5,
			"bullet",
			level >= 5 ? 2 : level >= 4 ? 1 : 0,
			0,
		);
	}
	burst(game, game.car.x, game.car.y, "#ffe7b0", 2, 40, 0.08, 2);
	return true;
}

function fireScatter(game: Game, level: number): boolean {
	const target = nearest(game, game.car.x, game.car.y, 210);
	if (!target) return false;
	const base = Math.atan2(target.y - game.car.y, target.x - game.car.x);
	const count = 4 + level;
	for (let i = 0; i < count; i++) {
		const spread = (game.rng() - 0.5) * (0.7 - level * 0.04);
		shoot(
			game,
			game.car.x,
			game.car.y,
			base + spread,
			560,
			0.45,
			7 + level * 0.6,
			3,
			"pellet",
			0,
			0,
		);
	}
	burst(game, game.car.x, game.car.y, "#ffb25a", 4, 60, 0.1, 2);
	return true;
}

function fireRocket(game: Game, level: number): boolean {
	const target = nearest(game, game.car.x, game.car.y, 680);
	if (!target) return false;
	const base = Math.atan2(target.y - game.car.y, target.x - game.car.x);
	const count = level >= 4 ? 2 : 1;
	for (let i = 0; i < count; i++) {
		const spread = count === 1 ? 0 : i === 0 ? -0.18 : 0.18;
		shoot(
			game,
			game.car.x,
			game.car.y,
			base + spread,
			270,
			2.5,
			20 + level * 3,
			5,
			"rocket",
			0,
			52 + level * 8,
		);
	}
	return true;
}

function fireFlame(game: Game, level: number): boolean {
	const length = 120 + level * 18;
	const target = nearest(game, game.car.x, game.car.y, length);
	if (!target) return false;
	const angle = Math.atan2(target.y - game.car.y, target.x - game.car.x);
	game.flame = 0.12;
	game.flameAngle = angle;
	const half = 0.4 + level * 0.035;
	for (const zombie of game.zombies) {
		if (!zombie.alive || zombie.burn > 0) continue;
		const dx = zombie.x - game.car.x;
		const dy = zombie.y - game.car.y;
		const dist = Math.hypot(dx, dy);
		if (dist > length + zombie.r) continue;
		if (Math.abs(wrap(Math.atan2(dy, dx) - angle)) > half) continue;
		zombie.burn = 0.1;
		hurt(game, zombie, 5 + level * 0.8, (dx / (dist || 1)) * 2, (dy / (dist || 1)) * 2);
	}
	if (game.rng() < 0.8) {
		burst(
			game,
			game.car.x + Math.cos(angle) * 36,
			game.car.y + Math.sin(angle) * 36,
			"#ff7a32",
			3,
			80,
			0.22,
			4,
		);
	}
	return true;
}

function fireMine(game: Game, level: number): boolean {
	if (game.mines.length >= 8) return false;
	if (!nearest(game, game.car.x, game.car.y, 420)) return false;
	const fx = Math.cos(game.car.angle);
	const fy = Math.sin(game.car.angle);
	const x = game.car.x - fx * 26;
	const y = game.car.y - fy * 26;
	if (game.mines.some((mine) => mine.life > 0 && Math.hypot(mine.x - x, mine.y - y) < 28))
		return false;
	game.mines.push({
		x,
		y,
		arm: 0.35,
		life: 9,
		blast: 62 + level * 7,
		damage: 28 + level * 4,
	});
	return true;
}

function stepSaws(game: Game) {
	const level = game.weapons.saw;
	if (level <= 0) return;
	for (const blade of sawBlades(game)) {
		for (const zombie of game.zombies) {
			if (!zombie.alive || zombie.saw > 0) continue;
			if (Math.hypot(zombie.x - blade.x, zombie.y - blade.y) > zombie.r + 12) continue;
			zombie.saw = 0.16;
			const dx = zombie.x - game.car.x;
			const dy = zombie.y - game.car.y;
			const dist = Math.hypot(dx, dy) || 1;
			hurt(game, zombie, 14 + level * 2, (dx / dist) * 8, (dy / dist) * 8);
			burst(game, blade.x, blade.y, "#e8e2d6", 2, 40, 0.15, 2);
		}
	}
}

function cooldown(id: WeaponId, level: number): number {
	switch (id) {
		case "carbine":
			return Math.max(0.14, 0.34 - level * 0.028);
		case "scatter":
			return Math.max(0.5, 0.96 - level * 0.06);
		case "rocket":
			return Math.max(0.62, 1.4 - level * 0.1);
		case "flame":
			return 0.08;
		case "mine":
			return Math.max(0.42, 1.15 - level * 0.09);
		default:
			return 1;
	}
}

function trigger(game: Game, id: WeaponId, level: number): boolean {
	switch (id) {
		case "carbine":
			return fireCarbine(game, level);
		case "scatter":
			return fireScatter(game, level);
		case "rocket":
			return fireRocket(game, level);
		case "flame":
			return fireFlame(game, level);
		case "mine":
			return fireMine(game, level);
		default:
			return false;
	}
}

function stepWeapons(game: Game, dt: number) {
	for (const id of WEAPONS) {
		const level = game.weapons[id];
		if (level <= 0 || id === "saw") continue;
		game.cool[id] -= dt;
		if (game.cool[id] > 0) continue;
		if (!trigger(game, id, level)) continue;
		game.cool[id] = cooldown(id, level);
	}
	stepSaws(game);
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const abx = bx - ax;
	const aby = by - ay;
	const ab2 = abx * abx + aby * aby || 1;
	const t = clamp(((px - ax) * abx + (py - ay) * aby) / ab2, 0, 1);
	return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

function homeRocket(game: Game, shot: Shot, dt: number) {
	const target = nearest(game, shot.x, shot.y, 720);
	if (!target) return;
	const desired = Math.atan2(target.y - shot.y, target.x - shot.x);
	const current = Math.atan2(shot.vy, shot.vx);
	const delta = clamp(wrap(desired - current), -2.2 * dt, 2.2 * dt);
	const speed = Math.hypot(shot.vx, shot.vy);
	const angle = current + delta;
	shot.vx = Math.cos(angle) * speed;
	shot.vy = Math.sin(angle) * speed;
}

function stepShots(game: Game, dt: number) {
	for (const shot of game.shots) {
		if (shot.life <= 0) continue;
		if (shot.kind === "rocket") homeRocket(game, shot, dt);
		shot.px = shot.x;
		shot.py = shot.y;
		shot.x += shot.vx * dt;
		shot.y += shot.vy * dt;
		shot.life -= dt;
		if (shot.kind === "rocket" && game.rng() < 0.55) {
			addParticle(game, {
				x: shot.px,
				y: shot.py,
				vx: (game.rng() - 0.5) * 20,
				vy: (game.rng() - 0.5) * 20,
				life: 0.28,
				max: 0.28,
				size: 4,
				color: "#c9b8a4",
			});
		}

		const hits: { zombie: Zombie; dist: number }[] = [];
		for (const zombie of game.zombies) {
			if (!zombie.alive) continue;
			if (segDist(zombie.x, zombie.y, shot.px, shot.py, shot.x, shot.y) > zombie.r + shot.r)
				continue;
			hits.push({ zombie, dist: Math.hypot(zombie.x - shot.px, zombie.y - shot.py) });
		}
		hits.sort((a, b) => a.dist - b.dist);
		for (const hit of hits) {
			if (shot.life <= 0) break;
			if (shot.kind === "rocket") {
				shot.life = 0;
				blast(game, hit.zombie.x, hit.zombie.y, shot.blast, shot.damage);
				break;
			}
			const angle = Math.atan2(shot.vy, shot.vx);
			hurt(game, hit.zombie, shot.damage, Math.cos(angle) * 3, Math.sin(angle) * 3);
			if (shot.pierce <= 0) {
				shot.life = 0;
				break;
			}
			shot.pierce -= 1;
		}
		if (shot.life <= 0 && shot.kind === "rocket" && hits.length === 0) {
			blast(game, shot.x, shot.y, shot.blast, shot.damage * 0.85);
		}
	}
}

function stepMines(game: Game, dt: number) {
	for (const mine of game.mines) {
		if (mine.life <= 0) continue;
		if (mine.arm > 0) {
			mine.arm -= dt;
			continue;
		}
		mine.life -= dt;
		if (mine.life <= 0) {
			detonate(game, mine);
			continue;
		}
		for (const zombie of game.zombies) {
			if (!zombie.alive) continue;
			if (Math.hypot(zombie.x - mine.x, zombie.y - mine.y) > zombie.r + 12) continue;
			detonate(game, mine);
			break;
		}
	}
}

function collect(game: Game, pickup: Pickup) {
	if (pickup.kind === "repair") {
		game.car.hp = Math.min(game.car.maxHp, game.car.hp + 34);
		floatText(game, "Repaired");
		return;
	}
	const level = game.weapons[pickup.kind];
	if (level >= MAX_LEVEL) {
		game.car.hp = Math.min(game.car.maxHp, game.car.hp + 18);
		floatText(game, "Repaired");
		return;
	}
	game.weapons[pickup.kind] = level + 1;
	floatText(game, levelLabel(pickup.kind, level + 1));
}

function stepPickups(game: Game, dt: number) {
	game.drop -= dt;
	if (game.drop <= 0) {
		game.drop = tryDropAhead(game) ? 7.2 : 1.2;
	}
	const kept: Pickup[] = [];
	for (const pickup of game.pickups) {
		if (Math.hypot(pickup.x - game.car.x, pickup.y - game.car.y) <= CAR_R + 18)
			collect(game, pickup);
		else kept.push(pickup);
	}
	game.pickups = kept;
}

function spawnAround(game: Game, count: number, minDist: number, maxDist: number) {
	const limit = Math.min(160, 52 + Math.floor(game.time / 2));
	for (let i = 0; i < count && game.zombies.length < limit; i++) {
		const angle = game.rng() * Math.PI * 2;
		const dist = minDist + game.rng() * (maxDist - minDist);
		const x = clamp(game.car.x + Math.cos(angle) * dist, 40, ARENA_W - 40);
		const y = clamp(game.car.y + Math.sin(angle) * dist, 40, ARENA_H - 40);
		if (Math.hypot(x - game.car.x, y - game.car.y) < 240) continue;
		const roll = game.rng();
		const brute = game.time < 22 ? 0 : Math.min(0.2, (game.time - 22) / 280);
		const runner = Math.min(0.42, 0.1 + game.time / 150);
		const kind: ZombieKind = roll < brute ? "brute" : roll < brute + runner ? "runner" : "walker";
		game.zombies.push(makeZombie(game, x, y, kind));
	}
}

function stepSpawn(game: Game, dt: number) {
	game.spawn -= dt;
	if (game.spawn <= 0) {
		const count = 1 + Math.floor(game.time / 38);
		spawnAround(game, count, 430, 680);
		game.spawn = Math.max(0.24, 0.78 - game.time * 0.0055);
	}
	if (game.time >= game.nextHorde) {
		spawnAround(game, 8 + Math.floor(game.nextHorde / 28) * 3, 360, 620);
		floatText(game, "Horde");
		game.nextHorde += 28;
	}
	const keep: Zombie[] = [];
	for (const zombie of game.zombies) {
		if (!zombie.alive) continue;
		if (Math.hypot(zombie.x - game.car.x, zombie.y - game.car.y) > 1450) continue;
		keep.push(zombie);
	}
	game.zombies = keep;
}

function stepPuffs(game: Game, dt: number) {
	const car = game.car;
	let rate = 0;
	if (game.mode === "drive" && car.throttle > 0 && car.speed > 40) rate += 7;
	if (car.hp < car.maxHp * 0.62 || game.mode === "wrecked")
		rate += (1 - car.hp / car.maxHp) * 20 + 4;
	game.puff += rate * dt;
	const fx = Math.cos(car.angle);
	const fy = Math.sin(car.angle);
	while (game.puff > 1) {
		game.puff -= 1;
		const damaged = car.hp < car.maxHp * 0.62 || game.mode === "wrecked";
		addParticle(game, {
			x: car.x - fx * 18 + (game.rng() - 0.5) * 8,
			y: car.y - fy * 18 + (game.rng() - 0.5) * 8,
			vx: -fx * 16 + (game.rng() - 0.5) * 24,
			vy: -fy * 16 + (game.rng() - 0.5) * 24,
			life: damaged ? 0.85 : 0.32,
			max: damaged ? 0.85 : 0.32,
			size: damaged ? 8 : 3.5,
			color: damaged ? "#2c2824" : "#4a443c",
		});
	}
}

function reap(game: Game) {
	game.zombies = game.zombies.filter((zombie) => zombie.alive);
	game.shots = game.shots.filter((shot) => shot.life > 0);
	game.mines = game.mines.filter((mine) => mine.life > 0);
	game.particles = game.particles.filter((particle) => particle.life > 0);
	game.floaters = game.floaters.filter((item) => item.life > 0);
}

function wreck(game: Game) {
	game.mode = "wrecked";
	game.car.hp = 0;
	game.floaters.length = 0;
	game.shake = 16;
	game.hurt = 0.4;
	burst(game, game.car.x, game.car.y, "#ffb25a", 16, 140, 0.5, 5);
	burst(game, game.car.x, game.car.y, "#2c2824", 12, 50, 1, 9);
}

export function createGame(): Game {
	const game: Game = {
		mode: "ready",
		age: 0,
		time: 0,
		kills: 0,
		car: {
			x: OVAL.x,
			y: OVAL.y + OVAL.ry,
			angle: 0,
			vx: 0,
			vy: 0,
			speed: 0,
			steer: 0,
			throttle: 0,
			hp: 100,
			maxHp: 100,
			skidL: null,
			skidR: null,
		},
		zombies: [],
		shots: [],
		mines: [],
		pickups: [],
		props: [],
		decals: [],
		particles: [],
		floaters: [],
		weapons: { ...emptyWeapons(), carbine: 1 },
		cool: emptyWeapons(),
		shake: 0,
		hurt: 0,
		flame: 0,
		flameAngle: 0,
		spawn: 1.4,
		nextHorde: 28,
		drop: 5,
		puff: 0,
		rng: mulberry32(Math.floor(Math.random() * 1_000_000_000)),
	};
	placeProps(game);
	placeRing(game);
	return game;
}

export function stepGame(game: Game, input: Input, dt: number) {
	const step = Math.min(Math.max(dt, 0), 0.05);
	game.age += step;
	game.shake *= Math.exp(-step * 7);
	game.hurt = Math.max(0, game.hurt - step);
	game.flame = Math.max(0, game.flame - step);
	for (const particle of game.particles) {
		particle.life -= step;
		particle.x += particle.vx * step;
		particle.y += particle.vy * step;
		particle.vx *= Math.exp(-2.4 * step);
		particle.vy *= Math.exp(-2.4 * step);
	}
	for (const item of game.floaters) {
		item.life -= step;
		item.y -= 16 * step;
	}
	stepPuffs(game, step);

	if (game.mode === "ready") {
		reap(game);
		return;
	}
	if (game.mode === "wrecked") {
		game.car.vx *= Math.exp(-2.4 * step);
		game.car.vy *= Math.exp(-2.4 * step);
		game.car.x += game.car.vx * step;
		game.car.y += game.car.vy * step;
		game.car.speed = Math.hypot(game.car.vx, game.car.vy);
		stepZombies(game, step);
		reap(game);
		return;
	}

	game.time += step;
	stepCar(game, input, step);
	stepZombies(game, step);
	collideCar(game);
	if (game.car.hp <= 0) {
		wreck(game);
		reap(game);
		return;
	}
	stepWeapons(game, step);
	stepShots(game, step);
	stepMines(game, step);
	stepPickups(game, step);
	stepSpawn(game, step);
	if (game.car.hp <= 0) wreck(game);
	reap(game);
}
