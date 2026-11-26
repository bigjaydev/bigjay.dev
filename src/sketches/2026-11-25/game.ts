export type Target = {
	id: number;
	x: number;
	y: number;
	r: number;
	vx: number;
	vy: number;
	born: number;
};

export type ShotFx = {
	id: number;
	x: number;
	y: number;
	hit: boolean;
	born: number;
};

export type GameState = {
	score: number;
	streak: number;
	best: number;
	shots: number;
	hits: number;
	target: Target;
	fx: ShotFx[];
	message: string;
};

let nextId = 1;

export function createGame(): GameState {
	return {
		score: 0,
		streak: 0,
		best: 0,
		shots: 0,
		hits: 0,
		target: spawnTarget(performance.now()),
		fx: [],
		message: "Arm, face center ~1s to zero, then say bang (or Space).",
	};
}

export function spawnTarget(now: number, preferAwayFrom?: { x: number; y: number }): Target {
	let x = 0.18 + Math.random() * 0.64;
	let y = 0.2 + Math.random() * 0.55;
	if (preferAwayFrom) {
		for (let i = 0; i < 6; i++) {
			const dx = x - preferAwayFrom.x;
			const dy = y - preferAwayFrom.y;
			if (dx * dx + dy * dy > 0.08) break;
			x = 0.18 + Math.random() * 0.64;
			y = 0.2 + Math.random() * 0.55;
		}
	}
	const speed = 0.025 + Math.random() * 0.045;
	const angle = Math.random() * Math.PI * 2;
	return {
		id: nextId++,
		x,
		y,
		r: 0.07 + Math.random() * 0.025,
		vx: Math.cos(angle) * speed,
		vy: Math.sin(angle) * speed,
		born: now,
	};
}

export function tickTarget(target: Target, dt: number): Target {
	let { x, y, vx, vy, r } = target;
	x += vx * dt;
	y += vy * dt;
	const pad = r + 0.04;
	if (x < pad) {
		x = pad;
		vx = Math.abs(vx);
	} else if (x > 1 - pad) {
		x = 1 - pad;
		vx = -Math.abs(vx);
	}
	if (y < pad + 0.08) {
		y = pad + 0.08;
		vy = Math.abs(vy);
	} else if (y > 1 - pad - 0.06) {
		y = 1 - pad - 0.06;
		vy = -Math.abs(vy);
	}
	return { ...target, x, y, vx, vy };
}

export function fireAt(
	state: GameState,
	aim: { x: number; y: number },
	now: number,
): GameState {
	const t = state.target;
	const dx = aim.x - t.x;
	const dy = aim.y - t.y;
	const dist = Math.hypot(dx, dy);
	const hit = dist <= t.r * 1.45;

	const fx: ShotFx = { id: nextId++, x: aim.x, y: aim.y, hit, born: now };
	const nextFx = [...state.fx.filter((f) => now - f.born < 700), fx].slice(-8);

	if (hit) {
		const streak = state.streak + 1;
		const bonus = Math.min(5, streak);
		const score = state.score + 10 * bonus;
		return {
			...state,
			score,
			streak,
			best: Math.max(state.best, streak),
			shots: state.shots + 1,
			hits: state.hits + 1,
			target: spawnTarget(now, aim),
			fx: nextFx,
			message: streak > 1 ? `Hit · ${streak}× streak` : "Hit",
		};
	}

	return {
		...state,
		streak: 0,
		shots: state.shots + 1,
		fx: nextFx,
		message: "Miss — keep your eyes on the mark",
	};
}
