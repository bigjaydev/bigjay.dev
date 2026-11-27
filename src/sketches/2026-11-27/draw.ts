import {
	CORNERS,
	META,
	bodyToWorld,
	terrainHeight,
	torqueCurveSample,
	type Params,
	type SimState,
	type Telemetry,
} from "./sim";

const COL = {
	skyTop: "#1a2430",
	skyBot: "#3d4a3a",
	dust: "#c4a574",
	earth: "#5c4632",
	earthDeep: "#2e2418",
	steel: "#8a9399",
	body: "#b84a2a",
	bodyDark: "#6e2a16",
	frame: "#2a2e32",
	spring: "#e0c86a",
	springHot: "#e05a3a",
	damper: "#7a8894",
	tire: "#1c1c1c",
	rim: "#c8ced4",
	accent: "#e8a23a",
	hud: "#dfe6dc",
	hudDim: "#8a9688",
	panel: "rgba(18,22,26,0.78)",
	good: "#7cb87a",
	warn: "#e8a23a",
	hot: "#e05a3a",
	topBg: "#151c22",
	trail: "#3a4540",
};

export function drawScene(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	state: SimState,
	params: Params,
	tel: Telemetry,
) {
	ctx.clearRect(0, 0, w, h);

	const split = Math.round(h * 0.42);
	const pad = 8;

	// --- TOP VIEW ---
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, w, split);
	ctx.clip();
	drawTopView(ctx, w, split, state, params, tel);
	ctx.restore();

	// divider
	ctx.fillStyle = "rgba(232,226,200,0.14)";
	ctx.fillRect(0, split - 1, w, 2);

	// --- SIDE VIEW ---
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, split, w, h - split);
	ctx.clip();
	ctx.translate(0, split);
	drawSideView(ctx, w, h - split, state, params, tel);
	ctx.restore();

	// view labels
	labelView(ctx, pad + 4, pad + 14, "TOP VIEW");
	labelView(ctx, pad + 4, split + 16, "SIDE VIEW");

	drawHudStrip(ctx, w, h, state, params, tel);
}

function labelView(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
	ctx.fillStyle = "rgba(18,22,26,0.55)";
	const tw = ctx.measureText(text).width || 70;
	roundRect(ctx, x - 4, y - 11, tw + 14, 16, 3);
	ctx.fill();
	ctx.fillStyle = COL.hudDim;
	ctx.font = "600 10px Inter, system-ui, sans-serif";
	ctx.textAlign = "left";
	ctx.fillText(text, x, y);
}

function drawTopView(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	state: SimState,
	params: Params,
	tel: Telemetry,
) {
	ctx.fillStyle = COL.topBg;
	ctx.fillRect(0, 0, w, h);

	const scale = Math.min(w * 0.09, h * 0.28);
	const ox = w * 0.36;
	const oy = h * 0.52;

	const toScreen = (wx: number, wz: number) => ({
		x: ox + (wx - state.x) * scale,
		y: oy - (wz - state.z) * scale,
	});

	// trail band + height shading
	drawTopTerrain(ctx, w, h, state, scale, ox, oy);

	// ghost path ticks
	ctx.strokeStyle = "rgba(223,230,220,0.08)";
	ctx.lineWidth = 1;
	for (let dx = -8; dx <= 14; dx += 2) {
		const a = toScreen(state.x + dx, -1.4);
		const b = toScreen(state.x + dx, 1.4);
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		ctx.lineTo(b.x, b.y);
		ctx.stroke();
	}

	// springs + wheels under body
	for (let i = 0; i < 4; i++) {
		const c = CORNERS[i]!;
		const attach = bodyToWorld(state, c.lx, META.attachY, c.lz);
		const wheel = state.wheels[i]!;
		const A = toScreen(attach.x, attach.z);
		const W = toScreen(wheel.x, wheel.z);

		const travel = META.suspRest - wheel.springLen;
		const compressN = clamp(travel / (META.suspRest - 0.16), 0, 1);

		// strut line from body hardpoint to tire
		drawTopSpring(ctx, A.x, A.y, W.x, W.y, compressN, params.springRate);

		// tire footprint — fatter when soft / squashed
		const tread = META.wheelR0 * scale * (0.85 + (48 - params.tirePressure) * 0.008);
		const squash = 1 + wheel.tireSquash * 2.2;
		ctx.fillStyle = COL.tire;
		ctx.beginPath();
		ctx.ellipse(W.x, W.y, tread * 0.55 * squash, tread * squash, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = COL.rim;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.ellipse(W.x, W.y, tread * 0.28, tread * 0.55, 0, 0, Math.PI * 2);
		ctx.stroke();

		// travel readout
		ctx.fillStyle = compressN > 0.7 ? COL.hot : COL.hud;
		ctx.font = "600 9px 'IBM Plex Mono', ui-monospace, monospace";
		ctx.textAlign = "center";
		ctx.fillText(`${c.label} ${(travel * 1000) | 0}`, W.x, W.y + tread * squash + 11);
	}

	// chassis body (top silhouette) with roll tilt cue
	const cg = toScreen(state.x, state.z);
	ctx.save();
	ctx.translate(cg.x, cg.y);
	ctx.rotate(-state.phi * 0.35); // subtle visual roll in plan

	const L = META.wheelbase * scale;
	const T = META.track * scale;

	ctx.fillStyle = COL.bodyDark;
	roundRect(ctx, -L * 0.52, -T * 0.38, L * 1.04, T * 0.76, 8);
	ctx.fill();
	ctx.fillStyle = COL.body;
	roundRect(ctx, -L * 0.42, -T * 0.28, L * 0.7, T * 0.56, 6);
	ctx.fill();
	ctx.fillStyle = COL.steel;
	roundRect(ctx, L * 0.22, -T * 0.22, L * 0.28, T * 0.44, 4);
	ctx.fill();

	// cabin
	ctx.strokeStyle = COL.rim;
	ctx.lineWidth = 2;
	roundRect(ctx, -L * 0.12, -T * 0.18, L * 0.28, T * 0.36, 3);
	ctx.stroke();

	// CG
	ctx.fillStyle = COL.accent;
	ctx.beginPath();
	ctx.arc(0, 0, 3, 0, Math.PI * 2);
	ctx.fill();

	// heading arrow
	ctx.strokeStyle = COL.accent;
	ctx.fillStyle = COL.accent;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(L * 0.55, 0);
	ctx.lineTo(L * 0.42, -5);
	ctx.lineTo(L * 0.42, 5);
	ctx.closePath();
	ctx.fill();

	ctx.restore();

	// roll / pitch callouts
	ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
	ctx.textAlign = "left";
	ctx.fillStyle = COL.hudDim;
	ctx.fillText(`roll ${tel.rollDeg.toFixed(1)}°`, w - 110, 22);
	ctx.fillText(`pitch ${tel.pitchDeg.toFixed(1)}°`, w - 110, 38);
}

function drawTopTerrain(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	state: SimState,
	scale: number,
	ox: number,
	oy: number,
) {
	const cols = 48;
	const rows = 18;
	const x0 = state.x - ox / scale - 1;
	const x1 = state.x + (w - ox) / scale + 1;
	const z0 = state.z - oy / scale - 0.5;
	const z1 = state.z + (h - oy) / scale + 0.5;

	for (let j = 0; j < rows; j++) {
		for (let i = 0; i < cols; i++) {
			const u0 = i / cols;
			const u1 = (i + 1) / cols;
			const v0 = j / rows;
			const v1 = (j + 1) / rows;
			const xa = x0 + (x1 - x0) * u0;
			const xb = x0 + (x1 - x0) * u1;
			const za = z0 + (z1 - z0) * v0;
			const zb = z0 + (z1 - z0) * v1;
			const hm = terrainHeight((xa + xb) * 0.5, (za + zb) * 0.5);
			const shade = clamp(0.35 + hm * 0.35, 0.2, 0.75);
			ctx.fillStyle = `rgba(${90 + shade * 80 | 0},${70 + shade * 50 | 0},${40 + shade * 30 | 0},${0.55})`;
			const p00 = { x: ox + (xa - state.x) * scale, y: oy - (za - state.z) * scale };
			const p11 = { x: ox + (xb - state.x) * scale, y: oy - (zb - state.z) * scale };
			ctx.fillRect(p00.x, p11.y, p11.x - p00.x + 1, p00.y - p11.y + 1);
		}
	}
}

function drawTopSpring(
	ctx: CanvasRenderingContext2D,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	compressN: number,
	rate: number,
) {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len;
	const uy = dy / len;
	const px = -uy;
	const py = ux;
	const coils = 6;
	const amp = (4.5 + clamp((20000 - rate) / 5000, -1, 2)) * (1.15 - compressN * 0.55);

	ctx.strokeStyle = compressN > 0.65 ? COL.springHot : COL.spring;
	ctx.lineWidth = 2.2;
	ctx.beginPath();
	ctx.moveTo(x0, y0);
	for (let i = 0; i <= coils; i++) {
		const t = i / coils;
		const along = 3 + t * (len - 6);
		const side = i === 0 || i === coils ? 0 : i % 2 === 0 ? amp : -amp;
		ctx.lineTo(x0 + ux * along + px * side, y0 + uy * along + py * side);
	}
	ctx.stroke();
}

function drawSideView(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	state: SimState,
	params: Params,
	tel: Telemetry,
) {
	drawSideSky(ctx, w, h);

	const scale = Math.min(w, h) * 0.14;
	const camX = state.x;
	const camY = state.y * 0.5 + terrainHeight(state.x, state.z) * 0.25;
	const ox = w * 0.34;
	const oy = h * 0.55;

	const toScreen = (wx: number, wy: number) => ({
		x: ox + (wx - camX) * scale,
		y: oy - (wy - camY) * scale,
	});

	drawSideTerrain(ctx, w, h, camX, camY, scale, ox, oy, state.z);

	// Draw far (right) wheels first, then near (left), so depth reads
	const order = [1, 3, 0, 2]; // RR, FR, RL, FL
	for (const i of order) {
		const c = CORNERS[i]!;
		const attach = bodyToWorld(state, c.lx, META.attachY, c.lz);
		const wheel = state.wheels[i]!;
		const A = toScreen(attach.x, attach.y);
		const W = toScreen(wheel.x, wheel.y);
		const near = c.lz < 0;
		const travel = META.suspRest - wheel.springLen;
		const compressN = clamp(travel / (META.suspRest - 0.16), 0, 1);

		ctx.globalAlpha = near ? 1 : 0.45;
		drawSideSpring(ctx, A.x, A.y, W.x, W.y, compressN, params.springRate);
		drawSideWheel(
			ctx,
			W.x,
			W.y,
			META.wheelR0 * scale * (near ? 1 : 0.92),
			wheel.spin,
			wheel.tireSquash * scale,
			params.tirePressure,
			near,
		);
		ctx.globalAlpha = 1;

		if (near) {
			ctx.fillStyle = compressN > 0.7 ? COL.hot : COL.hud;
			ctx.font = "600 9px 'IBM Plex Mono', ui-monospace, monospace";
			ctx.textAlign = "center";
			ctx.fillText(`${(travel * 1000) | 0} mm`, W.x, W.y + META.wheelR0 * scale + 12);
		}
	}

	// chassis side profile
	const cg = toScreen(state.x, state.y);
	ctx.save();
	ctx.translate(cg.x, cg.y);
	ctx.rotate(-state.theta);

	const L = META.wheelbase * scale;
	const bodyH = 0.4 * scale;

	ctx.strokeStyle = COL.frame;
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(-L * 0.5, 6);
	ctx.lineTo(L * 0.5, 6);
	ctx.stroke();

	ctx.fillStyle = COL.bodyDark;
	roundRect(ctx, -L * 0.48, -bodyH * 0.95, L * 0.96, bodyH, 6);
	ctx.fill();
	ctx.fillStyle = COL.body;
	roundRect(ctx, -L * 0.45, -bodyH * 0.9, L * 0.58, bodyH * 0.78, 5);
	ctx.fill();
	ctx.fillStyle = COL.steel;
	ctx.beginPath();
	ctx.moveTo(L * 0.1, -bodyH * 0.55);
	ctx.lineTo(L * 0.5, -bodyH * 0.12);
	ctx.lineTo(L * 0.5, bodyH * 0.18);
	ctx.lineTo(L * 0.1, bodyH * 0.28);
	ctx.closePath();
	ctx.fill();

	ctx.strokeStyle = COL.rim;
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo(-L * 0.06, -bodyH * 0.15);
	ctx.quadraticCurveTo(-L * 0.02, -bodyH * 1.5, L * 0.14, -bodyH * 0.15);
	ctx.stroke();

	ctx.fillStyle = COL.accent;
	ctx.beginPath();
	ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore();

	// spring force bars (near axle pair)
	drawSpringMeters(ctx, 12, h - 58, tel);
}

function drawSideSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
	const g = ctx.createLinearGradient(0, 0, 0, h);
	g.addColorStop(0, COL.skyTop);
	g.addColorStop(0.55, "#2a3540");
	g.addColorStop(1, COL.skyBot);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, w, h);

	const sun = ctx.createRadialGradient(w * 0.85, h * 0.18, 4, w * 0.85, h * 0.18, w * 0.32);
	sun.addColorStop(0, "rgba(232,162,58,0.3)");
	sun.addColorStop(1, "rgba(232,162,58,0)");
	ctx.fillStyle = sun;
	ctx.fillRect(0, 0, w, h);
}

function drawSideTerrain(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	camX: number,
	camY: number,
	scale: number,
	ox: number,
	oy: number,
	z: number,
) {
	const x0 = camX - (ox + 40) / scale;
	const x1 = camX + (w - ox + 40) / scale;
	const step = 0.08;

	// far track (right side z)
	ctx.beginPath();
	ctx.moveTo(-2, h + 2);
	for (let x = x0; x <= x1; x += step) {
		const y = terrainHeight(x, z + META.track * 0.5);
		const p = { x: ox + (x - camX) * scale, y: oy - (y - camY) * scale };
		if (x === x0) ctx.lineTo(p.x, p.y);
		else ctx.lineTo(p.x, p.y);
	}
	ctx.lineTo(w + 2, h + 2);
	ctx.closePath();
	ctx.fillStyle = "rgba(70,55,40,0.55)";
	ctx.fill();

	// near track
	ctx.beginPath();
	ctx.moveTo(-2, h + 2);
	for (let x = x0; x <= x1; x += step) {
		const y = terrainHeight(x, z - META.track * 0.5);
		const p = { x: ox + (x - camX) * scale, y: oy - (y - camY) * scale };
		if (x === x0) ctx.lineTo(p.x, p.y);
		else ctx.lineTo(p.x, p.y);
	}
	ctx.lineTo(w + 2, h + 2);
	ctx.closePath();
	const dirt = ctx.createLinearGradient(0, oy - 60, 0, h);
	dirt.addColorStop(0, COL.dust);
	dirt.addColorStop(0.4, COL.earth);
	dirt.addColorStop(1, COL.earthDeep);
	ctx.fillStyle = dirt;
	ctx.fill();

	ctx.strokeStyle = "rgba(40,28,16,0.6)";
	ctx.lineWidth = 2;
	ctx.beginPath();
	for (let x = x0; x <= x1; x += step) {
		const y = terrainHeight(x, z - META.track * 0.5);
		const p = { x: ox + (x - camX) * scale, y: oy - (y - camY) * scale };
		if (x === x0) ctx.moveTo(p.x, p.y);
		else ctx.lineTo(p.x, p.y);
	}
	ctx.stroke();
}

function drawSideSpring(
	ctx: CanvasRenderingContext2D,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	compressN: number,
	rate: number,
) {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len;
	const uy = dy / len;
	const px = -uy;
	const py = ux;
	const coils = 9;
	const amp = (6 + clamp((20000 - rate) / 4000, -1.5, 2.5)) * (1.2 - compressN * 0.6);

	ctx.strokeStyle = compressN > 0.65 ? COL.springHot : COL.spring;
	ctx.lineWidth = 2.4;
	ctx.beginPath();
	ctx.moveTo(x0, y0);
	for (let i = 0; i <= coils; i++) {
		const t = i / coils;
		const along = 4 + t * (len - 8);
		const side = i === 0 || i === coils ? 0 : i % 2 === 0 ? amp : -amp;
		ctx.lineTo(x0 + ux * along + px * side, y0 + uy * along + py * side);
	}
	ctx.stroke();

	ctx.strokeStyle = COL.damper;
	ctx.lineWidth = 3;
	ctx.globalAlpha = 0.65;
	ctx.beginPath();
	ctx.moveTo(x0 + ux * len * 0.2 + px * 8, y0 + uy * len * 0.2 + py * 8);
	ctx.lineTo(x0 + ux * len * 0.8 + px * 8, y0 + uy * len * 0.8 + py * 8);
	ctx.stroke();
	ctx.globalAlpha = 1;
}

function drawSideWheel(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	r: number,
	spin: number,
	squash: number,
	psi: number,
	near: boolean,
) {
	const ry = Math.max(r * 0.55, r - squash);
	const rx = r * (0.95 + squash * 0.08);

	ctx.save();
	ctx.translate(x, y);
	ctx.fillStyle = near ? COL.tire : "#2a2a2a";
	ctx.beginPath();
	ctx.ellipse(0, squash * 0.35, rx, ry, 0, 0, Math.PI * 2);
	ctx.fill();

	ctx.strokeStyle = psi < 22 ? "#444" : "#2e2e2e";
	ctx.lineWidth = psi < 22 ? 5 : 3;
	ctx.beginPath();
	ctx.ellipse(0, squash * 0.35, rx * 0.82, ry * 0.82, 0, 0, Math.PI * 2);
	ctx.stroke();

	ctx.rotate(spin);
	ctx.strokeStyle = COL.rim;
	ctx.lineWidth = near ? 2 : 1.2;
	ctx.beginPath();
	ctx.arc(0, squash * 0.35, ry * 0.42, 0, Math.PI * 2);
	ctx.stroke();
	for (let i = 0; i < 5; i++) {
		const a = (i / 5) * Math.PI * 2;
		ctx.beginPath();
		ctx.moveTo(0, squash * 0.35);
		ctx.lineTo(Math.cos(a) * ry * 0.7, squash * 0.35 + Math.sin(a) * ry * 0.7);
		ctx.stroke();
	}
	ctx.restore();
}

function drawSpringMeters(ctx: CanvasRenderingContext2D, x: number, y: number, tel: Telemetry) {
	const labels = ["RL", "RR", "FL", "FR"];
	ctx.font = "9px 'IBM Plex Mono', ui-monospace, monospace";
	ctx.textAlign = "left";
	ctx.fillStyle = COL.hudDim;
	ctx.fillText("SPRING TRAVEL", x, y - 4);

	for (let i = 0; i < 4; i++) {
		const xx = x + i * 72;
		const travel = tel.springTravel[i]!;
		const n = clamp(travel / 0.42, 0, 1);
		ctx.fillStyle = "rgba(0,0,0,0.35)";
		roundRect(ctx, xx, y + 4, 64, 10, 3);
		ctx.fill();
		ctx.fillStyle = n > 0.7 ? COL.hot : n > 0.4 ? COL.warn : COL.good;
		roundRect(ctx, xx, y + 4, 64 * n, 10, 3);
		ctx.fill();
		ctx.fillStyle = COL.hud;
		ctx.fillText(`${labels[i]} ${(travel * 1000) | 0}`, xx, y + 28);
	}
}

function drawHudStrip(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	state: SimState,
	params: Params,
	tel: Telemetry,
) {
	const panelW = Math.min(200, w * 0.26);
	const x = w - panelW - 10;
	const y = 10;
	const panelH = Math.min(h * 0.38, 168);

	ctx.fillStyle = COL.panel;
	roundRect(ctx, x, y, panelW, panelH, 8);
	ctx.fill();
	ctx.strokeStyle = "rgba(223,230,220,0.12)";
	ctx.lineWidth = 1;
	roundRect(ctx, x, y, panelW, panelH, 8);
	ctx.stroke();

	ctx.font = "600 10px Inter, system-ui, sans-serif";
	ctx.fillStyle = COL.hud;
	ctx.textAlign = "left";
	ctx.fillText("ENGINE", x + 10, y + 16);

	ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
	const rows: Array<[string, string]> = [
		["Speed", `${tel.speed.toFixed(0)} km/h`],
		["RPM", `${tel.rpm | 0}`],
		["Torque", `${tel.torque.toFixed(0)} N·m`],
		["Power", `${tel.powerKw.toFixed(1)} kW`],
		["Grip", `${(tel.grip * 100).toFixed(0)}%`],
	];
	rows.forEach(([label, val], i) => {
		const yy = y + 34 + i * 15;
		ctx.fillStyle = COL.hudDim;
		ctx.textAlign = "left";
		ctx.fillText(label, x + 10, yy);
		ctx.fillStyle = COL.hud;
		ctx.textAlign = "right";
		ctx.fillText(val, x + panelW - 10, yy);
	});

	// mini torque curve
	const cx = x + 10;
	const cy = y + panelH - 52;
	const cw = panelW - 20;
	const ch = 40;
	ctx.fillStyle = "rgba(0,0,0,0.28)";
	roundRect(ctx, cx, cy, cw, ch, 4);
	ctx.fill();

	const curve = torqueCurveSample(params.peakTorque, params.redline, 1);
	const maxT = Math.max(...curve.map((c) => c.torque), 1);
	const maxP = Math.max(...curve.map((c) => c.powerKw), 1);

	ctx.strokeStyle = COL.accent;
	ctx.lineWidth = 1.3;
	ctx.beginPath();
	curve.forEach((c, i) => {
		const px = cx + (i / (curve.length - 1)) * cw;
		const py = cy + ch - 4 - (c.torque / maxT) * (ch - 10);
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	});
	ctx.stroke();

	ctx.strokeStyle = COL.good;
	ctx.beginPath();
	curve.forEach((c, i) => {
		const px = cx + (i / (curve.length - 1)) * cw;
		const py = cy + ch - 4 - (c.powerKw / maxP) * (ch - 10);
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	});
	ctx.stroke();

	const rpmN = clamp((state.rpm - 800) / (params.redline - 800), 0, 1);
	ctx.fillStyle = COL.hot;
	ctx.beginPath();
	ctx.arc(
		cx + rpmN * cw,
		cy + ch - 4 - (state.torque / maxT) * (ch - 10),
		2.5,
		0,
		Math.PI * 2,
	);
	ctx.fill();

	drawRpmBar(ctx, 10, h - 28, Math.min(220, w * 0.28), 14, state.rpm, params.redline);
}

function drawRpmBar(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	rpm: number,
	redline: number,
) {
	ctx.fillStyle = "rgba(18,22,26,0.65)";
	roundRect(ctx, x, y, w, h, 3);
	ctx.fill();
	const n = clamp(rpm / redline, 0, 1);
	const fill = ctx.createLinearGradient(x, 0, x + w, 0);
	fill.addColorStop(0, COL.good);
	fill.addColorStop(0.7, COL.warn);
	fill.addColorStop(1, COL.hot);
	ctx.fillStyle = fill;
	roundRect(ctx, x + 2, y + 2, Math.max(0, (w - 4) * n), h - 4, 2);
	ctx.fill();
	ctx.fillStyle = COL.hud;
	ctx.font = "600 9px 'IBM Plex Mono', ui-monospace, monospace";
	ctx.textAlign = "left";
	ctx.fillText(`${rpm | 0} rpm`, x + 6, y + h - 3);
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

function clamp(n: number, lo: number, hi: number) {
	return Math.min(hi, Math.max(lo, n));
}
