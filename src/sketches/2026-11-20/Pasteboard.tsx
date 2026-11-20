import {
	Circle,
	Frame,
	Hand,
	MousePointer2,
	Redo2,
	Square,
	Type,
	Undo2,
	type LucideIcon,
} from "lucide-react";
import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";
import {
	HOME,
	boxFromPoints,
	createShape,
	dropParent,
	duplicateNodes,
	frameUnder,
	hitTest,
	initialDoc,
	kindLabel,
	marqueeHits,
	outermost,
	paint,
	patchNode,
	placeLayer,
	removeNodes,
	reparent,
	restack,
	roundBox,
	sameDoc,
	setBox,
	snapMove,
	toLocal,
	translate,
	unionBox,
	worldBox,
	type Box,
	type Doc,
	type Guide,
	type Kind,
	type Node,
	type Point,
	type Stack,
} from "./doc";

type Tool = "select" | "hand" | "frame" | "rect" | "ellipse" | "text";
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Camera = { x: number; y: number; z: number };

type History = { past: Doc[]; present: Doc; future: Doc[] };

type Draft = { kind: Kind; parentId: string | null; box: Box };

type Gesture =
	| { type: "pan"; pointerId: number; sx: number; sy: number; cx: number; cy: number }
	| { type: "move"; pointerId: number; wx: number; wy: number; ids: string[]; start: Doc }
	| {
			type: "resize";
			pointerId: number;
			handle: Handle;
			wx: number;
			wy: number;
			id: string;
			box: Box;
			start: Doc;
	  }
	| { type: "marquee"; pointerId: number; x: number; y: number; additive: boolean; base: string[] }
	| {
			type: "draw";
			pointerId: number;
			kind: Kind;
			parentId: string | null;
			ax: number;
			ay: number;
			box: Box;
	  };

const TOOLS: { id: Tool; label: string; shortcut: string; icon: LucideIcon }[] = [
	{ id: "select", label: "Select", shortcut: "V", icon: MousePointer2 },
	{ id: "hand", label: "Hand", shortcut: "H", icon: Hand },
	{ id: "frame", label: "Frame", shortcut: "F", icon: Frame },
	{ id: "rect", label: "Rectangle", shortcut: "R", icon: Square },
	{ id: "ellipse", label: "Ellipse", shortcut: "O", icon: Circle },
	{ id: "text", label: "Text", shortcut: "T", icon: Type },
];

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const SWATCHES = [
	"#f4efe8",
	"#1c1917",
	"#e4e0d6",
	"#e24a3b",
	"#f0a202",
	"#3d7a6a",
	"#2f5d8c",
	"#ffffff",
];
const DRAW: Record<string, Kind> = {
	frame: "frame",
	rect: "rect",
	ellipse: "ellipse",
	text: "text",
};
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;
const MIN_SIZE = 8;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function mod(value: number, step: number): number {
	return ((value % step) + step) % step;
}

function typingTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

function fitCamera(width: number, height: number): Camera {
	const pad = 56;
	const z = clamp(Math.min((width - pad * 2) / HOME.w, (height - pad * 2) / HOME.h), MIN_ZOOM, 1);
	return {
		x: (width - HOME.w * z) / 2 - HOME.x * z,
		y: (height - HOME.h * z) / 2 - HOME.y * z,
		z,
	};
}

function handlePoint(box: Box, handle: Handle): Point {
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	const right = box.x + box.w;
	const bottom = box.y + box.h;
	if (handle === "nw") return { x: box.x, y: box.y };
	if (handle === "n") return { x: cx, y: box.y };
	if (handle === "ne") return { x: right, y: box.y };
	if (handle === "e") return { x: right, y: cy };
	if (handle === "se") return { x: right, y: bottom };
	if (handle === "s") return { x: cx, y: bottom };
	if (handle === "sw") return { x: box.x, y: bottom };
	return { x: box.x, y: cy };
}

function handleAt(box: Box, point: Point, zoom: number): Handle | null {
	const reach = 8 / zoom;
	let best: Handle | null = null;
	let bestDistance = reach;
	for (const handle of HANDLES) {
		const place = handlePoint(box, handle);
		const distance = Math.hypot(place.x - point.x, place.y - point.y);
		if (distance <= bestDistance) {
			best = handle;
			bestDistance = distance;
		}
	}
	return best;
}

function resizeBox(start: Box, handle: Handle, dx: number, dy: number): Box {
	let x1 = start.x;
	let y1 = start.y;
	let x2 = start.x + start.w;
	let y2 = start.y + start.h;
	const west = handle === "nw" || handle === "w" || handle === "sw";
	const east = handle === "ne" || handle === "e" || handle === "se";
	const north = handle === "nw" || handle === "n" || handle === "ne";
	const south = handle === "sw" || handle === "s" || handle === "se";
	if (west) x1 = Math.min(start.x + dx, x2 - MIN_SIZE);
	if (east) x2 = Math.max(start.x + start.w + dx, x1 + MIN_SIZE);
	if (north) y1 = Math.min(start.y + dy, y2 - MIN_SIZE);
	if (south) y2 = Math.max(start.y + start.h + dy, y1 + MIN_SIZE);
	return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function resizeCursor(handle: Handle): string {
	if (handle === "n" || handle === "s") return "ns-resize";
	if (handle === "e" || handle === "w") return "ew-resize";
	if (handle === "ne" || handle === "sw") return "nesw-resize";
	return "nwse-resize";
}

function toggle(ids: string[], id: string): string[] {
	return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function unionIds(base: string[], extra: string[]): string[] {
	const seen = new Set(base);
	const next = base.slice();
	for (const id of extra) {
		if (seen.has(id)) continue;
		seen.add(id);
		next.push(id);
	}
	return next;
}

export default function Pasteboard() {
	const stageRef = useRef<HTMLDivElement>(null);
	const gestureRef = useRef<Gesture | null>(null);
	const docRef = useRef<Doc>(initialDoc());
	const cameraRef = useRef<Camera>({ x: 40, y: 40, z: 0.8 });
	const selectionRef = useRef<string[]>([]);
	const toolRef = useRef<Tool>("select");
	const spaceRef = useRef(false);
	const editBase = useRef<Doc | null>(null);
	const nudgeAt = useRef(0);
	const stopTracking = useRef<(() => void) | null>(null);

	const [history, setHistory] = useState<History>({
		past: [],
		present: docRef.current,
		future: [],
	});
	const [selection, setSelection] = useState<string[]>([]);
	const [tool, setTool] = useState<Tool>("select");
	const [camera, setCamera] = useState<Camera>(cameraRef.current);
	const [editing, setEditing] = useState<string | null>(null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [marquee, setMarquee] = useState<Box | null>(null);
	const [guides, setGuides] = useState<Guide[]>([]);
	const [hint, setHint] = useState<string | null>(null);
	const [spaceDown, setSpaceDown] = useState(false);

	const doc = history.present;
	docRef.current = doc;
	cameraRef.current = camera;
	selectionRef.current = selection;
	toolRef.current = tool;

	useEffect(() => {
		setSelection((ids) => {
			const next = ids.filter((id) => doc.nodes[id]);
			if (next.length === ids.length) return ids;
			selectionRef.current = next;
			return next;
		});
		if (editing && !doc.nodes[editing]) setEditing(null);
	}, [doc, editing]);

	useLayoutEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		let fitted = false;
		const fit = () => {
			if (fitted || stage.clientWidth < 40 || stage.clientHeight < 40) return;
			fitted = true;
			const next = fitCamera(stage.clientWidth, stage.clientHeight);
			cameraRef.current = next;
			setCamera(next);
		};
		fit();
		if (fitted) return;
		const observer = new ResizeObserver(fit);
		observer.observe(stage);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const rect = stage.getBoundingClientRect();
			const sx = event.clientX - rect.left;
			const sy = event.clientY - rect.top;
			const zooming = event.ctrlKey || event.metaKey;
			setCamera((current) => {
				if (!zooming)
					return { ...current, x: current.x - event.deltaX, y: current.y - event.deltaY };
				const z = clamp(current.z * Math.exp(-event.deltaY * 0.0018), MIN_ZOOM, MAX_ZOOM);
				const wx = (sx - current.x) / current.z;
				const wy = (sy - current.y) / current.z;
				const next = { x: sx - wx * z, y: sy - wy * z, z };
				cameraRef.current = next;
				return next;
			});
		};
		stage.addEventListener("wheel", onWheel, { passive: false });
		return () => stage.removeEventListener("wheel", onWheel);
	}, []);

	useEffect(() => () => stopTracking.current?.(), []);

	function replacePresent(next: Doc) {
		docRef.current = next;
		setHistory((current) => (current.present === next ? current : { ...current, present: next }));
	}

	function commit(next: Doc) {
		if (sameDoc(docRef.current, next)) return;
		docRef.current = next;
		setHistory((current) => {
			if (sameDoc(current.present, next)) return current;
			return { past: [...current.past, current.present].slice(-80), present: next, future: [] };
		});
	}

	function commitGesture(start: Doc) {
		if (sameDoc(start, docRef.current)) {
			docRef.current = start;
			setHistory((current) =>
				current.present === start ? current : { ...current, present: start },
			);
			return;
		}
		setHistory((current) => ({
			past: [...current.past, start].slice(-80),
			present: current.present,
			future: [],
		}));
	}

	function undo() {
		setEditing(null);
		editBase.current = null;
		setHistory((current) => {
			const previous = current.past.at(-1);
			if (!previous) return current;
			docRef.current = previous;
			return {
				past: current.past.slice(0, -1),
				present: previous,
				future: [current.present, ...current.future],
			};
		});
	}

	function redo() {
		setEditing(null);
		editBase.current = null;
		setHistory((current) => {
			const next = current.future[0];
			if (!next) return current;
			docRef.current = next;
			return {
				past: [...current.past, current.present],
				present: next,
				future: current.future.slice(1),
			};
		});
	}

	function scrub(ids: string[], source = docRef.current): string[] {
		return ids.filter((id) => source.nodes[id]);
	}

	function worldFrom(clientX: number, clientY: number): Point {
		const rect = stageRef.current?.getBoundingClientRect();
		const current = cameraRef.current;
		const left = rect?.left ?? 0;
		const top = rect?.top ?? 0;
		return {
			x: (clientX - left - current.x) / current.z,
			y: (clientY - top - current.y) / current.z,
		};
	}

	function setCursor(next: string) {
		const stage = stageRef.current;
		if (stage) stage.style.cursor = next;
	}

	function finishEdit() {
		const before = editBase.current;
		editBase.current = null;
		setEditing(null);
		if (!before) return;
		setHistory((current) => {
			if (sameDoc(before, current.present)) return current;
			return { past: [...current.past, before].slice(-80), present: current.present, future: [] };
		});
	}

	function startEditing(id: string) {
		if (!docRef.current.nodes[id]) return;
		editBase.current = docRef.current;
		setEditing(id);
		setTool("select");
		toolRef.current = "select";
	}

	function zoomAt(sx: number, sy: number, nextZoom: number) {
		setCamera((current) => {
			const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
			const wx = (sx - current.x) / current.z;
			const wy = (sy - current.y) / current.z;
			const next = { x: sx - wx * z, y: sy - wy * z, z };
			cameraRef.current = next;
			return next;
		});
	}

	function fit() {
		const stage = stageRef.current;
		if (!stage) return;
		const next = fitCamera(stage.clientWidth, stage.clientHeight);
		cameraRef.current = next;
		setCamera(next);
	}

	function removeSelected() {
		const ids = selectionRef.current;
		if (ids.length === 0) return;
		const next = removeNodes(docRef.current, ids);
		commit(next);
		setSelection([]);
		selectionRef.current = [];
		setEditing(null);
	}

	function duplicateSelected() {
		const ids = selectionRef.current;
		if (ids.length === 0) return;
		const result = duplicateNodes(docRef.current, ids);
		commit(result.doc);
		setSelection(result.ids);
		selectionRef.current = result.ids;
	}

	function nudge(dx: number, dy: number) {
		const ids = selectionRef.current;
		if (ids.length === 0) return;
		const now = Date.now();
		const merge = now - nudgeAt.current < 450;
		nudgeAt.current = now;
		setHistory((current) => {
			const present = translate(current.present, ids, dx, dy);
			if (present === current.present) return current;
			docRef.current = present;
			if (merge && current.past.length > 0) return { ...current, present };
			return { past: [...current.past, current.present].slice(-80), present, future: [] };
		});
	}

	function restackSelected(stack: Stack) {
		const id = selectionRef.current.at(-1);
		if (!id) return;
		commit(restack(docRef.current, id, stack));
	}

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (typingTarget(event.target)) return;
			const meta = event.metaKey || event.ctrlKey;
			const key = event.key.toLowerCase();
			if (event.code === "Space") {
				event.preventDefault();
				if (!spaceRef.current) {
					spaceRef.current = true;
					setSpaceDown(true);
				}
				return;
			}
			if (key === "z" && meta) {
				event.preventDefault();
				if (event.shiftKey) redo();
				else undo();
				return;
			}
			if (key === "d" && meta) {
				event.preventDefault();
				duplicateSelected();
				return;
			}
			if (key === "a" && meta) {
				event.preventDefault();
				const current = docRef.current;
				const selected = selectionRef.current;
				const only = selected.length === 1 ? current.nodes[selected[0]] : null;
				const next = only && only.childIds.length > 0 ? only.childIds : current.rootIds;
				selectionRef.current = next;
				setSelection(next);
				return;
			}
			if (key === "0" && meta) {
				event.preventDefault();
				fit();
				return;
			}
			if ((key === "=" || key === "+") && !meta) {
				const stage = stageRef.current;
				if (!stage) return;
				event.preventDefault();
				zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, cameraRef.current.z * 1.15);
				return;
			}
			if ((key === "-" || key === "_") && !meta) {
				const stage = stageRef.current;
				if (!stage) return;
				event.preventDefault();
				zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, cameraRef.current.z / 1.15);
				return;
			}
			if (key === "backspace" || key === "delete") {
				event.preventDefault();
				removeSelected();
				return;
			}
			if (key === "enter") {
				const id = selectionRef.current.length === 1 ? selectionRef.current[0] : null;
				if (id && docRef.current.nodes[id]?.kind === "text") {
					event.preventDefault();
					startEditing(id);
				}
				return;
			}
			if (key === "[") {
				event.preventDefault();
				restackSelected(meta ? "back" : "backward");
				return;
			}
			if (key === "]") {
				event.preventDefault();
				restackSelected(meta ? "front" : "forward");
				return;
			}
			if (key === "arrowleft") {
				event.preventDefault();
				nudge(event.shiftKey ? -10 : -1, 0);
				return;
			}
			if (key === "arrowright") {
				event.preventDefault();
				nudge(event.shiftKey ? 10 : 1, 0);
				return;
			}
			if (key === "arrowup") {
				event.preventDefault();
				nudge(0, event.shiftKey ? -10 : -1);
				return;
			}
			if (key === "arrowdown") {
				event.preventDefault();
				nudge(0, event.shiftKey ? 10 : 1);
				return;
			}
			if (meta) return;
			if (key === "escape") {
				if (editing) finishEdit();
				else if (toolRef.current !== "select") {
					toolRef.current = "select";
					setTool("select");
				} else {
					selectionRef.current = [];
					setSelection([]);
				}
				return;
			}
			const nextTool = TOOLS.find((item) => item.shortcut.toLowerCase() === key);
			if (nextTool) {
				event.preventDefault();
				toolRef.current = nextTool.id;
				setTool(nextTool.id);
				setEditing(null);
			}
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.code !== "Space") return;
			spaceRef.current = false;
			setSpaceDown(false);
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	});

	function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
		if (event.button !== 0 && event.button !== 1) return;
		if (editing) finishEdit();
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// Capture needs a live pointer. Window tracking below still follows the drag.
		}
		watchPointer(event.pointerId);
		const world = worldFrom(event.clientX, event.clientY);
		const currentTool = toolRef.current;
		const zoom = cameraRef.current.z;
		if (event.button === 1) event.preventDefault();
		if (event.button === 1 || spaceRef.current || currentTool === "hand") {
			gestureRef.current = {
				type: "pan",
				pointerId: event.pointerId,
				sx: event.clientX,
				sy: event.clientY,
				cx: cameraRef.current.x,
				cy: cameraRef.current.y,
			};
			setCursor("grabbing");
			return;
		}
		const current = docRef.current;
		if (currentTool !== "select") {
			const kind = DRAW[currentTool];
			const parentId = frameUnder(current, world.x, world.y, new Set());
			const local = toLocal(current, parentId, world);
			const box = { x: local.x, y: local.y, w: 0, h: 0 };
			gestureRef.current = {
				type: "draw",
				pointerId: event.pointerId,
				kind,
				parentId,
				ax: local.x,
				ay: local.y,
				box,
			};
			setDraft({ kind, parentId, box });
			return;
		}
		const only = selectionRef.current.length === 1 ? selectionRef.current[0] : null;
		if (only && current.nodes[only]) {
			const handle = handleAt(worldBox(current, only), world, zoom);
			if (handle) {
				const node = current.nodes[only];
				gestureRef.current = {
					type: "resize",
					pointerId: event.pointerId,
					handle,
					wx: world.x,
					wy: world.y,
					id: only,
					box: { x: node.x, y: node.y, w: node.w, h: node.h },
					start: current,
				};
				setCursor(resizeCursor(handle));
				return;
			}
		}
		const hit = hitTest(current, world.x, world.y);
		if (hit) {
			let next = selectionRef.current;
			if (event.shiftKey) next = toggle(next, hit);
			else if (!next.includes(hit)) next = [hit];
			selectionRef.current = next;
			setSelection(next);
			if (next.length > 0) {
				gestureRef.current = {
					type: "move",
					pointerId: event.pointerId,
					wx: world.x,
					wy: world.y,
					ids: next,
					start: current,
				};
			}
			return;
		}
		const base = event.shiftKey ? selectionRef.current : [];
		if (!event.shiftKey) {
			selectionRef.current = [];
			setSelection([]);
		}
		gestureRef.current = {
			type: "marquee",
			pointerId: event.pointerId,
			x: world.x,
			y: world.y,
			additive: event.shiftKey,
			base,
		};
		setMarquee({ x: world.x, y: world.y, w: 0, h: 0 });
	}

	function watchPointer(pointerId: number) {
		stopTracking.current?.();
		const move = (native: PointerEvent) => {
			if (native.pointerId !== pointerId || !gestureRef.current) return;
			onPointerMove(native as unknown as ReactPointerEvent<SVGSVGElement>);
		};
		const up = (native: PointerEvent) => {
			if (native.pointerId !== pointerId) return;
			stop();
			onPointerUp(native as unknown as ReactPointerEvent<SVGSVGElement>);
		};
		const stop = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			if (stopTracking.current === stop) stopTracking.current = null;
		};
		stopTracking.current = stop;
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
	}

	function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
		const gesture = gestureRef.current;
		const world = worldFrom(event.clientX, event.clientY);
		const zoom = cameraRef.current.z;
		if (!gesture) {
			const current = docRef.current;
			const only = selectionRef.current.length === 1 ? selectionRef.current[0] : null;
			if (spaceRef.current || toolRef.current === "hand") setCursor("grab");
			else if (toolRef.current !== "select") setCursor("crosshair");
			else if (only && current.nodes[only] && handleAt(worldBox(current, only), world, zoom)) {
				const handle = handleAt(worldBox(current, only), world, zoom);
				if (handle) setCursor(resizeCursor(handle));
			} else if (hitTest(current, world.x, world.y)) setCursor("grab");
			else setCursor("default");
			return;
		}
		if (gesture.type === "pan") {
			const next = {
				...cameraRef.current,
				x: gesture.cx + (event.clientX - gesture.sx),
				y: gesture.cy + (event.clientY - gesture.sy),
			};
			cameraRef.current = next;
			setCamera(next);
			return;
		}
		if (gesture.type === "move") {
			const rawX = world.x - gesture.wx;
			const rawY = world.y - gesture.wy;
			const snapped = snapMove(gesture.start, gesture.ids, rawX, rawY, 6 / zoom);
			const moved = translate(gesture.start, gesture.ids, snapped.dx, snapped.dy);
			replacePresent(moved);
			setGuides(snapped.guides);
			const primary = outermost(moved, gesture.ids).at(-1);
			if (primary && (Math.abs(snapped.dx) > 0.5 || Math.abs(snapped.dy) > 0.5)) {
				const parent = dropParent(moved, primary);
				setHint(typeof parent === "string" ? parent : null);
			} else setHint(null);
			return;
		}
		if (gesture.type === "resize") {
			const box = resizeBox(
				gesture.box,
				gesture.handle,
				world.x - gesture.wx,
				world.y - gesture.wy,
			);
			replacePresent(setBox(gesture.start, gesture.id, box));
			return;
		}
		if (gesture.type === "marquee") {
			const box = boxFromPoints(gesture.x, gesture.y, world.x, world.y, false);
			setMarquee(box);
			const hits = marqueeHits(docRef.current, box);
			const next = gesture.additive ? unionIds(gesture.base, hits) : hits;
			selectionRef.current = next;
			setSelection(next);
			return;
		}
		if (gesture.type === "draw") {
			const local = toLocal(docRef.current, gesture.parentId, world);
			const box = boxFromPoints(gesture.ax, gesture.ay, local.x, local.y, event.shiftKey);
			gesture.box = box;
			setDraft({ kind: gesture.kind, parentId: gesture.parentId, box });
		}
	}

	function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
		const gesture = gestureRef.current;
		gestureRef.current = null;
		setGuides([]);
		setHint(null);
		setCursor("default");
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		if (gesture.type === "move") {
			let next = docRef.current;
			if (!sameDoc(gesture.start, next)) {
				for (const id of outermost(next, gesture.ids)) {
					const parent = dropParent(next, id);
					if (parent !== undefined) next = reparent(next, id, parent);
				}
				replacePresent(next);
				commitGesture(gesture.start);
			}
			return;
		}
		if (gesture.type === "resize") {
			commitGesture(gesture.start);
			return;
		}
		if (gesture.type === "marquee") {
			setMarquee(null);
			return;
		}
		if (gesture.type === "draw") {
			const box = gesture.box;
			setDraft(null);
			const tiny = box.w < 4 && box.h < 4;
			if (tiny && gesture.kind !== "text") return;
			const shaped = tiny ? { x: gesture.ax, y: gesture.ay - 20, w: 200, h: 72 } : roundBox(box);
			const created = createShape(docRef.current, gesture.kind, gesture.parentId, shaped);
			commit(created.doc);
			selectionRef.current = [created.id];
			setSelection([created.id]);
			if (gesture.kind === "text") startEditing(created.id);
		}
	}

	const selected = scrub(selection);
	const primary = selected.length === 1 ? doc.nodes[selected[0]] : null;
	const editingNode = editing ? doc.nodes[editing] : null;
	const editingScreen = editingNode ? screenOf(worldBox(doc, editingNode.id), camera) : null;
	const measure = measureLabel(doc, draft, gestureRef.current, camera);

	return (
		<div className="flex h-[calc(100svh-9rem)] min-h-[70vh] w-full bg-[#141210] text-[#f4efe8] select-none">
			<aside className="flex shrink-0 border-r border-white/10 bg-[#1c1917]">
				<div className="flex w-12 flex-col items-center gap-1 border-r border-white/10 py-2">
					{TOOLS.map((item) => (
						<button
							key={item.id}
							type="button"
							title={`${item.label} (${item.shortcut})`}
							aria-label={item.label}
							aria-pressed={tool === item.id}
							onClick={() => {
								toolRef.current = item.id;
								setTool(item.id);
							}}
							className={`flex size-9 items-center justify-center rounded-md ${
								tool === item.id
									? "bg-[#e4e0d6] text-[#191b1a]"
									: "text-[#f4efe8]/80 hover:bg-white/10"
							}`}
						>
							<item.icon className="size-4" strokeWidth={1.75} />
						</button>
					))}
					<div className="mt-auto flex flex-col gap-1">
						<RailIcon
							icon={Undo2}
							label="Undo"
							disabled={history.past.length === 0}
							onClick={undo}
						/>
						<RailIcon
							icon={Redo2}
							label="Redo"
							disabled={history.future.length === 0}
							onClick={redo}
						/>
					</div>
				</div>
				<Layers
					doc={doc}
					selection={selected}
					onSelect={(id, shift) => {
						const next = shift ? toggle(selected, id) : [id];
						selectionRef.current = next;
						setSelection(next);
						toolRef.current = "select";
						setTool("select");
					}}
					onPlace={(id, parentId, index) => {
						commit(placeLayer(docRef.current, id, parentId, index));
					}}
				/>
			</aside>
			<div ref={stageRef} className="relative min-w-0 flex-1 overflow-hidden bg-[#221f1c]">
				<svg
					className="absolute inset-0 h-full w-full touch-none"
					aria-label="Pasteboard"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
					onDoubleClick={(event) => {
						const world = worldFrom(event.clientX, event.clientY);
						const hit = hitTest(docRef.current, world.x, world.y);
						if (hit && docRef.current.nodes[hit]?.kind === "text") startEditing(hit);
					}}
					onContextMenu={(event) => event.preventDefault()}
				>
					<Grid camera={camera} />
					<g transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
						{doc.rootIds.map((id) => (
							<ShapeView key={id} doc={doc} id={id} editing={editing} zoom={camera.z} />
						))}
						{draft && <DraftView doc={doc} draft={draft} />}
						{hint && doc.nodes[hint] && (
							<Outline box={worldBox(doc, hint)} color="#e4e0d6" width={1.5} />
						)}
						{selected.map((id) =>
							doc.nodes[id] ? (
								<Outline key={id} box={worldBox(doc, id)} color="#e4e0d6" width={1.25} />
							) : null,
						)}
						{primary &&
							HANDLES.map((handle) => {
								const place = handlePoint(worldBox(doc, primary.id), handle);
								const size = 7 / camera.z;
								return (
									<rect
										key={handle}
										x={place.x - size / 2}
										y={place.y - size / 2}
										width={size}
										height={size}
										fill="#e4e0d6"
										stroke="#141210"
										strokeWidth={1}
										vectorEffect="non-scaling-stroke"
									/>
								);
							})}
						{marquee && (
							<rect
								x={marquee.x}
								y={marquee.y}
								width={marquee.w}
								height={marquee.h}
								fill="#e4e0d6"
								fillOpacity={0.12}
								stroke="#e4e0d6"
								strokeWidth={1}
								vectorEffect="non-scaling-stroke"
							/>
						)}
						{measure && (
							<text
								x={measure.x}
								y={measure.y}
								fill="#e4e0d6"
								fontSize={11 / camera.z}
								fontFamily="Inter, sans-serif"
							>
								{measure.label}
							</text>
						)}
					</g>
					{guides.map((guide) =>
						guide.axis === "x" ? (
							<line
								key={`x${guide.at}`}
								x1={guide.at * camera.z + camera.x}
								x2={guide.at * camera.z + camera.x}
								y1={0}
								y2="100%"
								stroke="#6e6a64"
								strokeWidth={1}
							/>
						) : (
							<line
								key={`y${guide.at}`}
								y1={guide.at * camera.z + camera.y}
								y2={guide.at * camera.z + camera.y}
								x1={0}
								x2="100%"
								stroke="#6e6a64"
								strokeWidth={1}
							/>
						),
					)}
				</svg>
				<p className="pointer-events-none absolute top-4 left-4 rounded-full bg-black/45 px-3 py-1 text-xs tracking-wide backdrop-blur-sm">
					{statusLabel(doc, selected, tool)}
				</p>
				<div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/45 p-1 text-xs backdrop-blur-sm">
					<button
						type="button"
						className="rounded-full px-2.5 py-1 hover:bg-white/10"
						onClick={fit}
					>
						Fit
					</button>
					<button
						type="button"
						className="rounded-full px-2.5 py-1 hover:bg-white/10"
						onClick={() => {
							const stage = stageRef.current;
							if (!stage) return;
							zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1);
						}}
					>
						{Math.round(camera.z * 100)}%
					</button>
				</div>
				{editingNode && editingScreen && (
					<textarea
						autoFocus
						value={editingNode.text}
						aria-label={`Edit ${editingNode.name}`}
						onChange={(event) => {
							replacePresent(
								patchNode(docRef.current, editingNode.id, { text: event.target.value }),
							);
						}}
						onBlur={finishEdit}
						onPointerDown={(event) => event.stopPropagation()}
						onKeyDown={(event) => {
							if (event.key === "Escape") event.currentTarget.blur();
							event.stopPropagation();
						}}
						style={{
							position: "absolute",
							left: editingScreen.x,
							top: editingScreen.y,
							width: Math.max(editingScreen.w, 48),
							height: Math.max(editingScreen.h, 28),
							fontSize: editingNode.fontSize * camera.z,
							fontWeight: editingNode.weight,
							color: editingNode.ink,
							lineHeight: editingNode.fontSize > 32 ? 0.95 : 1.35,
							fontFamily: "Inter, sans-serif",
							background: "transparent",
							border: "1px solid #e4e0d6",
							padding: 0,
							margin: 0,
							resize: "none",
							outline: "none",
							overflow: "hidden",
							whiteSpace: "pre-wrap",
						}}
					/>
				)}
			</div>
			<Inspector
				doc={doc}
				selection={selected}
				onPatch={(id, patch) => replacePresent(patchNode(docRef.current, id, patch))}
				onPaint={(color) => replacePresent(paint(docRef.current, selected, color))}
				onBegin={() => {
					editBase.current = docRef.current;
				}}
				onEnd={finishEdit}
				onDuplicate={duplicateSelected}
				onDelete={removeSelected}
				onStack={restackSelected}
			/>
		</div>
	);
}

function screenOf(box: Box, camera: Camera): Box {
	return {
		x: box.x * camera.z + camera.x,
		y: box.y * camera.z + camera.y,
		w: box.w * camera.z,
		h: box.h * camera.z,
	};
}

function statusLabel(doc: Doc, selection: string[], tool: Tool): string {
	if (tool !== "select" && tool !== "hand") {
		const item = TOOLS.find((entry) => entry.id === tool);
		return `${item?.label ?? "Draw"} · drag`;
	}
	if (selection.length === 0) return tool === "hand" ? "Hand" : "Select";
	if (selection.length > 1) return `${selection.length} selected`;
	const node = doc.nodes[selection[0]];
	return node ? node.name : "Select";
}

function measureLabel(
	doc: Doc,
	draft: Draft | null,
	gesture: Gesture | null,
	camera: Camera,
): { x: number; y: number; label: string } | null {
	if (draft && (draft.box.w > 2 || draft.box.h > 2)) {
		const origin = draft.parentId ? worldBox(doc, draft.parentId) : { x: 0, y: 0, w: 0, h: 0 };
		return {
			x: origin.x + draft.box.x,
			y: origin.y + draft.box.y - 8 / camera.z,
			label: `${Math.round(draft.box.w)} × ${Math.round(draft.box.h)}`,
		};
	}
	if (gesture?.type === "resize") {
		const node = doc.nodes[gesture.id];
		if (!node) return null;
		const world = worldBox(doc, node.id);
		return {
			x: world.x,
			y: world.y - 8 / camera.z,
			label: `${Math.round(node.w)} × ${Math.round(node.h)}`,
		};
	}
	return null;
}

function Grid({ camera }: { camera: Camera }) {
	const step = 24 * camera.z;
	return (
		<>
			<rect width="100%" height="100%" fill="#221f1c" />
			<defs>
				<pattern
					id="pasteboard-dots"
					width={step}
					height={step}
					patternUnits="userSpaceOnUse"
					x={mod(camera.x, step)}
					y={mod(camera.y, step)}
				>
					<circle cx="1" cy="1" r="1" fill="#3c362f" />
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill="url(#pasteboard-dots)" />
		</>
	);
}

function ShapeView({
	doc,
	id,
	editing,
	zoom,
}: {
	doc: Doc;
	id: string;
	editing: string | null;
	zoom: number;
}) {
	const node = doc.nodes[id];
	if (!node) return null;
	const clipId = `clip-${node.id}`;
	const clipped = node.kind === "frame" && node.childIds.length > 0;
	return (
		<g transform={`translate(${node.x} ${node.y})`} data-node={node.id}>
			{node.kind === "ellipse" ? (
				<ellipse cx={node.w / 2} cy={node.h / 2} rx={node.w / 2} ry={node.h / 2} fill={node.fill} />
			) : node.kind === "text" ? (
				editing === node.id ? null : (
					<foreignObject
						x={0}
						y={0}
						width={Math.max(node.w, 1)}
						height={Math.max(node.h, 1)}
						pointerEvents="none"
					>
						<div
							style={{
								width: "100%",
								height: "100%",
								color: node.ink,
								fontSize: node.fontSize,
								fontWeight: node.weight,
								lineHeight: node.fontSize > 32 ? 0.95 : 1.35,
								fontFamily: "Inter, sans-serif",
								whiteSpace: "pre-wrap",
								overflow: "hidden",
								pointerEvents: "none",
							}}
						>
							{node.text || "Text"}
						</div>
					</foreignObject>
				)
			) : (
				<rect width={node.w} height={node.h} rx={node.radius} fill={node.fill} />
			)}
			{node.kind === "frame" && (
				<text
					x={0}
					y={-8 / zoom}
					fill="#b7b0a6"
					fontSize={11 / zoom}
					fontFamily="Inter, sans-serif"
				>
					{node.name}
				</text>
			)}
			{clipped && (
				<clipPath id={clipId}>
					<rect width={node.w} height={node.h} rx={node.radius} />
				</clipPath>
			)}
			<g clipPath={clipped ? `url(#${clipId})` : undefined}>
				{node.childIds.map((child) => (
					<ShapeView key={child} doc={doc} id={child} editing={editing} zoom={zoom} />
				))}
			</g>
		</g>
	);
}

function DraftView({ doc, draft }: { doc: Doc; draft: Draft }) {
	const origin = draft.parentId ? worldBox(doc, draft.parentId) : { x: 0, y: 0, w: 0, h: 0 };
	const fill =
		draft.kind === "ellipse" ? "#3d7a6a" : draft.kind === "text" ? "transparent" : "#e4e0d6";
	return (
		<g transform={`translate(${origin.x} ${origin.y})`}>
			{draft.kind === "ellipse" ? (
				<ellipse
					cx={draft.box.x + draft.box.w / 2}
					cy={draft.box.y + draft.box.h / 2}
					rx={Math.max(draft.box.w / 2, 0)}
					ry={Math.max(draft.box.h / 2, 0)}
					fill={fill}
					fillOpacity={0.85}
					stroke="#e4e0d6"
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			) : (
				<rect
					x={draft.box.x}
					y={draft.box.y}
					width={Math.max(draft.box.w, 0)}
					height={Math.max(draft.box.h, 0)}
					fill={draft.kind === "frame" ? "#f4efe8" : fill}
					fillOpacity={0.9}
					stroke="#e4e0d6"
					strokeWidth={1}
					strokeDasharray="4 3"
					vectorEffect="non-scaling-stroke"
				/>
			)}
		</g>
	);
}

function Outline({ box, color, width }: { box: Box; color: string; width: number }) {
	return (
		<>
			<rect
				x={box.x}
				y={box.y}
				width={box.w}
				height={box.h}
				fill="none"
				stroke="#141210"
				strokeWidth={width + 1.5}
				vectorEffect="non-scaling-stroke"
			/>
			<rect
				x={box.x}
				y={box.y}
				width={box.w}
				height={box.h}
				fill="none"
				stroke={color}
				strokeWidth={width}
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

type LayerDrop = {
	parentId: string | null;
	index: number;
	overId: string;
	edge: "before" | "after" | "into";
};

function insideNode(doc: Doc, ancestor: string, id: string): boolean {
	let cursor: string | null = id;
	while (cursor) {
		if (cursor === ancestor) return true;
		cursor = doc.nodes[cursor]?.parentId ?? null;
	}
	return false;
}

function readDrop(list: HTMLElement, clientY: number, dragId: string, doc: Doc): LayerDrop | null {
	const rows = [...list.querySelectorAll<HTMLElement>("[data-layer]")].filter((row) => {
		const id = row.dataset.layer;
		return !!id && id !== dragId && !insideNode(doc, dragId, id);
	});
	if (rows.length === 0) return { parentId: null, index: 0, overId: "", edge: "after" };

	let nearest = rows[0];
	for (const row of rows) {
		const rect = row.getBoundingClientRect();
		if (clientY >= rect.top && clientY <= rect.bottom) {
			nearest = row;
			break;
		}
		const nearestRect = nearest.getBoundingClientRect();
		const nextDistance = Math.abs(clientY - (rect.top + rect.height / 2));
		const nearestDistance = Math.abs(clientY - (nearestRect.top + nearestRect.height / 2));
		if (nextDistance < nearestDistance) nearest = row;
	}

	const id = nearest.dataset.layer ?? "";
	const node = doc.nodes[id];
	if (!node) return null;
	const rect = nearest.getBoundingClientRect();
	const ratio = rect.height === 0 ? 0.5 : (clientY - rect.top) / rect.height;
	if (node.kind === "frame" && ratio > 0.28 && ratio < 0.72) {
		return { parentId: id, index: node.childIds.length, overId: id, edge: "into" };
	}
	const siblings = node.parentId ? doc.nodes[node.parentId].childIds : doc.rootIds;
	const childIndex = siblings.indexOf(id);
	const before = ratio < 0.5;
	return {
		parentId: node.parentId,
		index: before ? childIndex + 1 : childIndex,
		overId: id,
		edge: before ? "before" : "after",
	};
}

function Layers({
	doc,
	selection,
	onSelect,
	onPlace,
}: {
	doc: Doc;
	selection: string[];
	onSelect: (id: string, shift: boolean) => void;
	onPlace: (id: string, parentId: string | null, index: number) => void;
}) {
	const listRef = useRef<HTMLUListElement>(null);
	const dragRef = useRef<{ id: string; pointerId: number; y: number; moved: boolean } | null>(null);
	const dropRef = useRef<LayerDrop | null>(null);
	const skipClick = useRef(false);
	const docLive = useRef(doc);
	docLive.current = doc;
	const [drop, setDrop] = useState<LayerDrop | null>(null);
	const [draggingId, setDraggingId] = useState<string | null>(null);

	function pointerDown(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
		if (event.button !== 0) return;
		const pointerId = event.pointerId;
		const startY = event.clientY;
		const drag = { id, pointerId, y: startY, moved: false };
		dragRef.current = drag;
		try {
			event.currentTarget.setPointerCapture(pointerId);
		} catch {
			// A drag still follows the pointer through the window listeners.
		}
		const move = (native: PointerEvent) => {
			if (native.pointerId !== pointerId) return;
			if (!drag.moved && Math.abs(native.clientY - startY) < 4) return;
			if (!drag.moved) setDraggingId(id);
			drag.moved = true;
			const list = listRef.current;
			if (!list) return;
			const next = readDrop(list, native.clientY, id, docLive.current);
			dropRef.current = next;
			setDrop(next);
		};
		const up = (native: PointerEvent) => {
			if (native.pointerId !== pointerId) return;
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			const next = dropRef.current;
			dragRef.current = null;
			dropRef.current = null;
			setDrop(null);
			setDraggingId(null);
			if (!drag.moved || !next) return;
			skipClick.current = true;
			onPlace(id, next.parentId, next.index);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
	}

	return (
		<div className="flex w-48 min-w-0 flex-col py-3">
			<p className="px-3 text-[11px] tracking-[0.16em] text-[#f4efe8]/45 uppercase">Layers</p>
			<ul ref={listRef} className="mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
				<LayerRows
					doc={doc}
					ids={doc.rootIds}
					depth={0}
					selection={selection}
					drop={drop}
					draggingId={draggingId}
					onSelect={(id, shift) => {
						if (skipClick.current) {
							skipClick.current = false;
							return;
						}
						onSelect(id, shift);
					}}
					onPointerDown={pointerDown}
				/>
			</ul>
			<p className="px-3 pt-3 text-[11px] leading-relaxed text-[#f4efe8]/40">
				Drag a layer to reorder it, or drop it on a frame. On the board, drag a shape to move it.
			</p>
		</div>
	);
}

function LayerRows({
	doc,
	ids,
	depth,
	selection,
	drop,
	draggingId,
	onSelect,
	onPointerDown,
}: {
	doc: Doc;
	ids: string[];
	depth: number;
	selection: string[];
	drop: LayerDrop | null;
	draggingId: string | null;
	onSelect: (id: string, shift: boolean) => void;
	onPointerDown: (id: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
	const ordered = [...ids].reverse();
	return ordered.map((id) => {
		const node = doc.nodes[id];
		if (!node) return null;
		const Icon =
			node.kind === "frame"
				? Frame
				: node.kind === "ellipse"
					? Circle
					: node.kind === "text"
						? Type
						: Square;
		const selected = selection.includes(id);
		const edge = drop?.overId === id ? drop.edge : null;
		return (
			<li key={id}>
				<button
					type="button"
					data-layer={id}
					aria-pressed={selected}
					onClick={(event) => onSelect(id, event.shiftKey)}
					onPointerDown={(event) => onPointerDown(id, event)}
					className={`flex w-full cursor-grab touch-none items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm active:cursor-grabbing ${
						selected ? "bg-[#e4e0d6] text-[#191b1a]" : "text-[#f4efe8]/80 hover:bg-white/10"
					} ${edge === "into" ? "ring-1 ring-[#e4e0d6]" : ""} ${draggingId === id ? "opacity-40" : ""}`}
					style={{
						paddingLeft: 8 + depth * 12,
						boxShadow:
							edge === "before"
								? "inset 0 2px 0 #e4e0d6"
								: edge === "after"
									? "inset 0 -2px 0 #e4e0d6"
									: undefined,
					}}
				>
					<Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
					<span className="truncate">{node.name}</span>
				</button>
				{node.childIds.length > 0 && (
					<ul>
						<LayerRows
							doc={doc}
							ids={node.childIds}
							depth={depth + 1}
							selection={selection}
							drop={drop}
							draggingId={draggingId}
							onSelect={onSelect}
							onPointerDown={onPointerDown}
						/>
					</ul>
				)}
			</li>
		);
	});
}

function Inspector({
	doc,
	selection,
	onPatch,
	onPaint,
	onBegin,
	onEnd,
	onDuplicate,
	onDelete,
	onStack,
}: {
	doc: Doc;
	selection: string[];
	onPatch: (id: string, patch: Partial<Node>) => void;
	onPaint: (color: string) => void;
	onBegin: () => void;
	onEnd: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onStack: (stack: Stack) => void;
}) {
	const node = selection.length === 1 ? doc.nodes[selection[0]] : null;
	const fill = sharedPaint(doc, selection);
	return (
		<aside className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/10 bg-[#1c1917] px-3 py-3">
			<div>
				<p className="text-[11px] tracking-[0.16em] text-[#f4efe8]/45 uppercase">
					{node
						? kindLabel(node.kind)
						: selection.length > 1
							? `${selection.length} layers`
							: "Inspect"}
				</p>
				{node && (
					<input
						aria-label="Name"
						value={node.name}
						onFocus={onBegin}
						onBlur={onEnd}
						onChange={(event) => onPatch(node.id, { name: event.target.value })}
						className="mt-2 w-full rounded-md bg-white/5 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#e4e0d6]"
					/>
				)}
				{selection.length === 0 && (
					<p className="mt-2 text-sm leading-relaxed text-[#f4efe8]/55">
						Select something on the board, or drag with a tool to draw.
					</p>
				)}
			</div>
			{node && (
				<div>
					<p className="text-[11px] tracking-[0.16em] text-[#f4efe8]/45 uppercase">Position</p>
					<div className="mt-2 grid grid-cols-2 gap-1">
						<NumberField
							label="X"
							value={node.x}
							onBegin={onBegin}
							onEnd={onEnd}
							onChange={(value) => onPatch(node.id, { x: value })}
						/>
						<NumberField
							label="Y"
							value={node.y}
							onBegin={onBegin}
							onEnd={onEnd}
							onChange={(value) => onPatch(node.id, { y: value })}
						/>
						<NumberField
							label="W"
							value={node.w}
							onBegin={onBegin}
							onEnd={onEnd}
							onChange={(value) => onPatch(node.id, { w: Math.max(MIN_SIZE, value) })}
						/>
						<NumberField
							label="H"
							value={node.h}
							onBegin={onBegin}
							onEnd={onEnd}
							onChange={(value) => onPatch(node.id, { h: Math.max(MIN_SIZE, value) })}
						/>
					</div>
				</div>
			)}
			{selection.length > 0 && (
				<div>
					<p className="text-[11px] tracking-[0.16em] text-[#f4efe8]/45 uppercase">
						{node?.kind === "text" ? "Color" : "Fill"}
					</p>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{SWATCHES.map((swatch) => (
							<button
								key={swatch}
								type="button"
								aria-label={swatch}
								onClick={() => {
									onBegin();
									onPaint(swatch);
									onEnd();
								}}
								className={`size-6 rounded-full ring-1 ring-white/20 ${fill === swatch ? "ring-2 ring-[#e4e0d6]" : ""}`}
								style={{ background: swatch }}
							/>
						))}
						<label
							className="relative size-6 overflow-hidden rounded-full ring-1 ring-white/20"
							title="Custom color"
						>
							<span className="sr-only">Custom color</span>
							<input
								type="color"
								aria-label="Custom color"
								value={toHex(fill ?? "#e4e0d6")}
								onFocus={onBegin}
								onBlur={onEnd}
								onChange={(event) => onPaint(event.target.value)}
								className="absolute inset-0 size-8 cursor-pointer border-0 bg-transparent p-0"
							/>
						</label>
					</div>
				</div>
			)}
			{node && (node.kind === "rect" || node.kind === "frame") && (
				<NumberField
					label="R"
					value={node.radius}
					onBegin={onBegin}
					onEnd={onEnd}
					onChange={(value) =>
						onPatch(node.id, { radius: clamp(value, 0, Math.min(node.w, node.h) / 2) })
					}
				/>
			)}
			{node?.kind === "text" && (
				<div>
					<p className="text-[11px] tracking-[0.16em] text-[#f4efe8]/45 uppercase">Type</p>
					<div className="mt-2 flex gap-1">
						<NumberField
							label="S"
							value={node.fontSize}
							onBegin={onBegin}
							onEnd={onEnd}
							onChange={(value) => onPatch(node.id, { fontSize: clamp(value, 8, 240) })}
						/>
						<button
							type="button"
							aria-pressed={node.weight >= 650}
							onClick={() => {
								onBegin();
								onPatch(node.id, { weight: node.weight >= 650 ? 400 : 700 });
								onEnd();
							}}
							className={`rounded-md px-2 text-sm ${
								node.weight >= 650 ? "bg-[#e4e0d6] text-[#191b1a]" : "bg-white/5 text-[#f4efe8]/80"
							}`}
						>
							Bold
						</button>
					</div>
				</div>
			)}
			{selection.length > 0 && (
				<div className="mt-auto flex flex-col gap-1">
					{node && (
						<div className="grid grid-cols-2 gap-1">
							<TextButton label="Forward" onClick={() => onStack("forward")} />
							<TextButton label="Backward" onClick={() => onStack("backward")} />
						</div>
					)}
					<div className="grid grid-cols-2 gap-1">
						<TextButton label="Duplicate" onClick={onDuplicate} />
						<TextButton label="Delete" onClick={onDelete} />
					</div>
				</div>
			)}
		</aside>
	);
}

function sharedPaint(doc: Doc, ids: string[]): string | null {
	let paintColor: string | null = null;
	for (const id of ids) {
		const node = doc.nodes[id];
		if (!node) continue;
		const color = node.kind === "text" ? node.ink : node.fill;
		if (paintColor == null) paintColor = color;
		else if (paintColor.toLowerCase() !== color.toLowerCase()) return null;
	}
	return paintColor;
}

function toHex(color: string): string {
	return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#e4e0d6";
}

function NumberField({
	label,
	value,
	onChange,
	onBegin,
	onEnd,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	onBegin: () => void;
	onEnd: () => void;
}) {
	const [text, setText] = useState(String(Math.round(value)));
	const focused = useRef(false);
	useEffect(() => {
		if (!focused.current) setText(String(Math.round(value)));
	}, [value]);
	return (
		<label className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs">
			<span className="w-3 text-[#f4efe8]/40">{label}</span>
			<input
				value={text}
				inputMode="decimal"
				aria-label={label}
				onFocus={() => {
					focused.current = true;
					onBegin();
				}}
				onBlur={() => {
					focused.current = false;
					const next = Number(text);
					if (Number.isFinite(next)) onChange(Math.round(next));
					else setText(String(Math.round(value)));
					onEnd();
				}}
				onChange={(event) => {
					setText(event.target.value);
					const next = Number(event.target.value);
					if (Number.isFinite(next)) onChange(Math.round(next));
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
					event.stopPropagation();
				}}
				className="w-full bg-transparent outline-none"
			/>
		</label>
	);
}

function RailIcon({
	icon: Icon,
	label,
	disabled,
	onClick,
}: {
	icon: LucideIcon;
	label: string;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className="flex size-9 items-center justify-center rounded-md text-[#f4efe8]/80 hover:bg-white/10 disabled:opacity-30"
		>
			<Icon className="size-4" strokeWidth={1.75} />
		</button>
	);
}

function TextButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="rounded-md bg-white/5 px-2 py-1.5 text-left text-xs text-[#f4efe8]/80 hover:bg-white/10"
		>
			{label}
		</button>
	);
}
