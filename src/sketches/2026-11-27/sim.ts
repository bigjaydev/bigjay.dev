/** 4-corner buggy: pitch + roll, springs/tires/engine — feeds side + top views. */

export type Params = {
	springRate: number;
	springDamp: number;
	tirePressure: number;
	peakTorque: number;
	redline: number;
	throttle: number;
};

export type Telemetry = {
	speed: number;
	rpm: number;
	torque: number;
	powerKw: number;
	/** RL, RR, FL, FR compression (m) */
	springTravel: [number, number, number, number];
	tireDeflect: [number, number, number, number];
	loadN: [number, number, number, number];
	grip: number;
	rollDeg: number;
	pitchDeg: number;
};

export type WheelState = {
	/** world position */
	x: number;
	y: number;
	z: number;
	spin: number;
	omega: number;
	springLen: number;
	tireSquash: number;
	onGround: boolean;
	normalN: number;
};

export type SimState = {
	x: number;
	y: number;
	/** lateral offset (kept near 0; used for top-view path) */
	z: number;
	/** pitch (rotation about z) */
	theta: number;
	/** roll (rotation about x) */
	phi: number;
	vx: number;
	vy: number;
	vz: number;
	omegaPitch: number;
	omegaRoll: number;
	/** RL, RR, FL, FR */
	wheels: [WheelState, WheelState, WheelState, WheelState];
	rpm: number;
	torque: number;
	powerKw: number;
	time: number;
};

const G = 9.81;
const MASS = 520;
const INERTIA_PITCH = 420;
const INERTIA_ROLL = 180;
const WHEELBASE = 2.4;
const TRACK = 1.55;
const ATTACH_Y = -0.06;
const SUSP_REST = 0.58;
const SUSP_MIN = 0.16;
const WHEEL_R0 = 0.38;
const GEAR = 3.6;
const DIFF = 3.4;

/** Local hardpoints: rear-left, rear-right, front-left, front-right */
export const CORNERS = [
	{ lx: -WHEELBASE * 0.5, lz: -TRACK * 0.5, label: "RL" },
	{ lx: -WHEELBASE * 0.5, lz: TRACK * 0.5, label: "RR" },
	{ lx: WHEELBASE * 0.5, lz: -TRACK * 0.5, label: "FL" },
	{ lx: WHEELBASE * 0.5, lz: TRACK * 0.5, label: "FR" },
] as const;

export const DEFAULT_PARAMS: Params = {
	springRate: 16000,
	springDamp: 2200,
	tirePressure: 28,
	peakTorque: 280,
	redline: 6200,
	throttle: 0.45,
};

export function createSim(): SimState {
	const ground = terrainHeight(0, 0);
	const y0 = ground + SUSP_REST + WHEEL_R0 - ATTACH_Y;
	return {
		x: 0,
		y: y0,
		z: 0,
		theta: 0,
		phi: 0,
		vx: 6,
		vy: 0,
		vz: 0,
		omegaPitch: 0,
		omegaRoll: 0,
		wheels: [makeWheel(), makeWheel(), makeWheel(), makeWheel()],
		rpm: 1600,
		torque: 0,
		powerKw: 0,
		time: 0,
	};
}

function makeWheel(): WheelState {
	return {
		x: 0,
		y: 0,
		z: 0,
		spin: 0,
		omega: 0,
		springLen: SUSP_REST,
		tireSquash: 0,
		onGround: true,
		normalN: (MASS * G) / 4,
	};
}

/** Rough trail with lateral (z) variation so left/right springs differ. */
export function terrainHeight(x: number, z: number): number {
	return (
		0.48 * Math.sin(x * 0.32) +
		0.24 * Math.sin(x * 0.85 + 1.1) +
		0.14 * Math.sin(x * 1.65 + 0.5) +
		0.07 * Math.sin(x * 3.2 + 2.0) +
		0.04 * Math.sin(x * 6.8 + 0.8) +
		0.16 * Math.sin(x * 0.55 + z * 1.8) +
		0.1 * Math.sin(z * 2.4 + x * 0.4) +
		0.05 * Math.sin(x * 2.1 - z * 3.1)
	);
}

export function terrainSlopeX(x: number, z: number): number {
	const e = 0.05;
	return (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
}

export function tireStiffness(psi: number): number {
	const p = clamp(psi, 8, 55);
	return 5000 + p * p * 28;
}

export function tireGrip(psi: number): number {
	const d = (psi - 30) / 14;
	return clamp(1 - d * d * 0.85, 0.25, 1);
}

export function rollingResist(psi: number): number {
	return 40 + Math.max(0, 32 - psi) * 5;
}

export function engineTorque(rpm: number, peakTorque: number, redline: number, throttle: number): number {
	const r = clamp(rpm / Math.max(800, redline), 0, 1.05);
	let shape: number;
	if (r < 0.12) shape = 0.35 + r * 2.2;
	else if (r < 0.55) shape = 0.6 + ((r - 0.12) * 0.4) / 0.43;
	else if (r < 0.92) shape = 1 - (r - 0.55) * 0.35;
	else shape = Math.max(0.12, 0.87 - (r - 0.92) * 4.5);
	return peakTorque * clamp(shape, 0, 1) * clamp(throttle, 0, 1);
}

export function enginePowerKw(torqueNm: number, rpm: number): number {
	return (torqueNm * rpm * Math.PI) / 30000;
}

/** Body-local → world (pitch about z, then roll about body-x). */
export function bodyToWorld(
	s: SimState,
	lx: number,
	ly: number,
	lz: number,
): { x: number; y: number; z: number } {
	const cp = Math.cos(s.phi);
	const sp = Math.sin(s.phi);
	const ct = Math.cos(s.theta);
	const st = Math.sin(s.theta);
	// roll about x, then pitch about z
	const y1 = ly * cp - lz * sp;
	const z1 = ly * sp + lz * cp;
	const x2 = lx * ct - y1 * st;
	const y2 = lx * st + y1 * ct;
	return { x: s.x + x2, y: s.y + y2, z: s.z + z1 };
}

export function step(state: SimState, params: Params, dt: number): SimState {
	const h = Math.min(dt, 1 / 45);
	const sub = Math.max(1, Math.ceil(h / (1 / 280)));
	const subDt = h / sub;
	let s = state;
	for (let i = 0; i < sub; i++) s = substep(s, params, subDt);
	return s;
}

function substep(s: SimState, p: Params, dt: number): SimState {
	let fx = 0;
	let fy = -MASS * G;
	let fz = 0;
	let mPitch = 0;
	let mRoll = 0;

	const radius = WHEEL_R0 * (0.94 + clamp(p.tirePressure, 10, 50) * 0.002);
	const kTire = tireStiffness(p.tirePressure);
	const cTire = 200 + p.tirePressure * 6;
	const grip = tireGrip(p.tirePressure);
	const rr = rollingResist(p.tirePressure);

	const wheels: SimState["wheels"] = [
		{ ...s.wheels[0]! },
		{ ...s.wheels[1]! },
		{ ...s.wheels[2]! },
		{ ...s.wheels[3]! },
	];

	const wheelOmegaAvg =
		0.25 *
		(Math.abs(wheels[0]!.omega) +
			Math.abs(wheels[1]!.omega) +
			Math.abs(wheels[2]!.omega) +
			Math.abs(wheels[3]!.omega));
	const wheelRpm = (wheelOmegaAvg * 60) / (2 * Math.PI);
	const rpmTarget = clamp(wheelRpm * GEAR * DIFF, 800, p.redline * 1.02);
	const rpm = s.rpm + (rpmTarget - s.rpm) * clamp(dt * 6, 0, 1);
	const engTorque = engineTorque(rpm, p.peakTorque, p.redline, p.throttle);
	const powerKw = enginePowerKw(engTorque, rpm);
	const axleDrive = (engTorque * GEAR * DIFF * 0.88) / 4;

	const ct = Math.cos(s.theta);
	const st = Math.sin(s.theta);
	const cp = Math.cos(s.phi);
	const sp = Math.sin(s.phi);
	// body "up" in world (after roll+pitch)
	const upX = -st * cp;
	const upY = ct * cp;
	const upZ = sp;
	const downX = -upX;
	const downY = -upY;
	const downZ = -upZ;

	for (let i = 0; i < 4; i++) {
		const c = CORNERS[i]!;
		const attach = bodyToWorld(s, c.lx, ATTACH_Y, c.lz);
		const w = wheels[i]!;
		const prevLen = w.springLen;

		const gx = attach.x;
		const gz = attach.z;
		const gy = terrainHeight(gx, gz);
		const slope = terrainSlopeX(gx, gz);
		const nLen = Math.hypot(-slope, 1) || 1;
		const ngx = -slope / nLen;
		const ngy = 1 / nLen;
		const ngz = 0;
		const tx = ngy;
		const ty = -ngx;
		const tz = 0;

		const denom = downX * ngx + downY * ngy + downZ * ngz;
		let springLen = SUSP_REST;
		let tireSquash = 0;
		let onGround = false;
		let normalN = 0;

		if (denom < -0.15) {
			const tTouch =
				(radius - ((attach.x - gx) * ngx + (attach.y - gy) * ngy + (attach.z - gz) * ngz)) / denom;
			if (tTouch < SUSP_REST + 0.03) {
				onGround = true;
				const overload = Math.max(0, SUSP_REST - tTouch);
				const share = p.springRate / (p.springRate + kTire);
				tireSquash = clamp(overload * share * 0.9, 0, radius * 0.4);
				springLen = clamp(tTouch + tireSquash * 0.35, SUSP_MIN, SUSP_REST);
			}
		}

		const wheelPos = {
			x: attach.x + springLen * downX,
			y: attach.y + springLen * downY,
			z: attach.z + springLen * downZ,
		};

		const springVel = (springLen - prevLen) / Math.max(dt, 1e-4);
		const compress = SUSP_REST - springLen;
		const springForce = p.springRate * compress - p.springDamp * springVel;

		const sFx = -downX * springForce;
		const sFy = -downY * springForce;
		const sFz = -downZ * springForce;
		fx += sFx;
		fy += sFy;
		fz += sFz;

		const rx = attach.x - s.x;
		const ry = attach.y - s.y;
		const rz = attach.z - s.z;
		// pitch moment about z: rx*Fy - ry*Fx
		mPitch += rx * sFy - ry * sFx;
		// roll moment about x: ry*Fz - rz*Fy
		mRoll += ry * sFz - rz * sFy;

		if (onGround) {
			const wheelVelN =
				s.vx * ngx +
				s.vy * ngy +
				s.vz * ngz +
				springVel * denom;
			normalN = Math.max(0, springForce + kTire * tireSquash - cTire * Math.min(0, wheelVelN));

			const isRear = i < 2;
			const driveShare = isRear ? 0.35 : 0.15;
			const maxF = Math.max(80, normalN * grip * 1.05);
			const driveF = clamp(axleDrive * driveShare / Math.max(0.2, radius - tireSquash), -maxF, maxF);
			fx += tx * driveF;
			fy += ty * driveF;
			fz += tz * driveF;
			mPitch += rx * (ty * driveF) - ry * (tx * driveF);

			const vT = s.vx * tx + s.vy * ty;
			const resist = Math.sign(vT || 1) * Math.min(rr * (0.5 + Math.abs(vT) * 0.05), maxF * 0.35);
			fx -= tx * resist;
			fy -= ty * resist;

			if (tireSquash > 0.002) {
				const tF = kTire * tireSquash * 0.18;
				fx += ngx * tF;
				fy += ngy * tF;
				mPitch += rx * (ngy * tF) - ry * (ngx * tF);
				mRoll += ry * (ngz * tF) - rz * (ngy * tF);
			}
		}

		const vAlong = s.vx * tx + s.vy * ty;
		const targetOmega = onGround ? vAlong / Math.max(0.18, radius - tireSquash) : w.omega * 0.992;
		const omega = w.omega + (targetOmega - w.omega) * clamp(dt * 16, 0, 1);

		wheels[i] = {
			x: wheelPos.x,
			y: wheelPos.y,
			z: wheelPos.z,
			spin: w.spin + omega * dt,
			omega,
			springLen,
			tireSquash,
			onGround,
			normalN,
		};
	}

	fx -= s.vx * 16;
	fy -= s.vy * 12;
	fz -= s.vz * 40 + s.z * 80; // gently keep path near centerline
	mPitch -= s.omegaPitch * 65;
	mRoll -= s.omegaRoll * 55;

	let vx = s.vx + (fx / MASS) * dt;
	let vy = s.vy + (fy / MASS) * dt;
	let vz = s.vz + (fz / MASS) * dt;
	let omegaPitch = (s.omegaPitch + (mPitch / INERTIA_PITCH) * dt) * 0.997;
	let omegaRoll = (s.omegaRoll + (mRoll / INERTIA_ROLL) * dt) * 0.996;
	let x = s.x + vx * dt;
	let y = s.y + vy * dt;
	let z = clamp(s.z + vz * dt, -1.2, 1.2);
	let theta = clamp(s.theta + omegaPitch * dt, -0.5, 0.5);
	let phi = clamp(s.phi + omegaRoll * dt, -0.4, 0.4);

	const minY = terrainHeight(x, z) + SUSP_MIN + radius * 0.45 - ATTACH_Y;
	if (y < minY) {
		y = minY;
		vy = Math.max(0, vy);
	}

	return {
		x,
		y,
		z,
		theta,
		phi,
		vx,
		vy,
		vz,
		omegaPitch,
		omegaRoll,
		wheels,
		rpm,
		torque: engTorque,
		powerKw,
		time: s.time + dt,
	};
}

export function telemetry(s: SimState, p: Params): Telemetry {
	return {
		speed: Math.hypot(s.vx, s.vy) * 3.6,
		rpm: s.rpm,
		torque: s.torque,
		powerKw: s.powerKw,
		springTravel: [
			SUSP_REST - s.wheels[0]!.springLen,
			SUSP_REST - s.wheels[1]!.springLen,
			SUSP_REST - s.wheels[2]!.springLen,
			SUSP_REST - s.wheels[3]!.springLen,
		],
		tireDeflect: [
			s.wheels[0]!.tireSquash,
			s.wheels[1]!.tireSquash,
			s.wheels[2]!.tireSquash,
			s.wheels[3]!.tireSquash,
		],
		loadN: [
			s.wheels[0]!.normalN,
			s.wheels[1]!.normalN,
			s.wheels[2]!.normalN,
			s.wheels[3]!.normalN,
		],
		grip: tireGrip(p.tirePressure),
		rollDeg: (s.phi * 180) / Math.PI,
		pitchDeg: (s.theta * 180) / Math.PI,
	};
}

export function torqueCurveSample(
	peakTorque: number,
	redline: number,
	throttle: number,
	steps = 48,
): Array<{ rpm: number; torque: number; powerKw: number }> {
	const out = [];
	for (let i = 0; i <= steps; i++) {
		const rpm = 800 + ((redline - 800) * i) / steps;
		const torque = engineTorque(rpm, peakTorque, redline, throttle);
		out.push({ rpm, torque, powerKw: enginePowerKw(torque, rpm) });
	}
	return out;
}

export const META = {
	mass: MASS,
	wheelbase: WHEELBASE,
	track: TRACK,
	suspRest: SUSP_REST,
	wheelR0: WHEEL_R0,
	attachY: ATTACH_Y,
};

function clamp(n: number, lo: number, hi: number) {
	return Math.min(hi, Math.max(lo, n));
}
