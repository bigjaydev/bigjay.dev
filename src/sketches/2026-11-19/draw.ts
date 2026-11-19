import { CITY, ROAD_HALF, ROADS_X, ROADS_Y, WORLD_H, WORLD_W, type Rect } from "./city";
import { SPEECH_TIME, carryCount, targetOf, type Car, type Game } from "./game";

export const VIEW_H = 640;

export type Frame = {
	cssW: number;
	cssH: number;
	scale: number;
	x: number;
	y: number;
	shakeX: number;
	shakeY: number;
};

const INK = "#f4fbff";

let cached: HTMLCanvasElement | null = null;

function hash(n: number): number {
	let x = n | 0;
	x = Math.imul(x ^ (x >>> 16), 2246822507);
	x = Math.imul(x ^ (x >>> 13), 3266489909);
	return (x >>> 0) / 4294967296;
}

function cityCanvas(): HTMLCanvasElement {
	if (cached) return cached;
	const canvas = document.createElement("canvas");
	canvas.width = WORLD_W;
	canvas.height = WORLD_H;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	paintCity(ctx);
	cached = canvas;
	return canvas;
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
	ctx.roundRect(x, y, w, h, Math.max(0, r));
}

function paintCity(ctx: CanvasRenderingContext2D) {
	ctx.fillStyle = "#100818";
	ctx.fillRect(0, 0, WORLD_W, WORLD_H);

	for (let r = 0; r < CITY.kinds.length; r++) {
		const row = CITY.kinds[r] ?? [];
		for (let c = 0; c < row.length; c++) {
			const kind = row[c];
			const b = CITY.cells[r]?.[c];
			if (!kind || !b) continue;
			paintTerrain(ctx, kind, b);
			if (kind === "hangar") paintHangar(ctx, b);
		}
	}

	ctx.save();
	ctx.beginPath();
	for (let r = 0; r < CITY.cells.length; r++) {
		for (const b of CITY.cells[r] ?? []) ctx.rect(b.x, b.y, b.w, b.h);
	}
	ctx.clip();
	ctx.strokeStyle = "rgba(255, 43, 214, 0.09)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let x = 0; x <= WORLD_W; x += 36) {
		ctx.moveTo(x, 0);
		ctx.lineTo(x, WORLD_H);
	}
	for (let y = 0; y <= WORLD_H; y += 36) {
		ctx.moveTo(0, y);
		ctx.lineTo(WORLD_W, y);
	}
	ctx.stroke();
	ctx.restore();

	ctx.fillStyle = "#14061f";
	for (const x of ROADS_X) ctx.fillRect(x - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
	for (const y of ROADS_Y) ctx.fillRect(0, y - ROAD_HALF, WORLD_W, ROAD_HALF * 2);

	ctx.strokeStyle = "rgba(45, 226, 255, 0.72)";
	ctx.lineWidth = 2;
	ctx.beginPath();
	for (const x of ROADS_X) {
		ctx.moveTo(x - ROAD_HALF, 0);
		ctx.lineTo(x - ROAD_HALF, WORLD_H);
		ctx.moveTo(x + ROAD_HALF, 0);
		ctx.lineTo(x + ROAD_HALF, WORLD_H);
	}
	for (const y of ROADS_Y) {
		ctx.moveTo(0, y - ROAD_HALF);
		ctx.lineTo(WORLD_W, y - ROAD_HALF);
		ctx.moveTo(0, y + ROAD_HALF);
		ctx.lineTo(WORLD_W, y + ROAD_HALF);
	}
	ctx.stroke();

	ctx.strokeStyle = "rgba(255, 43, 214, 0.8)";
	ctx.lineWidth = 1.5;
	ctx.setLineDash([16, 18]);
	ctx.beginPath();
	for (const x of ROADS_X) {
		ctx.moveTo(x, 0);
		ctx.lineTo(x, WORLD_H);
	}
	for (const y of ROADS_Y) {
		ctx.moveTo(0, y);
		ctx.lineTo(WORLD_W, y);
	}
	ctx.stroke();
	ctx.setLineDash([]);

	const beach = CITY.cells[1]?.[3];
	if (beach) {
		const sun = ctx.createRadialGradient(
			beach.x + beach.w * 0.82,
			beach.y + beach.h * 0.42,
			10,
			beach.x + beach.w * 0.82,
			beach.y + beach.h * 0.42,
			beach.w * 0.7,
		);
		sun.addColorStop(0, "rgba(255, 214, 140, 0.95)");
		sun.addColorStop(0.18, "rgba(255, 120, 70, 0.55)");
		sun.addColorStop(0.45, "rgba(255, 43, 150, 0.18)");
		sun.addColorStop(1, "rgba(255, 43, 150, 0)");
		ctx.fillStyle = sun;
		ctx.fillRect(beach.x, beach.y, beach.w, beach.h);
	}

	let solidIndex = 0;
	for (const solid of CITY.solids) {
		if (solid.x < 0 || solid.y < 0 || solid.x >= WORLD_W || solid.y >= WORLD_H) continue;
		if (solid.kind === "water") {
			const water = ctx.createLinearGradient(
				solid.x,
				solid.y,
				solid.x + solid.w,
				solid.y + solid.h,
			);
			water.addColorStop(0, "#ff4d8d");
			water.addColorStop(0.35, "#ff8a3d");
			water.addColorStop(0.7, "#7a3cff");
			water.addColorStop(1, "#12305a");
			ctx.fillStyle = water;
			ctx.fillRect(solid.x, solid.y, solid.w, solid.h);
			continue;
		}
		if (solid.kind === "crusher") {
			ctx.fillStyle = "#1a0a16";
			ctx.fillRect(solid.x, solid.y, solid.w, solid.h);
			ctx.strokeStyle = "#ff2bd6";
			ctx.lineWidth = 3;
			ctx.strokeRect(solid.x + 8, solid.y + 8, solid.w - 16, solid.h - 16);
			ctx.fillStyle = "#ff2bd6";
			ctx.beginPath();
			ctx.moveTo(solid.x + 16, solid.y + solid.h - 10);
			ctx.lineTo(solid.x + solid.w * 0.42, solid.y + 18);
			ctx.lineTo(solid.x + solid.w * 0.5, solid.y + solid.h - 10);
			ctx.moveTo(solid.x + solid.w - 16, solid.y + solid.h - 10);
			ctx.lineTo(solid.x + solid.w * 0.58, solid.y + 18);
			ctx.lineTo(solid.x + solid.w * 0.5, solid.y + solid.h - 10);
			ctx.fill();
			continue;
		}
		paintBlock(ctx, solid.x, solid.y, solid.w, solid.h, solid.hue, solidIndex);
		solidIndex += 1;
	}

	for (const tree of CITY.trees) {
		ctx.fillStyle = "#0c241c";
		ctx.beginPath();
		ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = "#2de2ff";
		ctx.lineWidth = 2;
		ctx.stroke();
	}

	paintCrowd(ctx, CITY.podium.x, CITY.podium.y, 78);
	paintCrowd(ctx, CITY.stage.x, CITY.stage.y + 54, 64);
	paintCrowd(ctx, CITY.line.x, CITY.line.y + 36, 58);

	ctx.fillStyle = "rgba(255, 43, 214, 0.16)";
	ctx.beginPath();
	ctx.arc(CITY.podium.x, CITY.podium.y, 26, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = "#ff2bd6";
	ctx.lineWidth = 2;
	ctx.stroke();

	ctx.font = "700 15px Space Grotesk, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	for (const label of CITY.labels) {
		ctx.lineWidth = 4;
		ctx.strokeStyle = "rgba(8, 0, 16, 0.85)";
		ctx.strokeText(label.text, label.x, label.y);
		ctx.fillStyle = INK;
		ctx.fillText(label.text, label.x, label.y);
	}
}

function paintHangar(ctx: CanvasRenderingContext2D, b: Rect) {
	const arm = 92;
	const t = 8;
	ctx.strokeStyle = "#2de2ff";
	ctx.lineWidth = t;
	ctx.strokeRect(b.x + t, b.y + t, b.w - t * 2, b.h - t * 2);
	ctx.strokeStyle = "#ff2bd6";
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(b.x + arm, b.y + t);
	ctx.lineTo(b.x + b.w - arm, b.y + t);
	ctx.moveTo(b.x + arm, b.y + b.h - t);
	ctx.lineTo(b.x + b.w - arm, b.y + b.h - t);
	ctx.stroke();
}

function paintTerrain(ctx: CanvasRenderingContext2D, kind: string, b: Rect) {
	if (kind === "park") ctx.fillStyle = "#10261f";
	else if (kind === "beach") ctx.fillStyle = "#4a2748";
	else if (kind === "plaza" || kind === "docks") ctx.fillStyle = "#1a0d2a";
	else if (kind === "dealer" || kind === "yard" || kind === "shop") ctx.fillStyle = "#1c102c";
	else ctx.fillStyle = "#160c24";
	ctx.fillRect(b.x, b.y, b.w, b.h);
}

function paintBlock(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	hue: "magenta" | "cyan" | "amber",
	index: number,
) {
	ctx.fillStyle = "#0c0614";
	ctx.fillRect(x, y, w, h);
	const stroke = hue === "cyan" ? "#2de2ff" : hue === "amber" ? "#ffb15a" : "#ff2bd6";
	ctx.strokeStyle = stroke;
	ctx.globalAlpha = 0.85;
	ctx.lineWidth = 2;
	ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
	ctx.globalAlpha = 1;
	const cols = Math.max(2, Math.floor(w / 16));
	const rows = Math.max(2, Math.floor(h / 20));
	const padX = 8;
	const padY = 8;
	const cw = (w - padX * 2) / cols;
	const rh = (h - padY * 2) / rows;
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const n = hash(index * 131 + row * 17 + col * 3);
			if (n < 0.38) continue;
			ctx.globalAlpha = 0.35 + n * 0.55;
			ctx.fillStyle = n > 0.72 ? "#2de2ff" : n > 0.52 ? "#ff2bd6" : "#ffb15a";
			ctx.fillRect(
				x + padX + col * cw + 1,
				y + padY + row * rh + 1,
				Math.max(2, cw - 3),
				Math.max(2, rh - 4),
			);
		}
	}
	ctx.globalAlpha = 1;
}

function paintCrowd(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
	for (let i = 0; i < 10; i++) {
		const angle = (i / 10) * Math.PI * 2 + 0.2;
		const px = x + Math.cos(angle) * radius;
		const py = y + Math.sin(angle) * radius * 0.72;
		ctx.fillStyle = i % 2 ? "#ff8ad2" : "#8af0ff";
		ctx.beginPath();
		ctx.arc(px, py, 5, 0, Math.PI * 2);
		ctx.fill();
	}
}

export function drawGame(ctx: CanvasRenderingContext2D, game: Game, frame: Frame) {
	ctx.fillStyle = "#07010f";
	ctx.fillRect(0, 0, frame.cssW, frame.cssH);
	ctx.save();
	ctx.translate(frame.cssW / 2 + frame.shakeX, frame.cssH / 2 + frame.shakeY);
	ctx.scale(frame.scale, frame.scale);
	ctx.translate(-frame.x, -frame.y);

	ctx.drawImage(cityCanvas(), 0, 0);
	drawWater(ctx, game.age);

	for (const skid of game.skids) {
		ctx.strokeStyle = `rgba(180, 200, 220, ${skid.a})`;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(skid.x, skid.y);
		ctx.lineTo(skid.x2, skid.y2);
		ctx.stroke();
	}
	for (const cube of game.cubes) {
		ctx.fillStyle = "#f3e2b0";
		ctx.strokeStyle = "#2de2ff";
		ctx.lineWidth = 2;
		ctx.fillRect(cube.x - 8, cube.y - 8, 16, 16);
		ctx.strokeRect(cube.x - 8, cube.y - 8, 16, 16);
	}

	for (const phone of CITY.phones) drawPhone(ctx, phone.x, phone.y, game.age, game.active == null);
	drawPickups(ctx, game);
	drawMarker(ctx, game);

	for (const ped of game.peds) drawPed(ctx, ped.x, ped.y, ped.color, ped.down, game.age);
	for (const car of game.cars) {
		if (car.id === game.player.carId) continue;
		drawCar(ctx, car, game.age);
	}
	const driving = game.cars.find((car) => car.id === game.player.carId);
	if (driving) drawCar(ctx, driving, game.age);
	else drawPlayer(ctx, game);

	for (const particle of game.particles) {
		ctx.globalAlpha = Math.max(0, particle.life / particle.max);
		ctx.fillStyle = particle.color;
		ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
		ctx.globalAlpha = 1;
	}
	ctx.font = "700 14px Space Grotesk, sans-serif";
	ctx.textAlign = "center";
	for (const floater of game.floaters) {
		ctx.globalAlpha = Math.max(0, floater.life / floater.max);
		ctx.fillStyle = INK;
		ctx.fillText(floater.text, floater.x, floater.y - (1 - floater.life / floater.max) * 18);
		ctx.globalAlpha = 1;
	}
	ctx.restore();
	drawArrow(ctx, game, frame);
}

function drawWater(ctx: CanvasRenderingContext2D, age: number) {
	ctx.save();
	ctx.strokeStyle = "rgba(255, 236, 210, 0.28)";
	ctx.lineWidth = 1.5;
	for (const rect of CITY.water) {
		for (let i = 0; i < 5; i++) {
			const y = rect.y + ((age * 24 + i * rect.h * 0.2) % rect.h);
			ctx.beginPath();
			ctx.moveTo(rect.x, y);
			ctx.lineTo(rect.x + rect.w, y);
			ctx.stroke();
		}
	}
	ctx.restore();
}

function drawPhone(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	age: number,
	ringing: boolean,
) {
	const pulse = 0.5 + 0.5 * Math.sin(age * (ringing ? 7 : 3));
	ctx.strokeStyle = `rgba(255, 43, 214, ${0.25 + pulse * 0.65})`;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(x, y, 14 + pulse * 10, 0, Math.PI * 2);
	ctx.stroke();
	round(ctx, x - 7, y - 12, 14, 22, 3);
	ctx.fillStyle = "#140814";
	ctx.fill();
	ctx.strokeStyle = "#2de2ff";
	ctx.stroke();
	ctx.fillStyle = ringing ? "#ff2bd6" : "#2de2ff";
	ctx.fillRect(x - 3, y - 6, 6, 8);
}

function drawPickups(ctx: CanvasRenderingContext2D, game: Game) {
	if (game.lander === "hangar") drawCrate(ctx, CITY.crate.x, CITY.crate.y, game.age, "#2de2ff");
	if (game.tape === "studio") drawCrate(ctx, CITY.tape.x, CITY.tape.y, game.age, "#ff2bd6");
	game.boxes.forEach((box, index) => {
		const spot = CITY.boxes[index];
		if (box === "shop" && spot) drawCrate(ctx, spot.x, spot.y, game.age + index, "#f4f4f8");
	});
	if (game.active === "apollo" || game.lander === "planted") {
		ctx.strokeStyle = "rgba(45, 226, 255, 0.8)";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(CITY.pad.x, CITY.pad.y, 28, 0, Math.PI * 2);
		ctx.stroke();
	}
	if (game.lander === "planted") drawLander(ctx, CITY.pad.x, CITY.pad.y);
	ctx.strokeStyle = "rgba(243, 226, 176, 0.7)";
	ctx.setLineDash([6, 6]);
	ctx.beginPath();
	ctx.arc(CITY.crusher.x, CITY.crusher.y, 78, 0, Math.PI * 2);
	ctx.stroke();
	ctx.setLineDash([]);
}

function drawCrate(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	age: number,
	color: string,
) {
	const bob = Math.sin(age * 3) * 2;
	ctx.save();
	ctx.translate(x, y + bob);
	ctx.fillStyle = color;
	ctx.fillRect(-8, -8, 16, 16);
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = 1;
	ctx.strokeRect(-8, -8, 16, 16);
	ctx.beginPath();
	ctx.moveTo(-8, 0);
	ctx.lineTo(8, 0);
	ctx.moveTo(0, -8);
	ctx.lineTo(0, 8);
	ctx.stroke();
	ctx.restore();
}

function drawLander(ctx: CanvasRenderingContext2D, x: number, y: number) {
	ctx.save();
	ctx.translate(x, y);
	ctx.fillStyle = "#d7fff8";
	ctx.beginPath();
	ctx.moveTo(0, -16);
	ctx.lineTo(12, 10);
	ctx.lineTo(-12, 10);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = "#2de2ff";
	ctx.stroke();
	ctx.restore();
}

function drawMarker(ctx: CanvasRenderingContext2D, game: Game) {
	const target = targetOf(game);
	if (!target) return;
	const pulse = 0.5 + 0.5 * Math.sin(game.age * 5);
	ctx.save();
	ctx.translate(target.x, target.y);
	const ring = game.active === "speech" ? 108 : 22 + pulse * 8;
	ctx.strokeStyle = `rgba(45, 226, 255, ${0.45 + pulse * 0.5})`;
	ctx.lineWidth = game.active === "speech" ? 3 : 2;
	ctx.beginPath();
	ctx.arc(0, 0, ring, 0, Math.PI * 2);
	ctx.stroke();
	ctx.rotate(game.age);
	ctx.strokeStyle = "#ff2bd6";
	ctx.beginPath();
	ctx.moveTo(0, -12);
	ctx.lineTo(8, 0);
	ctx.lineTo(0, 12);
	ctx.lineTo(-8, 0);
	ctx.closePath();
	ctx.stroke();
	ctx.restore();
	if (game.active === "speech") {
		ctx.strokeStyle = "#ff2bd6";
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(
			CITY.podium.x,
			CITY.podium.y,
			108,
			-Math.PI / 2,
			-Math.PI / 2 + (game.speech / SPEECH_TIME) * Math.PI * 2,
		);
		ctx.stroke();
	}
}

function drawPed(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	color: string,
	down: number,
	age: number,
) {
	ctx.save();
	ctx.translate(x, y);
	if (down > 0) {
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
		return;
	}
	const step = Math.sin(age * 8 + x) * 3;
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(-3, 2);
	ctx.lineTo(-3 + step, 8);
	ctx.moveTo(3, 2);
	ctx.lineTo(3 - step, 8);
	ctx.stroke();
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(0, -2, 5, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawCar(ctx: CanvasRenderingContext2D, car: Car, age: number) {
	ctx.save();
	ctx.translate(car.x, car.y);
	ctx.rotate(car.angle);
	ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
	ctx.beginPath();
	ctx.ellipse(3, 5, car.length * 0.42, car.width * 0.42, 0, 0, Math.PI * 2);
	ctx.fill();
	const reach = 36 + Math.min(48, Math.abs(car.speed) * 0.12);
	ctx.fillStyle = "rgba(190, 255, 255, 0.09)";
	ctx.beginPath();
	ctx.moveTo(car.length * 0.35, -4);
	ctx.lineTo(car.length * 0.35 + reach, -16);
	ctx.lineTo(car.length * 0.35 + reach, 16);
	ctx.closePath();
	ctx.fill();
	round(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 5);
	ctx.fillStyle = car.color;
	ctx.fill();
	ctx.strokeStyle = "rgba(255,255,255,0.55)";
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.fillStyle = "rgba(6, 10, 24, 0.78)";
	round(ctx, car.length * 0.02, -car.width * 0.32, car.length * 0.26, car.width * 0.64, 3);
	ctx.fill();
	ctx.fillStyle = "#f4feff";
	ctx.fillRect(car.length / 2 - 4, -car.width / 2 + 2, 3, 4);
	ctx.fillRect(car.length / 2 - 4, car.width / 2 - 6, 3, 4);
	if (car.paint === "edsel") {
		ctx.strokeStyle = "#fff8e4";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.ellipse(car.length / 2 - 7, 0, 5, 9, 0, 0, Math.PI * 2);
		ctx.stroke();
	}
	if (car.paint === "cop" || car.ai === "cop") {
		ctx.fillStyle = Math.floor(age * 8) % 2 === 0 ? "#ff2bd6" : "#2de2ff";
		ctx.fillRect(-7, -car.width / 2 - 3, 14, 3);
	}
	ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, game: Game) {
	const player = game.player;
	ctx.save();
	ctx.translate(player.x, player.y);
	ctx.rotate(player.angle);
	ctx.fillStyle = "rgba(255, 43, 214, 0.35)";
	ctx.beginPath();
	ctx.ellipse(-2, 0, 14, 9, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "rgba(45, 226, 255, 0.45)";
	ctx.beginPath();
	ctx.ellipse(2, 0, 14, 9, 0, 0, Math.PI * 2);
	ctx.fill();
	round(ctx, -8, -7, 18, 14, 5);
	ctx.fillStyle = "#f7f7fb";
	ctx.fill();
	ctx.fillStyle = "#ff2bd6";
	ctx.fillRect(-6, -5, 8, 10);
	ctx.fillStyle = "#071018";
	ctx.fillRect(2, -4, 7, 8);
	ctx.fillStyle = "#2de2ff";
	ctx.fillRect(3, -3, 5, 3);
	const carried = carryCount(game);
	if (carried > 0) {
		ctx.fillStyle = "#ffe28a";
		for (let i = 0; i < carried; i++) ctx.fillRect(-4, -16 - i * 5, 10, 4);
	}
	ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, game: Game, frame: Frame) {
	const target = targetOf(game);
	if (!target) return;
	const sx = frame.cssW / 2 + (target.x - frame.x) * frame.scale;
	const sy = frame.cssH / 2 + (target.y - frame.y) * frame.scale;
	const margin = 28;
	if (sx > margin && sy > margin && sx < frame.cssW - margin && sy < frame.cssH - margin) return;
	const cx = frame.cssW / 2;
	const cy = frame.cssH / 2;
	const angle = Math.atan2(sy - cy, sx - cx);
	const dx = Math.cos(angle);
	const dy = Math.sin(angle);
	const maxX = frame.cssW / 2 - margin;
	const maxY = frame.cssH / 2 - margin;
	const scale = Math.min(maxX / Math.abs(dx || 0.001), maxY / Math.abs(dy || 0.001));
	const x = cx + dx * scale;
	const y = cy + dy * scale;
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(angle);
	ctx.fillStyle = "#2de2ff";
	ctx.beginPath();
	ctx.moveTo(10, 0);
	ctx.lineTo(-7, -7);
	ctx.lineTo(-7, 7);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

export function drawMinimap(
	ctx: CanvasRenderingContext2D,
	game: Game,
	width: number,
	height: number,
) {
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "#120814";
	ctx.fillRect(0, 0, width, height);
	const sx = width / WORLD_W;
	const sy = height / WORLD_H;
	ctx.fillStyle = "#241238";
	for (const x of ROADS_X) ctx.fillRect((x - ROAD_HALF) * sx, 0, ROAD_HALF * 2 * sx, height);
	for (const y of ROADS_Y) ctx.fillRect(0, (y - ROAD_HALF) * sy, width, ROAD_HALF * 2 * sy);
	ctx.fillStyle = "#ff2bd6";
	for (const phone of CITY.phones) {
		ctx.fillRect(phone.x * sx - 1.5, phone.y * sy - 1.5, 3, 3);
	}
	const target = targetOf(game);
	if (target) {
		ctx.fillStyle = "#2de2ff";
		ctx.beginPath();
		ctx.arc(target.x * sx, target.y * sy, 3.5, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.fillStyle = "#ffffff";
	ctx.beginPath();
	ctx.arc(game.player.x * sx, game.player.y * sy, 2.5, 0, Math.PI * 2);
	ctx.fill();
}
