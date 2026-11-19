import { CHASSIS, MAX_HULL, MAX_MISSILES, nearCommand, useBattle } from "./store";
import { RADAR_RANGE, WORLD, wrapAngle, worldToMap, yawTo } from "./world";

const GREEN = "#d6ff6a";
const DIM = "rgba(214, 255, 106, 0.55)";
const RED = "#ff5b3a";
const MAGENTA = "#ff4fd8";
const AMBER = "#ffb03a";

function headingOf(aimYaw: number): number {
	return wrapAngle(-aimYaw);
}

function formatKm(meters: number): string {
	if (meters < 950) return `${Math.round(meters)} m`;
	return `${(meters / 1000).toFixed(1)} km`;
}

export function drawHud(ctx: CanvasRenderingContext2D, width: number, height: number) {
	const state = useBattle.getState();
	ctx.clearRect(0, 0, width, height);
	if (state.mode !== "live" || state.mapOpen) return;

	const unit = Math.max(0.75, Math.min(width, height) / 820);
	ctx.save();
	ctx.lineWidth = Math.max(1, unit);
	ctx.font = `600 ${Math.round(12 * unit)}px ui-monospace, monospace`;
	ctx.textBaseline = "middle";

	if (state.hurt > 0.02) {
		const fade = ctx.createRadialGradient(
			width / 2,
			height / 2,
			Math.min(width, height) * 0.25,
			width / 2,
			height / 2,
			Math.min(width, height) * 0.72,
		);
		fade.addColorStop(0, "rgba(0,0,0,0)");
		fade.addColorStop(1, `rgba(120, 16, 8, ${state.hurt * 0.55})`);
		ctx.fillStyle = fade;
		ctx.fillRect(0, 0, width, height);
	}

	drawCompass(ctx, width, unit);
	drawReticle(ctx, width, height, unit);
	drawRadar(ctx, width, height, unit);
	drawBars(ctx, width, height, unit);
	drawReadout(ctx, width, height, unit);
	ctx.restore();
}

function drawCompass(ctx: CanvasRenderingContext2D, width: number, unit: number) {
	const state = useBattle.getState();
	const heading = headingOf(state.aimYaw);
	const center = width / 2;
	const y = 28 * unit;
	const scale = 220 * unit;
	ctx.strokeStyle = DIM;
	ctx.beginPath();
	ctx.moveTo(center - 160 * unit, y + 10 * unit);
	ctx.lineTo(center + 160 * unit, y + 10 * unit);
	ctx.stroke();

	for (let deg = 0; deg < 360; deg += 5) {
		const delta = wrapAngle((deg * Math.PI) / 180 - heading);
		if (Math.abs(delta) > 1.15) continue;
		const x = center + delta * scale;
		const major = deg % 30 === 0;
		ctx.strokeStyle = major ? GREEN : DIM;
		ctx.beginPath();
		ctx.moveTo(x, y + (major ? 2 : 6) * unit);
		ctx.lineTo(x, y + 10 * unit);
		ctx.stroke();
		if (!major) continue;
		const label =
			deg === 0 ? "N" : deg === 90 ? "E" : deg === 180 ? "S" : deg === 270 ? "W" : String(deg);
		ctx.fillStyle = GREEN;
		ctx.textAlign = "center";
		ctx.fillText(label, x, y - 8 * unit);
	}

	const navDelta = wrapAngle(
		headingOf(yawTo(state.player.x, state.player.z, state.navX, state.navZ)) - heading,
	);
	const navX = center + clampScreen(navDelta, 1.05) * scale;
	ctx.fillStyle = "#ffffff";
	drawDiamond(ctx, navX, y + 16 * unit, 5 * unit);

	ctx.fillStyle = GREEN;
	ctx.textAlign = "center";
	const deg = Math.round(((heading * 180) / Math.PI + 360) % 360);
	ctx.fillText(deg.toString().padStart(3, "0"), center, y + 28 * unit);
}

function clampScreen(delta: number, limit: number): number {
	return Math.max(-limit, Math.min(limit, delta));
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
	ctx.beginPath();
	ctx.moveTo(x, y - size);
	ctx.lineTo(x + size, y);
	ctx.lineTo(x, y + size);
	ctx.lineTo(x - size, y);
	ctx.closePath();
	ctx.fill();
}

function drawReticle(ctx: CanvasRenderingContext2D, width: number, height: number, unit: number) {
	const state = useBattle.getState();
	const x = width / 2;
	const y = height / 2;
	const radius = 16 * unit;
	ctx.strokeStyle = state.lockKind === "none" ? GREEN : "#ffffff";
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.stroke();
	const gap = 5 * unit;
	const arm = 14 * unit;
	ctx.beginPath();
	ctx.moveTo(x - radius - gap - arm, y);
	ctx.lineTo(x - radius - gap, y);
	ctx.moveTo(x + radius + gap, y);
	ctx.lineTo(x + radius + gap + arm, y);
	ctx.moveTo(x, y - radius - gap - arm);
	ctx.lineTo(x, y - radius - gap);
	ctx.moveTo(x, y + radius + gap);
	ctx.lineTo(x, y + radius + gap + arm);
	ctx.stroke();

	if (state.hitMark > 0) {
		ctx.strokeStyle = RED;
		ctx.globalAlpha = Math.min(1, state.hitMark);
		const inner = 28 * unit;
		const outer = 40 * unit;
		ctx.beginPath();
		for (const angle of [0.6, 2.2, 3.8, 5.4]) {
			ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
			ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
		}
		ctx.stroke();
		ctx.globalAlpha = 1;
	}

	if (state.lockKind !== "none") {
		const ratio = state.lockMax > 0 ? Math.max(0, state.lockHp / state.lockMax) : 0;
		const bar = 92 * unit;
		const top = y - 46 * unit;
		ctx.fillStyle = "#ffffff";
		ctx.textAlign = "center";
		ctx.fillText(`${state.lockName}  ${Math.ceil(state.lockHp)}`, x, top - 10 * unit);
		ctx.fillStyle = "rgba(0,0,0,0.55)";
		ctx.fillRect(x - bar / 2, top, bar, 7 * unit);
		ctx.fillStyle = state.lockKind === "enemy" ? RED : MAGENTA;
		ctx.fillRect(x - bar / 2, top, bar * ratio, 7 * unit);
	}
}

function drawRadar(ctx: CanvasRenderingContext2D, width: number, height: number, unit: number) {
	const state = useBattle.getState();
	const radius = 78 * unit;
	const cx = 28 * unit + radius;
	const cy = height - 28 * unit - radius;
	ctx.fillStyle = "rgba(12, 16, 8, 0.45)";
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = GREEN;
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.stroke();
	ctx.strokeStyle = DIM;
	ctx.beginPath();
	ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
	ctx.moveTo(cx - radius, cy);
	ctx.lineTo(cx + radius, cy);
	ctx.moveTo(cx, cy - radius);
	ctx.lineTo(cx, cy + radius);
	ctx.stroke();

	ctx.fillStyle = "rgba(214, 255, 106, 0.12)";
	ctx.beginPath();
	ctx.moveTo(cx, cy);
	ctx.arc(cx, cy, radius, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
	ctx.closePath();
	ctx.fill();

	const sweep = state.age * 1.4;
	ctx.strokeStyle = "rgba(214, 255, 106, 0.45)";
	ctx.beginPath();
	ctx.moveTo(cx, cy);
	ctx.lineTo(cx + Math.sin(sweep) * radius, cy - Math.cos(sweep) * radius);
	ctx.stroke();

	const yaw = state.aimYaw;
	const plot = (x: number, z: number) => {
		const dx = x - state.player.x;
		const dz = z - state.player.z;
		const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
		const right = dx * -Math.cos(yaw) + dz * Math.sin(yaw);
		const dist = Math.hypot(forward, right);
		if (dist > RADAR_RANGE) return null;
		const scale = radius / RADAR_RANGE;
		return { x: cx + right * scale, y: cy - forward * scale };
	};

	for (const structure of state.structures) {
		if (!structure.placed) continue;
		const point = plot(structure.x, structure.z);
		if (!point) continue;
		if (structure.kind === "supply") ctx.fillStyle = "#8dffb0";
		else if (structure.kind === "tower") ctx.fillStyle = "#7ee0ff";
		else if (!structure.alive) ctx.fillStyle = "rgba(255,255,255,0.25)";
		else if (structure.kind === "citadel") ctx.fillStyle = MAGENTA;
		else if (structure.kind === "relay") ctx.fillStyle = AMBER;
		else ctx.fillStyle = GREEN;
		ctx.fillRect(point.x - 2 * unit, point.y - 2 * unit, 4 * unit, 4 * unit);
	}

	ctx.fillStyle = "#9ad0ff";
	for (const rig of state.rigs) {
		if (!rig.alive || rig.occupied) continue;
		const point = plot(rig.x, rig.z);
		if (!point) continue;
		ctx.fillRect(point.x - 2 * unit, point.y - 2 * unit, 4 * unit, 4 * unit);
	}

	ctx.fillStyle = RED;
	for (const enemy of state.enemies) {
		if (!enemy.alive) continue;
		const point = plot(enemy.x, enemy.z);
		if (!point) continue;
		if (enemy.kind === "turret") {
			ctx.beginPath();
			ctx.arc(point.x, point.y, 2.2 * unit, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.fillRect(point.x - 2 * unit, point.y - 2 * unit, 4 * unit, 4 * unit);
		}
	}

	const nav = plot(state.navX, state.navZ);
	if (nav) {
		ctx.fillStyle = "#ffffff";
		drawDiamond(ctx, nav.x, nav.y, 4 * unit);
	}

	ctx.fillStyle = GREEN;
	ctx.beginPath();
	ctx.arc(cx, cy, 2.5 * unit, 0, Math.PI * 2);
	ctx.fill();
}

function drawBars(ctx: CanvasRenderingContext2D, width: number, height: number, unit: number) {
	const state = useBattle.getState();
	const x = width / 2 - 110 * unit;
	const y = height - Math.max(72, 46 * unit);
	const maxHull = state.hullMax || MAX_HULL;
	bar(
		ctx,
		x,
		y,
		220 * unit,
		8 * unit,
		state.player.hp / maxHull,
		state.player.hp < maxHull * 0.35 ? RED : GREEN,
	);
	ctx.fillStyle = DIM;
	ctx.textAlign = "left";
	ctx.fillText(state.seat === "tank" ? "HULL" : "SUIT", x, y - 10 * unit);
	ctx.textAlign = "right";
	ctx.fillStyle = GREEN;
	ctx.fillText(String(Math.ceil(state.player.hp)), x + 220 * unit, y - 10 * unit);

	const heatY = y + 18 * unit;
	bar(
		ctx,
		x,
		heatY,
		220 * unit,
		4 * unit,
		state.player.heat,
		state.player.overheat > 0 ? RED : AMBER,
	);
}

function bar(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	ratio: number,
	color: string,
) {
	ctx.fillStyle = "rgba(0,0,0,0.4)";
	ctx.fillRect(x, y, width, height);
	ctx.fillStyle = color;
	ctx.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), height);
}

function drawReadout(ctx: CanvasRenderingContext2D, width: number, height: number, unit: number) {
	const state = useBattle.getState();
	const speed = Math.hypot(state.player.vx, state.player.vz) * 3.6;
	const navDist = Math.hypot(state.navX - state.player.x, state.navZ - state.player.z);
	const citadel = state.structures.find((item) => item.kind === "citadel");
	const relays = state.structures.filter((item) => item.kind === "relay" && item.alive).length;
	const right = width - 24 * unit;
	const stack = height - Math.max(96, 78 * unit);
	ctx.textAlign = "right";
	ctx.fillStyle = GREEN;
	ctx.fillText(`SPD ${Math.round(speed)}`, right, stack);
	ctx.fillText(`BOOST ${Math.round(state.boost * 100)}`, right, stack + 16 * unit);
	ctx.fillStyle = state.player.missiles > 0 ? GREEN : RED;
	ctx.fillText(`MISSILE ${state.player.missiles}/${MAX_MISSILES}`, right, stack + 32 * unit);
	ctx.fillStyle = DIM;
	ctx.fillText(state.view === "near" ? "CAM NEAR" : "CAM FAR", right, stack + 48 * unit);

	ctx.textAlign = "left";
	ctx.fillStyle = GREEN;
	const objective = state.won || !citadel?.alive ? "BASIN SECURED" : "DESTROY CITADEL";
	ctx.fillText(objective, 24 * unit, 22 * unit);
	ctx.fillStyle = DIM;
	ctx.fillText(`NAV ${formatKm(navDist)}`, 24 * unit, 40 * unit);
	ctx.fillText(`RELAYS ${relays}`, 24 * unit, 56 * unit);
	const chassis = CHASSIS[state.rigs[state.ridden]?.chassis ?? "lance"];
	const seatName =
		state.seat === "rts" ? "COMMAND" : state.seat === "foot" ? "ON FOOT" : chassis.label;
	ctx.fillText(seatName, 24 * unit, 74 * unit);
	ctx.fillText(`SCRAP ${state.scrap}`, 24 * unit, 90 * unit);
	if (state.seat !== "rts" && nearCommand()) {
		ctx.fillStyle = "#ffffff";
		ctx.textAlign = "center";
		ctx.font = `700 ${Math.round(16 * unit)}px ui-monospace, monospace`;
		ctx.fillText("E  ENTER COMMAND", width / 2, height * 0.56);
	}
	if (state.banner) {
		ctx.fillStyle = "#ffffff";
		ctx.textAlign = "center";
		ctx.font = `700 ${Math.round(18 * unit)}px ui-monospace, monospace`;
		ctx.fillText(state.banner, width / 2, height * 0.72);
	}
	if (state.age < 16) {
		ctx.globalAlpha = clamp01((16 - state.age) / 3);
		ctx.fillStyle = DIM;
		ctx.textAlign = "center";
		ctx.font = `600 ${Math.round(12 * unit)}px ui-monospace, monospace`;
		ctx.fillText(
			"E AT THE BASE ENTERS COMMAND  ·  CLICK CANNON  ·  F MISSILE  ·  ESC PAUSE",
			width / 2,
			height * 0.62,
		);
		ctx.globalAlpha = 1;
	}
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function drawMapIcons(ctx: CanvasRenderingContext2D, width: number, height: number) {
	const state = useBattle.getState();
	ctx.clearRect(0, 0, width, height);
	const mark = (x: number, z: number, color: string, size: number) => {
		const point = worldToMap(x, z, width, height);
		ctx.fillStyle = color;
		ctx.fillRect(point.x - size, point.y - size, size * 2, size * 2);
	};

	for (const structure of state.structures) {
		if (!structure.placed) continue;
		if (structure.kind === "base") mark(structure.x, structure.z, GREEN, 4);
		else if (structure.kind === "supply") mark(structure.x, structure.z, "#8dffb0", 3);
		else if (structure.kind === "tower") mark(structure.x, structure.z, "#7ee0ff", 3);
		else if (!structure.alive) mark(structure.x, structure.z, "rgba(255,255,255,0.35)", 3);
		else if (structure.kind === "citadel") mark(structure.x, structure.z, MAGENTA, 6);
		else mark(structure.x, structure.z, AMBER, 4);
	}

	ctx.fillStyle = "#9ad0ff";
	for (const rig of state.rigs) {
		if (!rig.alive || rig.occupied) continue;
		mark(rig.x, rig.z, rig.role === "builder" ? "#ffb15a" : "#9ad0ff", 3);
	}

	ctx.fillStyle = RED;
	for (const enemy of state.enemies) {
		if (!enemy.alive) continue;
		if (Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z) > RADAR_RANGE) continue;
		mark(enemy.x, enemy.z, RED, 2);
	}

	const nav = worldToMap(state.navX, state.navZ, width, height);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 2;
	ctx.strokeRect(nav.x - 6, nav.y - 6, 12, 12);

	const player = worldToMap(state.player.x, state.player.z, width, height);
	const heading = headingOf(state.aimYaw);
	ctx.save();
	ctx.translate(player.x, player.y);
	ctx.rotate(heading);
	ctx.fillStyle = GREEN;
	ctx.beginPath();
	ctx.moveTo(0, -8);
	ctx.lineTo(5, 6);
	ctx.lineTo(-5, 6);
	ctx.closePath();
	ctx.fill();
	ctx.restore();

	ctx.fillStyle = "rgba(214, 255, 106, 0.8)";
	ctx.font = "600 12px ui-monospace, monospace";
	ctx.textAlign = "left";
	ctx.fillText("2 KM", 16, height - 18);
	ctx.strokeStyle = GREEN;
	ctx.strokeRect(16, height - 14, (2000 / WORLD) * width, 3);
	ctx.fillStyle = DIM;
	ctx.fillText(`${(WORLD / 1000).toFixed(0)} KM BASIN`, 16, 20);
}
