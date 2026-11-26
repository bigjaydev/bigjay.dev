import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";

export type GazePoint = { x: number; y: number; confidence: number };

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
	"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Iris + eye / face indices (MediaPipe Face Landmarker). */
const L_IRIS = 468;
const R_IRIS = 473;
const L_OUTER = 33;
const L_INNER = 133;
const L_TOP = 159;
const L_BOTTOM = 145;
const R_OUTER = 263;
const R_INNER = 362;
const R_TOP = 386;
const R_BOTTOM = 374;
const NOSE = 1;
const FOREHEAD = 10;
const CHIN = 152;
const L_CHEEK = 234;
const R_CHEEK = 454;

export type GazeTracker = {
	video: HTMLVideoElement;
	start: () => Promise<void>;
	stop: () => void;
	sample: (nowMs: number) => GazePoint | null;
	/** Call while looking at screen center to zero the reticle. */
	calibrateCenter: () => void;
	ready: () => boolean;
};

export function createGazeTracker(): GazeTracker {
	const video = document.createElement("video");
	video.playsInline = true;
	video.muted = true;
	video.autoplay = true;

	let stream: MediaStream | null = null;
	let landmarker: FaceLandmarker | null = null;
	let lastVideoTime = -1;
	let smoothed: GazePoint = { x: 0.5, y: 0.5, confidence: 0 };
	let rawCenter = { x: 0.5, y: 0.5 };
	let calibrated = false;
	let autoCalibSamples: Array<{ x: number; y: number }> = [];
	let started = false;

	async function start() {
		if (started) return;
		stream = await navigator.mediaDevices.getUserMedia({
			video: {
				facingMode: "user",
				width: { ideal: 1280 },
				height: { ideal: 720 },
				frameRate: { ideal: 30 },
			},
			audio: false,
		});
		video.srcObject = stream;
		await video.play();

		const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
		try {
			landmarker = await FaceLandmarker.createFromOptions(fileset, {
				baseOptions: {
					modelAssetPath: MODEL_URL,
					delegate: "GPU",
				},
				runningMode: "VIDEO",
				numFaces: 1,
				outputFaceBlendshapes: false,
				outputFacialTransformationMatrixes: false,
			});
		} catch {
			// Some GPUs fail MediaPipe GPU; CPU still works.
			landmarker = await FaceLandmarker.createFromOptions(fileset, {
				baseOptions: {
					modelAssetPath: MODEL_URL,
					delegate: "CPU",
				},
				runningMode: "VIDEO",
				numFaces: 1,
			});
		}
		started = true;
		calibrated = false;
		autoCalibSamples = [];
	}

	function stop() {
		started = false;
		landmarker?.close();
		landmarker = null;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		video.srcObject = null;
		lastVideoTime = -1;
		calibrated = false;
		autoCalibSamples = [];
	}

	function calibrateCenter() {
		rawCenter = { x: smoothed.x, y: smoothed.y };
		calibrated = true;
		smoothed = { x: 0.5, y: 0.5, confidence: smoothed.confidence };
	}

	function sample(nowMs: number): GazePoint | null {
		if (!landmarker || !started || video.readyState < 2) return null;
		if (video.currentTime === lastVideoTime) {
			return smoothed.confidence > 0.08 ? smoothed : null;
		}
		lastVideoTime = video.currentTime;

		let result: FaceLandmarkerResult;
		try {
			result = landmarker.detectForVideo(video, nowMs);
		} catch {
			return smoothed.confidence > 0.08 ? smoothed : null;
		}

		const face = result.faceLandmarks[0];
		if (!face || face.length < 474) {
			smoothed = {
				...smoothed,
				confidence: Math.max(0, smoothed.confidence * 0.9),
			};
			return smoothed.confidence > 0.08 ? smoothed : null;
		}

		const raw = estimateGaze(face);

		// First ~1s of solid face: assume looking at center → auto zero.
		if (!calibrated && raw.confidence > 0.35) {
			autoCalibSamples.push({ x: raw.x, y: raw.y });
			if (autoCalibSamples.length >= 18) {
				rawCenter = {
					x: avg(autoCalibSamples.map((s) => s.x)),
					y: avg(autoCalibSamples.map((s) => s.y)),
				};
				calibrated = true;
				autoCalibSamples = [];
			}
		}

		const mapped = {
			x: clamp(0.5 + (raw.x - rawCenter.x) * 1.15, 0.03, 0.97),
			y: clamp(0.5 + (raw.y - rawCenter.y) * 1.2, 0.05, 0.95),
			confidence: raw.confidence,
		};

		// Adaptive smooth: snappier on bigger moves, steadier when still.
		const jump = Math.hypot(mapped.x - smoothed.x, mapped.y - smoothed.y);
		const alpha = clamp(0.18 + jump * 1.8, 0.18, 0.55);
		smoothed = {
			x: smoothed.x + (mapped.x - smoothed.x) * alpha,
			y: smoothed.y + (mapped.y - smoothed.y) * alpha,
			confidence: smoothed.confidence + (mapped.confidence - smoothed.confidence) * 0.35,
		};
		return smoothed;
	}

	return {
		video,
		start,
		stop,
		sample,
		calibrateCenter,
		ready: () => started && Boolean(landmarker),
	};
}

type Landmark = { x: number; y: number; z?: number };

/**
 * Head pose is the stable signal; iris adds a little fine aim.
 * Values are in “raw look space” before center calibration.
 */
function estimateGaze(lm: Landmark[]): GazePoint {
	const nose = lm[NOSE]!;
	const forehead = lm[FOREHEAD]!;
	const chin = lm[CHIN]!;
	const leftCheek = lm[L_CHEEK]!;
	const rightCheek = lm[R_CHEEK]!;

	const faceCx = (leftCheek.x + rightCheek.x) * 0.5;
	const faceCy = (forehead.y + chin.y) * 0.5;
	const faceW = Math.max(1e-4, Math.abs(rightCheek.x - leftCheek.x));
	const faceH = Math.max(1e-4, Math.abs(chin.y - forehead.y));

	// Nose offset inside the face ≈ yaw / pitch. Mirror X for selfie cam.
	const headX = 1 - (0.5 + (nose.x - faceCx) / faceW);
	const headY = 0.5 + (nose.y - faceCy) / faceH;

	const left = eyeOffset(lm[L_IRIS]!, lm[L_OUTER]!, lm[L_INNER]!, lm[L_TOP]!, lm[L_BOTTOM]!);
	const right = eyeOffset(lm[R_IRIS]!, lm[R_OUTER]!, lm[R_INNER]!, lm[R_TOP]!, lm[R_BOTTOM]!);
	const irisX = 1 - (left.nx + right.nx) * 0.5;
	const irisY = (left.ny + right.ny) * 0.5;

	// Head carries most of the aim (what you actually do at a monitor).
	const x = clamp(0.5 + (headX - 0.5) * 1.65 + (irisX - 0.5) * 0.55, 0, 1);
	const y = clamp(0.5 + (headY - 0.5) * 1.55 + (irisY - 0.5) * 0.45, 0, 1);

	const eyeOpen = (left.open + right.open) * 0.5;
	const faceSize = clamp(faceW * 2.2, 0.2, 1);
	const confidence = clamp(eyeOpen * 0.7 + faceSize * 0.4, 0.2, 1);

	return { x, y, confidence };
}

function eyeOffset(
	iris: Landmark,
	outer: Landmark,
	inner: Landmark,
	top: Landmark,
	bottom: Landmark,
): { nx: number; ny: number; open: number } {
	const midX = (outer.x + inner.x) * 0.5;
	const midY = (top.y + bottom.y) * 0.5;
	const halfW = Math.max(1e-4, Math.hypot(inner.x - outer.x, inner.y - outer.y) * 0.5);
	const halfH = Math.max(1e-4, Math.abs(bottom.y - top.y) * 0.5 + 1e-4);
	const nx = clamp(0.5 + (iris.x - midX) / (halfW * 2), 0, 1);
	const ny = clamp(0.5 + (iris.y - midY) / (halfH * 2), 0, 1);
	const open = clamp(Math.abs(bottom.y - top.y) / (halfW * 0.85), 0, 1);
	return { nx, ny, open };
}

function avg(xs: number[]) {
	return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

function clamp(n: number, min: number, max: number) {
	return Math.min(max, Math.max(min, n));
}
