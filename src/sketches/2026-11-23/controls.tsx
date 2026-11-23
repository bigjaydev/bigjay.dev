import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { type HeightField, terrainHeight } from "./sim";

export type ViewMode = "fly" | "fps";

const EYE = 1.7;
const WORLD_PAD = 0.92;

type ControlsProps = {
	mode: ViewMode;
	heightField: HeightField;
	modeRef: MutableRefObject<ViewMode>;
};

export function CameraRig({ mode, heightField, modeRef }: ControlsProps) {
	const { camera, gl } = useThree();
	const keys = useRef(new Set<string>());
	const look = useRef({ yaw: -0.7, pitch: -0.35 });
	const vel = useRef(new THREE.Vector3());
	const locked = useRef(false);
	const dragging = useRef(false);
	const last = useRef({ x: 0, y: 0 });
	const seeded = useRef(false);
	const prevMode = useRef(mode);

	modeRef.current = mode;

	useEffect(() => {
		if (!seeded.current) {
			camera.position.set(32, 24, 40);
			// Face the world origin so the landscape fills the view.
			const dx = -camera.position.x;
			const dy = 2 - camera.position.y;
			const dz = -camera.position.z;
			const len = Math.hypot(dx, dy, dz) || 1;
			look.current = {
				yaw: Math.atan2(dx, dz),
				pitch: Math.asin(Math.min(1, Math.max(-1, dy / len))),
			};
			seeded.current = true;
		}
	}, [camera]);

	useEffect(() => {
		if (prevMode.current === mode) return;
		prevMode.current = mode;
		if (mode === "fps") {
			const hf = heightField;
			const x = THREE.MathUtils.clamp(camera.position.x, -hf.size * WORLD_PAD, hf.size * WORLD_PAD);
			const z = THREE.MathUtils.clamp(camera.position.z, -hf.size * WORLD_PAD, hf.size * WORLD_PAD);
			const y = terrainHeight(hf, x, z) + EYE;
			camera.position.set(x, Math.max(y, hf.waterLevel + EYE + 0.2), z);
			look.current.pitch = 0;
			vel.current.set(0, 0, 0);
		} else {
			camera.position.y = Math.max(camera.position.y, terrainHeight(heightField, camera.position.x, camera.position.z) + 4);
			vel.current.set(0, 0, 0);
		}
	}, [mode, camera, heightField]);

	useEffect(() => {
		const el = gl.domElement;
		const down = (e: PointerEvent) => {
			if (e.button !== 0) return;
			dragging.current = true;
			last.current = { x: e.clientX, y: e.clientY };
			el.setPointerCapture(e.pointerId);
			if (document.pointerLockElement !== el) {
				el.requestPointerLock?.().catch(() => {});
			}
		};
		const up = (e: PointerEvent) => {
			dragging.current = false;
			el.releasePointerCapture(e.pointerId);
		};
		const move = (e: PointerEvent) => {
			const sens = 0.0022;
			if (document.pointerLockElement === el) {
				look.current.yaw -= e.movementX * sens;
				look.current.pitch -= e.movementY * sens;
			} else if (dragging.current) {
				look.current.yaw -= (e.clientX - last.current.x) * sens;
				look.current.pitch -= (e.clientY - last.current.y) * sens;
				last.current = { x: e.clientX, y: e.clientY };
			} else {
				return;
			}
			look.current.pitch = THREE.MathUtils.clamp(look.current.pitch, -1.45, 1.45);
		};
		const lockChange = () => {
			locked.current = document.pointerLockElement === el;
		};
		const keyDown = (e: KeyboardEvent) => {
			keys.current.add(e.code);
			if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
				e.preventDefault();
			}
		};
		const keyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
		const blur = () => keys.current.clear();

		el.addEventListener("pointerdown", down);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointermove", move);
		document.addEventListener("pointerlockchange", lockChange);
		window.addEventListener("keydown", keyDown);
		window.addEventListener("keyup", keyUp);
		window.addEventListener("blur", blur);
		return () => {
			el.removeEventListener("pointerdown", down);
			el.removeEventListener("pointerup", up);
			el.removeEventListener("pointermove", move);
			document.removeEventListener("pointerlockchange", lockChange);
			window.removeEventListener("keydown", keyDown);
			window.removeEventListener("keyup", keyUp);
			window.removeEventListener("blur", blur);
			if (document.pointerLockElement === el) document.exitPointerLock();
		};
	}, [gl]);

	useFrame((_, dt) => {
		const yaw = look.current.yaw;
		const pitch = look.current.pitch;
		const forward = new THREE.Vector3(
			Math.sin(yaw) * Math.cos(pitch),
			Math.sin(pitch),
			Math.cos(yaw) * Math.cos(pitch),
		);
		const flatForward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
		const right = new THREE.Vector3().crossVectors(flatForward, new THREE.Vector3(0, 1, 0)).normalize();

		const k = keys.current;
		const sprint = k.has("ShiftLeft") || k.has("ShiftRight");
		const wish = new THREE.Vector3();

		if (modeRef.current === "fly") {
			const speed = (sprint ? 28 : 14) * dt;
			if (k.has("KeyW") || k.has("ArrowUp")) wish.add(forward);
			if (k.has("KeyS") || k.has("ArrowDown")) wish.sub(forward);
			if (k.has("KeyD") || k.has("ArrowRight")) wish.add(right);
			if (k.has("KeyA") || k.has("ArrowLeft")) wish.sub(right);
			if (k.has("KeyE") || k.has("Space")) wish.y += 1;
			if (k.has("KeyQ") || k.has("ControlLeft")) wish.y -= 1;
			if (wish.lengthSq() > 0) {
				wish.normalize().multiplyScalar(speed);
				camera.position.add(wish);
			}
			const minY = terrainHeight(heightField, camera.position.x, camera.position.z) + 1.2;
			if (camera.position.y < minY) camera.position.y = minY;
		} else {
			const speed = (sprint ? 9 : 5) * dt;
			if (k.has("KeyW") || k.has("ArrowUp")) wish.add(flatForward);
			if (k.has("KeyS") || k.has("ArrowDown")) wish.sub(flatForward);
			if (k.has("KeyD") || k.has("ArrowRight")) wish.add(right);
			if (k.has("KeyA") || k.has("ArrowLeft")) wish.sub(right);
			if (wish.lengthSq() > 0) {
				wish.normalize().multiplyScalar(speed);
				camera.position.x += wish.x;
				camera.position.z += wish.z;
			}

			// Jump
			if ((k.has("Space") || k.has("KeyE")) && Math.abs(vel.current.y) < 0.01) {
				vel.current.y = 6.5;
			}
			vel.current.y -= 18 * dt;
			camera.position.y += vel.current.y * dt;

			const bound = heightField.size * WORLD_PAD;
			camera.position.x = THREE.MathUtils.clamp(camera.position.x, -bound, bound);
			camera.position.z = THREE.MathUtils.clamp(camera.position.z, -bound, bound);

			const ground = terrainHeight(heightField, camera.position.x, camera.position.z);
			const floor = Math.max(ground, heightField.waterLevel - 0.35) + EYE;
			if (camera.position.y <= floor) {
				camera.position.y = floor;
				vel.current.y = 0;
			}
		}

		const target = camera.position.clone().add(forward);
		camera.lookAt(target);
	});

	return null;
}
