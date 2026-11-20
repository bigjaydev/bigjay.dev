import { useEffect, useRef } from "react";

export type MistLayer = {
	band: number;
	spread: number;
	density: number;
	speed: number;
	seed: number;
};

type Props = {
	layers: MistLayer[];
	className?: string;
};

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_res;
uniform float u_band;
uniform float u_spread;
uniform float u_density;
uniform float u_speed;
uniform float u_seed;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1 + u_seed, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / max(u_res.y, 1.0);
  float t = u_time * u_speed;

  vec2 p = vec2(uv.x * aspect, uv.y) * 1.8;
  vec2 warp = vec2(
    fbm(p + vec2(t * 0.35, t * 0.12) + u_seed),
    fbm(p + vec2(-t * 0.18, t * 0.28) + 3.4 + u_seed)
  );

  float layerA = fbm(p * 1.1 + warp * 1.4 + vec2(t * 0.55, t * 0.08));
  float layerB = fbm(p * 2.2 - warp * 0.9 + vec2(-t * 0.4, t * 0.15) + 5.2);
  float layerC = fbm(p * 3.6 + vec2(t * 0.7, -t * 0.22) + warp.yx * 0.6);

  float mist = layerA * 0.5 + layerB * 0.35 + layerC * 0.28;
  mist = smoothstep(0.22, 0.72, mist);
  mist = pow(mist, 1.15);

  float shear = sin((uv.x * aspect + t * 0.45) * 3.14159 + warp.x * 4.0) * 0.5 + 0.5;
  mist *= mix(0.75, 1.2, shear);

  float band = 1.0 - smoothstep(0.0, u_spread, abs(uv.y - u_band));
  band = pow(band, 1.35);

  float edge = smoothstep(0.0, 0.1, uv.y) * smoothstep(1.0, 0.78, uv.y);
  float alpha = clamp(mist * band * u_density * edge, 0.0, 0.95);

  vec3 cool = vec3(0.82, 0.88, 0.94);
  vec3 warm = vec3(0.94, 0.96, 0.98);
  vec3 col = mix(cool, warm, layerB);

  gl_FragColor = vec4(col, alpha);
}
`;

type Gpu = {
	gl: WebGLRenderingContext;
	program: WebGLProgram;
	buf: WebGLBuffer;
	alive: boolean;
	uTime: WebGLUniformLocation | null;
	uRes: WebGLUniformLocation | null;
	uBand: WebGLUniformLocation | null;
	uSpread: WebGLUniformLocation | null;
	uDensity: WebGLUniformLocation | null;
	uSpeed: WebGLUniformLocation | null;
	uSeed: WebGLUniformLocation | null;
};

function compile(gl: WebGLRenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}

function createGpu(canvas: HTMLCanvasElement): Gpu | null {
	const gl =
		canvas.getContext("webgl", {
			alpha: true,
			premultipliedAlpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			powerPreference: "low-power",
			failIfMajorPerformanceCaveat: false,
		}) ?? canvas.getContext("experimental-webgl");
	if (!gl || !(gl instanceof WebGLRenderingContext)) return null;
	if (gl.isContextLost()) return null;

	const vs = compile(gl, gl.VERTEX_SHADER, VERT);
	const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
	if (!vs || !fs) return null;

	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		gl.deleteProgram(program);
		return null;
	}

	const buf = gl.createBuffer();
	if (!buf) {
		gl.deleteProgram(program);
		return null;
	}

	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

	const aPos = gl.getAttribLocation(program, "a_pos");
	gl.useProgram(program);
	gl.enableVertexAttribArray(aPos);
	gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
	gl.disable(gl.DEPTH_TEST);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	gl.clearColor(0, 0, 0, 0);

	return {
		gl,
		program,
		buf,
		alive: true,
		uTime: gl.getUniformLocation(program, "u_time"),
		uRes: gl.getUniformLocation(program, "u_res"),
		uBand: gl.getUniformLocation(program, "u_band"),
		uSpread: gl.getUniformLocation(program, "u_spread"),
		uDensity: gl.getUniformLocation(program, "u_density"),
		uSpeed: gl.getUniformLocation(program, "u_speed"),
		uSeed: gl.getUniformLocation(program, "u_seed"),
	};
}

function disposeGpu(gpu: Gpu) {
	if (!gpu.alive) return;
	gpu.alive = false;
	const { gl } = gpu;
	try {
		if (!gl.isContextLost()) {
			gl.deleteBuffer(gpu.buf);
			gl.deleteProgram(gpu.program);
		}
	} catch {
		/* context already gone */
	}
}

export default function ThumbMist({ layers, className = "" }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const layersRef = useRef(layers);
	layersRef.current = layers;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let gpu: Gpu | null = null;
		let raf = 0;
		let visible = false;
		let disposed = false;
		const startedAt = performance.now();

		let lastW = 0;
		let lastH = 0;
		let aPos = -1;

		const ensureGpu = () => {
			if (disposed || gpu?.alive) return gpu;
			gpu = createGpu(canvas);
			if (gpu) {
				aPos = gpu.gl.getAttribLocation(gpu.program, "a_pos");
				lastW = 0;
				lastH = 0;
			}
			return gpu;
		};

		const bindPipeline = (current: Gpu) => {
			const { gl } = current;
			gl.useProgram(current.program);
			gl.bindBuffer(gl.ARRAY_BUFFER, current.buf);
			gl.enableVertexAttribArray(aPos);
			gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
			gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.clearColor(0, 0, 0, 0);
		};

		const resize = (current: Gpu) => {
			const { gl } = current;
			const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
			const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
			const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
			if (w === lastW && h === lastH) return false;
			lastW = w;
			lastH = h;
			// Setting canvas size resets GL state — rebind after.
			canvas.width = w;
			canvas.height = h;
			gl.viewport(0, 0, w, h);
			bindPipeline(current);
			return true;
		};

		const drawFrame = (now: number) => {
			raf = 0;
			if (disposed || !visible) return;

			const current = ensureGpu();
			if (!current?.alive) return;
			const { gl } = current;
			if (gl.isContextLost()) {
				disposeGpu(current);
				gpu = null;
				return;
			}

			try {
				if (!resize(current)) {
					// Stay bound even when size is unchanged (other contexts can steal state).
					bindPipeline(current);
				}
				gl.clear(gl.COLOR_BUFFER_BIT);

				const t = reduceMotion ? 0 : (now - startedAt) * 0.001;
				for (const layer of layersRef.current) {
					gl.uniform1f(current.uTime, t);
					gl.uniform2f(current.uRes, canvas.width, canvas.height);
					gl.uniform1f(current.uBand, layer.band);
					gl.uniform1f(current.uSpread, layer.spread);
					gl.uniform1f(current.uDensity, layer.density);
					gl.uniform1f(current.uSpeed, reduceMotion ? 0 : layer.speed);
					gl.uniform1f(current.uSeed, layer.seed);
					gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				}

				if (!reduceMotion && visible && !disposed) {
					raf = requestAnimationFrame(drawFrame);
				}
			} catch {
				if (gpu) {
					disposeGpu(gpu);
					gpu = null;
				}
			}
		};

		const play = () => {
			visible = true;
			if (!raf) raf = requestAnimationFrame(drawFrame);
		};

		const pause = () => {
			visible = false;
			if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
			// Keep the context — tearing it down and recreating is what breaks after a while.
		};

		const onLost = (event: Event) => {
			event.preventDefault();
			if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
			if (gpu) {
				disposeGpu(gpu);
				gpu = null;
			}
		};

		const onRestored = () => {
			if (visible && !disposed) play();
		};

		canvas.addEventListener("webglcontextlost", onLost, false);
		canvas.addEventListener("webglcontextrestored", onRestored, false);

		const io = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) play();
				else pause();
			},
			{ rootMargin: "80px", threshold: 0 },
		);
		io.observe(canvas);

		const rect = canvas.getBoundingClientRect();
		if (rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight) play();

		return () => {
			disposed = true;
			pause();
			io.disconnect();
			canvas.removeEventListener("webglcontextlost", onLost, false);
			canvas.removeEventListener("webglcontextrestored", onRestored, false);
			if (gpu) {
				disposeGpu(gpu);
				gpu = null;
			}
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden="true"
			className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
		/>
	);
}
