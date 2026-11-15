import {
	ARENA_H,
	ARENA_W,
	OVAL,
	WEAPON_NAME,
	WEAPONS,
	levelLabel,
	sawBlades,
	type Floater,
	type Game,
	type Particle,
	type Pickup,
	type Prop,
	type Shot,
	type WeaponId,
	type Zombie,
} from "./game";

export const VIEW_H = 500;

export type Frame = {
	cssW: number;
	cssH: number;
	scale: number;
	x: number;
	y: number;
	shakeX: number;
	shakeY: number;
};

const INK = "#f4efe6";
const WEAPON_COLOR: Record<WeaponId, string> = {
	carbine: "#f0d78c",
	scatter: "#e8843a",
	saw: "#d5d8de",
	rocket: "#e25b3a",
	flame: "#ff7a32",
	mine: "#b7c77a",
};

function worldSize(frame: Frame) {
	return { w: frame.cssW / frame.scale, h: frame.cssH / frame.scale };
}

function inView(x: number, y: number, pad: number, frame: Frame): boolean {
	const size = worldSize(frame);
	return Math.abs(x - frame.x) < size.w / 2 + pad && Math.abs(y - frame.y) < size.h / 2 + pad;
}

function speck(ix: number, iy: number, n: number): number {
	let hash = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(n, 1440662683);
	hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
	return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function round(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

function drawGround(ctx: CanvasRenderingContext2D, frame: Frame) {
	ctx.fillStyle = "#241f1a";
	ctx.fillRect(0, 0, ARENA_W, ARENA_H);

	ctx.beginPath();
	ctx.ellipse(OVAL.x, OVAL.y, OVAL.rx, OVAL.ry, 0, 0, Math.PI * 2);
	ctx.lineWidth = OVAL.road;
	ctx.strokeStyle = "#3a3834";
	ctx.stroke();

	ctx.beginPath();
	ctx.ellipse(OVAL.x, OVAL.y, OVAL.rx - OVAL.road / 2, OVAL.ry - OVAL.road / 2, 0, 0, Math.PI * 2);
	ctx.fillStyle = "#2c2823";
	ctx.fill();

	ctx.beginPath();
	ctx.ellipse(OVAL.x, OVAL.y, OVAL.rx - OVAL.road / 2, OVAL.ry - OVAL.road / 2, 0, 0, Math.PI * 2);
	ctx.lineWidth = 3;
	ctx.strokeStyle = "rgba(232, 220, 196, 0.28)";
	ctx.stroke();
	ctx.beginPath();
	ctx.ellipse(OVAL.x, OVAL.y, OVAL.rx + OVAL.road / 2, OVAL.ry + OVAL.road / 2, 0, 0, Math.PI * 2);
	ctx.stroke();

	ctx.save();
	ctx.beginPath();
	ctx.ellipse(OVAL.x, OVAL.y, OVAL.rx, OVAL.ry, 0, 0, Math.PI * 2);
	ctx.setLineDash([26, 20]);
	ctx.lineWidth = 2.5;
	ctx.strokeStyle = "rgba(244, 239, 230, 0.32)";
	ctx.stroke();
	ctx.restore();

	const size = worldSize(frame);
	const left = frame.x - size.w / 2;
	const top = frame.y - size.h / 2;
	const cell = 72;
	const x0 = Math.max(0, Math.floor(left / cell));
	const x1 = Math.min(Math.floor(ARENA_W / cell), Math.floor((left + size.w) / cell));
	const y0 = Math.max(0, Math.floor(top / cell));
	const y1 = Math.min(Math.floor(ARENA_H / cell), Math.floor((top + size.h) / cell));
	for (let ix = x0; ix <= x1; ix++) {
		for (let iy = y0; iy <= y1; iy++) {
			for (let n = 0; n < 3; n++) {
				const x = ix * cell + speck(ix, iy, n) * cell;
				const y = iy * cell + speck(ix, iy, n + 3) * cell;
				ctx.fillStyle = "rgba(255, 244, 220, 0.04)";
				ctx.beginPath();
				ctx.arc(x, y, 1.3, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	const cells = 8;
	const cellH = OVAL.road / cells;
	const stripX = OVAL.x - 8;
	const stripY = OVAL.y + OVAL.ry - OVAL.road / 2;
	for (let i = 0; i < cells; i++) {
		ctx.fillStyle = i % 2 === 0 ? "#ece6dc" : "#262320";
		ctx.fillRect(stripX, stripY + i * cellH, 16, cellH + 0.5);
	}
}

function drawFence(ctx: CanvasRenderingContext2D) {
	ctx.strokeStyle = "#6d6458";
	ctx.lineWidth = 3;
	ctx.strokeRect(16, 16, ARENA_W - 32, ARENA_H - 32);
	ctx.strokeRect(26, 26, ARENA_W - 52, ARENA_H - 52);
	ctx.fillStyle = "#4a433b";
	const step = 84;
	for (let x = 16; x <= ARENA_W - 16; x += step) {
		ctx.fillRect(x - 3, 12, 6, 22);
		ctx.fillRect(x - 3, ARENA_H - 34, 6, 22);
	}
	for (let y = 16; y <= ARENA_H - 16; y += step) {
		ctx.fillRect(12, y - 3, 22, 6);
		ctx.fillRect(ARENA_W - 34, y - 3, 22, 6);
	}
}

function drawDecals(ctx: CanvasRenderingContext2D, game: Game, frame: Frame) {
	for (const decal of game.decals) {
		if (!inView(decal.x, decal.y, 40, frame)) continue;
		ctx.save();
		if (decal.kind === "skid") {
			ctx.strokeStyle = `rgba(18, 16, 14, ${decal.a})`;
			ctx.lineWidth = 3;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(decal.x, decal.y);
			ctx.lineTo(decal.x2, decal.y2);
			ctx.stroke();
		} else if (decal.kind === "scorch") {
			ctx.fillStyle = `rgba(18, 14, 12, ${decal.a})`;
			ctx.beginPath();
			ctx.ellipse(decal.x, decal.y, decal.r, decal.r * 0.72, decal.rot, 0, Math.PI * 2);
			ctx.fill();
		} else if (decal.kind === "corpse") {
			ctx.translate(decal.x, decal.y);
			ctx.rotate(decal.rot);
			ctx.fillStyle = `rgba(58, 62, 40, ${decal.a})`;
			ctx.beginPath();
			ctx.ellipse(0, 0, decal.r * 1.1, decal.r * 0.62, 0, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.translate(decal.x, decal.y);
			ctx.rotate(decal.rot);
			ctx.fillStyle = `rgba(122, 36, 48, ${decal.a})`;
			ctx.beginPath();
			ctx.ellipse(0, 0, decal.r, decal.r * 0.62, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}
}

function drawProp(ctx: CanvasRenderingContext2D, prop: Prop) {
	ctx.save();
	ctx.translate(prop.x, prop.y);
	ctx.rotate(prop.rot);
	if (prop.kind === "bale") {
		ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
		ctx.beginPath();
		ctx.ellipse(3, 4, prop.r, prop.r * 0.45, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "#c6a15a";
		round(ctx, -prop.r, -prop.r * 0.62, prop.r * 2, prop.r * 1.24, 4);
		ctx.fill();
		ctx.fillStyle = "#8d6a32";
		ctx.fillRect(-prop.r, -2, prop.r * 2, 3);
	} else if (prop.kind === "barrel") {
		ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
		ctx.beginPath();
		ctx.ellipse(2, 3, prop.r, prop.r * 0.45, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "#6e4a32";
		ctx.beginPath();
		ctx.arc(0, 0, prop.r, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = "#3a291c";
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(0, 0, prop.r * 0.55, 0, Math.PI * 2);
		ctx.stroke();
	} else {
		ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
		ctx.beginPath();
		ctx.ellipse(4, 6, 20, 10, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "#2a2422";
		ctx.beginPath();
		ctx.moveTo(-18, -8);
		ctx.lineTo(10, -8);
		ctx.lineTo(18, -3);
		ctx.lineTo(18, 3);
		ctx.lineTo(10, 8);
		ctx.lineTo(-18, 8);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = "#161311";
		ctx.fillRect(-2, -5, 10, 10);
	}
	ctx.restore();
}

function drawMine(ctx: CanvasRenderingContext2D, game: Game, x: number, y: number, arm: number) {
	ctx.fillStyle = "#211c18";
	ctx.beginPath();
	ctx.arc(x, y, 8, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = "#6d6458";
	ctx.lineWidth = 2;
	ctx.stroke();
	const armed = arm <= 0;
	ctx.fillStyle = armed && Math.sin(game.age * 12) > 0 ? "#e25b3a" : "#f0d78c";
	ctx.beginPath();
	ctx.arc(x, y, 2.4, 0, Math.PI * 2);
	ctx.fill();
}

function glyph(ctx: CanvasRenderingContext2D, kind: Pickup["kind"], x: number, y: number) {
	ctx.save();
	ctx.translate(x, y);
	ctx.strokeStyle = "#1c1917";
	ctx.fillStyle = "#1c1917";
	ctx.lineWidth = 1.6;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	if (kind === "repair") {
		ctx.fillRect(-1.4, -6, 2.8, 12);
		ctx.fillRect(-6, -1.4, 12, 2.8);
	} else if (kind === "carbine") {
		ctx.beginPath();
		ctx.moveTo(-7, 1);
		ctx.lineTo(6, -2);
		ctx.lineTo(6, 2);
		ctx.closePath();
		ctx.fill();
		ctx.fillRect(-7, -1, 4, 5);
	} else if (kind === "scatter") {
		ctx.beginPath();
		ctx.moveTo(-5, 0);
		ctx.lineTo(7, -5);
		ctx.moveTo(-5, 0);
		ctx.lineTo(8, 0);
		ctx.moveTo(-5, 0);
		ctx.lineTo(7, 5);
		ctx.stroke();
	} else if (kind === "saw") {
		ctx.beginPath();
		ctx.arc(0, 0, 5, 0, Math.PI * 2);
		ctx.stroke();
		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			ctx.beginPath();
			ctx.moveTo(Math.cos(angle) * 5, Math.sin(angle) * 5);
			ctx.lineTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
			ctx.stroke();
		}
	} else if (kind === "rocket") {
		ctx.beginPath();
		ctx.moveTo(8, 0);
		ctx.lineTo(-5, -4);
		ctx.lineTo(-2, 0);
		ctx.lineTo(-5, 4);
		ctx.closePath();
		ctx.fill();
	} else if (kind === "flame") {
		ctx.beginPath();
		ctx.moveTo(0, -7);
		ctx.quadraticCurveTo(6, -1, 0, 7);
		ctx.quadraticCurveTo(-6, -1, 0, -7);
		ctx.fill();
	} else {
		ctx.beginPath();
		ctx.arc(0, 0, 5, 0, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawPickup(ctx: CanvasRenderingContext2D, game: Game, pickup: Pickup) {
	const bob = Math.sin(game.age * 3 + pickup.born) * 4;
	const y = pickup.y + bob;
	const color = pickup.kind === "repair" ? "#9dcea0" : WEAPON_COLOR[pickup.kind];
	ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
	ctx.beginPath();
	ctx.ellipse(pickup.x, pickup.y + 12, 12, 5, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(pickup.x, y, 13, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = INK;
	ctx.lineWidth = 1.5;
	ctx.stroke();
	glyph(ctx, pickup.kind, pickup.x, y);
	ctx.font = "600 15px Inter, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "bottom";
	ctx.lineWidth = 3;
	ctx.strokeStyle = "rgba(16, 14, 12, 0.8)";
	ctx.fillStyle = INK;
	const name = pickup.kind === "repair" ? "Repair" : WEAPON_NAME[pickup.kind];
	ctx.strokeText(name, pickup.x, y - 16);
	ctx.fillText(name, pickup.x, y - 16);
}

function drawZombie(ctx: CanvasRenderingContext2D, game: Game, zombie: Zombie) {
	const angle = Math.atan2(game.car.y - zombie.y, game.car.x - zombie.x);
	const bob = Math.sin(game.age * (zombie.kind === "runner" ? 14 : 8) + zombie.phase);
	const reach = game.mode === "drive" ? 4 + bob * 3 : 3;
	ctx.save();
	ctx.translate(zombie.x, zombie.y + bob);
	ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
	ctx.beginPath();
	ctx.ellipse(2, zombie.r * 0.2, zombie.r * 0.9, zombie.r * 0.38, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.rotate(angle);
	const body =
		zombie.kind === "brute" ? "#74604a" : zombie.kind === "runner" ? "#c2b15a" : "#83944f";
	const dark =
		zombie.kind === "brute" ? "#3e342c" : zombie.kind === "runner" ? "#6d6230" : "#3f4a28";
	ctx.fillStyle = zombie.flash > 0 ? "#f4efe6" : dark;
	ctx.beginPath();
	ctx.ellipse(
		zombie.r * 0.15,
		-zombie.r * 0.15,
		zombie.r * 0.28,
		zombie.r * 0.22,
		0.4,
		0,
		Math.PI * 2,
	);
	ctx.fill();
	ctx.beginPath();
	ctx.ellipse(
		zombie.r * 0.15,
		zombie.r * 0.15,
		zombie.r * 0.28,
		zombie.r * 0.22,
		-0.4,
		0,
		Math.PI * 2,
	);
	ctx.fill();
	ctx.fillStyle = zombie.flash > 0 ? "#f7f3ea" : body;
	ctx.beginPath();
	ctx.ellipse(-zombie.r * 0.05, 0, zombie.r * 0.82, zombie.r * 0.7, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = zombie.flash > 0 ? "#fff" : dark;
	ctx.beginPath();
	ctx.arc(zombie.r * 0.55, 0, zombie.r * 0.42, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = zombie.flash > 0 ? "#fff" : dark;
	ctx.lineWidth = 3;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(zombie.r * 0.2, -4);
	ctx.lineTo(zombie.r * 0.2 + reach, -6);
	ctx.moveTo(zombie.r * 0.2, 4);
	ctx.lineTo(zombie.r * 0.2 + reach, 6);
	ctx.stroke();
	ctx.fillStyle = "#e8d7c4";
	ctx.beginPath();
	ctx.arc(zombie.r * 0.78, -2.1, 1.5, 0, Math.PI * 2);
	ctx.arc(zombie.r * 0.78, 2.1, 1.5, 0, Math.PI * 2);
	ctx.fill();
	if (zombie.kind === "brute") {
		const ratio = clampRatio(zombie.hp / zombie.maxHp);
		ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
		round(ctx, -10, -zombie.r - 8, 20, 3.5, 1.5);
		ctx.fill();
		ctx.fillStyle = "#c6a15a";
		round(ctx, -10, -zombie.r - 8, 20 * ratio, 3.5, 1.5);
		ctx.fill();
	}
	ctx.restore();
}

function clampRatio(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function drawShot(ctx: CanvasRenderingContext2D, shot: Shot) {
	const angle = Math.atan2(shot.vy, shot.vx);
	const speed = Math.hypot(shot.vx, shot.vy) || 1;
	const tail = shot.kind === "rocket" ? 16 : shot.kind === "pellet" ? 7 : 12;
	ctx.strokeStyle = shot.kind === "pellet" ? "rgba(255, 214, 160, 0.8)" : "#fff4d2";
	ctx.lineWidth = shot.kind === "rocket" ? 3 : 2;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(shot.x, shot.y);
	ctx.lineTo(shot.x - (shot.vx / speed) * tail, shot.y - (shot.vy / speed) * tail);
	ctx.stroke();
	if (shot.kind !== "rocket") return;
	ctx.save();
	ctx.translate(shot.x, shot.y);
	ctx.rotate(angle);
	ctx.fillStyle = "#e25b3a";
	ctx.beginPath();
	ctx.moveTo(7, 0);
	ctx.lineTo(-5, -3.5);
	ctx.lineTo(-2, 0);
	ctx.lineTo(-5, 3.5);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

function drawSaw(ctx: CanvasRenderingContext2D, game: Game, x: number, y: number) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(game.age * 10);
	ctx.fillStyle = "#d5d8de";
	ctx.beginPath();
	ctx.arc(0, 0, 9, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = "#8e949c";
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.strokeStyle = "#f4efe6";
	ctx.lineWidth = 1.5;
	for (let i = 0; i < 8; i++) {
		const angle = (i / 8) * Math.PI * 2;
		ctx.beginPath();
		ctx.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
		ctx.lineTo(Math.cos(angle) * 11, Math.sin(angle) * 11);
		ctx.stroke();
	}
	ctx.restore();
}

function drawHeadlights(ctx: CanvasRenderingContext2D, game: Game) {
	if (game.mode === "wrecked" && Math.sin(game.age * 30) < 0.2) return;
	const car = game.car;
	const fx = Math.cos(car.angle);
	const fy = Math.sin(car.angle);
	const rx = -fy;
	const ry = fx;
	for (const side of [-1, 1]) {
		ctx.save();
		ctx.translate(car.x + fx * 18 + rx * side * 6, car.y + fy * 18 + ry * side * 6);
		ctx.rotate(car.angle);
		const beam = ctx.createLinearGradient(0, 0, 210, 0);
		beam.addColorStop(0, "rgba(255, 226, 170, 0.22)");
		beam.addColorStop(1, "rgba(255, 226, 170, 0)");
		ctx.fillStyle = beam;
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(210, side * 18 - 34);
		ctx.lineTo(210, side * 18 + 34);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}
}

function drawCar(ctx: CanvasRenderingContext2D, game: Game) {
	const car = game.car;
	const integrity = car.hp / car.maxHp;
	ctx.save();
	ctx.translate(car.x, car.y);
	ctx.rotate(car.angle);
	ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
	ctx.beginPath();
	ctx.ellipse(2, 5, 18, 12, 0, 0, Math.PI * 2);
	ctx.fill();

	const wheel = (x: number, y: number, turn: number) => {
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(turn);
		ctx.fillStyle = "#141210";
		round(ctx, -5, -3, 10, 6, 1.6);
		ctx.fill();
		ctx.restore();
	};
	wheel(12, -11, car.steer * 0.42);
	wheel(12, 11, car.steer * 0.42);
	wheel(-14, -11, 0);
	wheel(-14, 11, 0);

	ctx.fillStyle = game.hurt > 0.08 ? "#f4efe6" : integrity < 0.35 ? "#8a3428" : "#e54832";
	ctx.beginPath();
	ctx.moveTo(-20, -8.5);
	ctx.lineTo(8, -8.5);
	ctx.quadraticCurveTo(22, -8, 23, -3);
	ctx.lineTo(23, 3);
	ctx.quadraticCurveTo(22, 8, 8, 8.5);
	ctx.lineTo(-20, 8.5);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = "#f3ecdf";
	ctx.fillRect(-4, -1.3, 24, 2.6);
	ctx.fillStyle = "#17302c";
	ctx.beginPath();
	ctx.moveTo(1, -6);
	ctx.lineTo(12, -4.2);
	ctx.lineTo(12, 4.2);
	ctx.lineTo(1, 6);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = "#ffe7b0";
	ctx.fillRect(20, -5.5, 3, 2.4);
	ctx.fillRect(20, 3.1, 3, 2.4);
	if (car.throttle < 0) {
		ctx.fillStyle = "#ff5a3c";
		ctx.fillRect(-21, -6, 2.4, 3);
		ctx.fillRect(-21, 3, 2.4, 3);
	}
	if (integrity < 0.7) {
		ctx.strokeStyle = "rgba(20, 12, 10, 0.8)";
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(-8, -4);
		ctx.lineTo(-2, 1);
		ctx.lineTo(-10, 5);
		ctx.stroke();
	}
	if (integrity < 0.4) {
		ctx.fillStyle = "rgba(20, 16, 14, 0.55)";
		ctx.beginPath();
		ctx.ellipse(6, 2, 6, 4, 0.4, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawFlame(ctx: CanvasRenderingContext2D, game: Game) {
	if (game.flame <= 0) return;
	const level = game.weapons.flame;
	const length = 120 + level * 18;
	const half = 0.4 + level * 0.035;
	ctx.save();
	ctx.translate(game.car.x, game.car.y);
	ctx.rotate(game.flameAngle);
	const gradient = ctx.createLinearGradient(16, 0, length, 0);
	gradient.addColorStop(0, "rgba(255, 196, 92, 0.0)");
	gradient.addColorStop(0.2, "rgba(255, 140, 48, 0.55)");
	gradient.addColorStop(1, "rgba(255, 80, 32, 0)");
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.moveTo(18, 0);
	ctx.lineTo(length, Math.sin(half) * length * 0.55);
	ctx.lineTo(length, -Math.sin(half) * length * 0.55);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], frame: Frame) {
	for (const particle of particles) {
		if (particle.life <= 0 || !inView(particle.x, particle.y, 20, frame)) continue;
		ctx.globalAlpha = Math.max(0, particle.life / particle.max);
		ctx.fillStyle = particle.color;
		ctx.beginPath();
		ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

function drawFloaters(ctx: CanvasRenderingContext2D, floaters: Floater[]) {
	ctx.font = "700 16px Inter, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	for (const item of floaters) {
		ctx.globalAlpha = Math.max(0, item.life / item.max);
		ctx.lineWidth = 3;
		ctx.strokeStyle = "rgba(16, 14, 12, 0.75)";
		ctx.fillStyle = INK;
		ctx.strokeText(item.text, item.x, item.y);
		ctx.fillText(item.text, item.x, item.y);
	}
	ctx.globalAlpha = 1;
}

function hullColor(ratio: number): string {
	if (ratio > 0.55) return "#9aaf72";
	if (ratio > 0.28) return "#e0a04a";
	return "#e25b3a";
}

function drawHud(ctx: CanvasRenderingContext2D, game: Game, frame: Frame) {
	if (game.mode === "ready") return;
	const pad = 16;
	const ratio = clampRatio(game.car.hp / game.car.maxHp);
	const pulse = ratio < 0.28 ? 0.55 + Math.sin(game.age * 8) * 0.45 : 1;
	ctx.save();
	ctx.globalAlpha = pulse;
	ctx.font = "600 11px Inter, sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.fillStyle = "rgba(244, 239, 230, 0.7)";
	ctx.fillText("HULL", pad, pad + 8);
	ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
	round(ctx, pad, pad + 16, 148, 8, 4);
	ctx.fill();
	ctx.fillStyle = hullColor(ratio);
	round(ctx, pad, pad + 16, Math.max(0, 148 * ratio), 8, 4);
	ctx.fill();
	ctx.restore();

	const total = Math.max(0, Math.floor(game.time));
	const clock = `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
	ctx.textAlign = "right";
	ctx.textBaseline = "top";
	ctx.font = "600 14px Inter, sans-serif";
	ctx.fillStyle = INK;
	paintText(ctx, clock, frame.cssW - pad, pad);
	ctx.font = "500 12px Inter, sans-serif";
	ctx.fillStyle = "rgba(244, 239, 230, 0.75)";
	paintText(ctx, `${game.kills} down`, frame.cssW - pad, pad + 18);

	if (game.mode === "drive") {
		const kmh = Math.round(game.car.speed * 0.62);
		ctx.textAlign = "left";
		ctx.font = "600 13px Inter, sans-serif";
		ctx.fillStyle = INK;
		paintText(ctx, `${kmh}`, pad, frame.cssH - pad - 28);
		ctx.font = "500 10px Inter, sans-serif";
		ctx.fillStyle = "rgba(244, 239, 230, 0.6)";
		ctx.fillText("KM/H", pad, frame.cssH - pad - 12);
	}

	const owned = WEAPONS.filter((id) => game.weapons[id] > 0);
	if (owned.length === 0) return;
	const gap = 8;
	const available = frame.cssW - pad * 2;
	const pillW = Math.min(112, (available - gap * (owned.length - 1)) / owned.length);
	const pillH = 26;
	const totalW = owned.length * pillW + (owned.length - 1) * gap;
	let x = (frame.cssW - totalW) / 2;
	const y = frame.cssH - pad - pillH;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.font = "600 12px Inter, sans-serif";
	for (const id of owned) {
		const full = levelLabel(id, game.weapons[id]);
		const label = pillW < 88 ? (full.split(" ").at(-1) ?? full) : full;
		ctx.fillStyle = "rgba(16, 14, 12, 0.55)";
		round(ctx, x, y, pillW, pillH, 13);
		ctx.fill();
		ctx.fillStyle = WEAPON_COLOR[id];
		ctx.beginPath();
		ctx.arc(x + 12, y + pillH / 2, 4, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = INK;
		ctx.fillText(label, x + 22, y + pillH / 2 + 0.5);
		x += pillW + gap;
	}
}

function paintText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
	ctx.lineWidth = 3;
	ctx.strokeStyle = "rgba(16, 14, 12, 0.72)";
	ctx.strokeText(text, x, y);
	ctx.fillText(text, x, y);
}

function drawChevrons(ctx: CanvasRenderingContext2D, game: Game, frame: Frame) {
	if (game.mode !== "drive") return;
	const halfW = frame.cssW / 2 - 18;
	const halfH = frame.cssH / 2 - 58;
	for (const zombie of game.zombies) {
		const sx = (zombie.x - frame.x) * frame.scale;
		const sy = (zombie.y - frame.y) * frame.scale;
		if (Math.hypot(zombie.x - game.car.x, zombie.y - game.car.y) > 1100) continue;
		if (Math.abs(sx) < halfW - 24 && Math.abs(sy) < halfH - 24) continue;
		const scale = Math.max(Math.abs(sx) / halfW, Math.abs(sy) / halfH) || 1;
		const x = frame.cssW / 2 + sx / scale;
		const y = frame.cssH / 2 + sy / scale;
		const angle = Math.atan2(sy, sx);
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(angle);
		ctx.fillStyle = zombie.kind === "brute" ? "#e0a04a" : "#e25b3a";
		ctx.beginPath();
		ctx.moveTo(7, 0);
		ctx.lineTo(-5, -4);
		ctx.lineTo(-5, 4);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}
}

function drawVignette(ctx: CanvasRenderingContext2D, game: Game, frame: Frame) {
	const gradient = ctx.createRadialGradient(
		frame.cssW / 2,
		frame.cssH / 2,
		frame.cssH * 0.3,
		frame.cssW / 2,
		frame.cssH / 2,
		frame.cssH * 0.72,
	);
	const edge =
		game.car.hp / game.car.maxHp < 0.28 ? "rgba(120, 24, 28, 0.55)" : "rgba(0, 0, 0, 0.45)";
	gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
	gradient.addColorStop(1, edge);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, frame.cssW, frame.cssH);
	if (game.hurt > 0) {
		ctx.fillStyle = `rgba(168, 40, 42, ${game.hurt * 1.6})`;
		ctx.fillRect(0, 0, frame.cssW, frame.cssH);
	}
}

export function drawGame(ctx: CanvasRenderingContext2D, game: Game, frame: Frame) {
	ctx.fillStyle = "#100e0c";
	ctx.fillRect(0, 0, frame.cssW, frame.cssH);
	ctx.save();
	ctx.translate(frame.cssW / 2 + frame.shakeX, frame.cssH / 2 + frame.shakeY);
	ctx.scale(frame.scale, frame.scale);
	ctx.translate(-frame.x, -frame.y);

	drawGround(ctx, frame);
	drawFence(ctx);
	drawDecals(ctx, game, frame);
	drawHeadlights(ctx, game);
	for (const prop of game.props) {
		if (inView(prop.x, prop.y, 40, frame)) drawProp(ctx, prop);
	}
	for (const mine of game.mines) drawMine(ctx, game, mine.x, mine.y, mine.arm);
	for (const pickup of game.pickups) {
		if (inView(pickup.x, pickup.y, 30, frame)) drawPickup(ctx, game, pickup);
	}
	for (const zombie of game.zombies) {
		if (inView(zombie.x, zombie.y, 30, frame)) drawZombie(ctx, game, zombie);
	}
	for (const shot of game.shots) drawShot(ctx, shot);
	for (const blade of sawBlades(game)) drawSaw(ctx, game, blade.x, blade.y);
	drawFlame(ctx, game);
	drawCar(ctx, game);
	drawParticles(ctx, game.particles, frame);
	drawFloaters(ctx, game.floaters);
	ctx.restore();

	drawVignette(ctx, game, frame);
	drawHud(ctx, game, frame);
	drawChevrons(ctx, game, frame);
}
