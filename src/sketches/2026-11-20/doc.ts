export type Kind = "frame" | "rect" | "ellipse" | "text";

export type Node = {
	id: string;
	kind: Kind;
	name: string;
	parentId: string | null;
	x: number;
	y: number;
	w: number;
	h: number;
	fill: string;
	radius: number;
	text: string;
	fontSize: number;
	weight: number;
	ink: string;
	childIds: string[];
};

export type Doc = {
	nodes: Record<string, Node>;
	rootIds: string[];
};

export type Box = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Guide = { axis: "x" | "y"; at: number };

const KIND_LABEL: Record<Kind, string> = {
	frame: "Frame",
	rect: "Rectangle",
	ellipse: "Ellipse",
	text: "Text",
};

let counter = 0;

function uid(): string {
	counter += 1;
	return `n${counter.toString(36)}`;
}

export function kindLabel(kind: Kind): string {
	return KIND_LABEL[kind];
}

function blank(partial: Partial<Node> & Pick<Node, "id" | "kind" | "name">): Node {
	return {
		parentId: null,
		x: 0,
		y: 0,
		w: 100,
		h: 100,
		fill: "#f4efe8",
		radius: 0,
		text: "",
		fontSize: 16,
		weight: 400,
		ink: "#1c1917",
		childIds: [],
		...partial,
	};
}

function nest(nodes: Record<string, Node>, parentId: string | null, child: Node) {
	nodes[child.id] = { ...child, parentId, childIds: [] };
	if (parentId) nodes[parentId].childIds.push(child.id);
}

export function initialDoc(): Doc {
	const nodes: Record<string, Node> = {};

	nest(
		nodes,
		null,
		blank({
			id: "poster",
			kind: "frame",
			name: "Poster",
			x: 96,
			y: 72,
			w: 440,
			h: 600,
			fill: "#f4efe8",
		}),
	);
	nest(
		nodes,
		"poster",
		blank({
			id: "blob",
			kind: "ellipse",
			name: "Blob",
			x: 248,
			y: 40,
			w: 148,
			h: 148,
			fill: "#8a8680",
		}),
	);
	nest(
		nodes,
		"poster",
		blank({
			id: "sticker",
			kind: "ellipse",
			name: "Sticker",
			x: 308,
			y: 108,
			w: 52,
			h: 52,
			fill: "#1c1c1c",
		}),
	);
	nest(
		nodes,
		"poster",
		blank({
			id: "headline",
			kind: "text",
			name: "Headline",
			x: 36,
			y: 214,
			w: 280,
			h: 180,
			fill: "transparent",
			text: "Cut it\nout.",
			fontSize: 84,
			weight: 700,
			ink: "#1c1917",
		}),
	);
	nest(
		nodes,
		"poster",
		blank({
			id: "rule",
			kind: "rect",
			name: "Rule",
			x: 40,
			y: 430,
			w: 72,
			h: 8,
			fill: "#1c1917",
			radius: 4,
		}),
	);
	nest(
		nodes,
		"poster",
		blank({
			id: "deck",
			kind: "text",
			name: "Deck",
			x: 36,
			y: 458,
			w: 300,
			h: 88,
			fill: "transparent",
			text: "Frames, shapes, and type. Drag them around.",
			fontSize: 22,
			weight: 400,
			ink: "#1c1917",
		}),
	);

	nest(
		nodes,
		null,
		blank({
			id: "phone",
			kind: "frame",
			name: "Phone",
			x: 620,
			y: 56,
			w: 300,
			h: 640,
			fill: "#161311",
			radius: 36,
		}),
	);
	nest(
		nodes,
		"phone",
		blank({
			id: "header",
			kind: "rect",
			name: "Header",
			x: 0,
			y: 0,
			w: 300,
			h: 196,
			fill: "#e4e0d6",
		}),
	);
	nest(
		nodes,
		"phone",
		blank({
			id: "kicker",
			kind: "text",
			name: "Kicker",
			x: 24,
			y: 36,
			w: 220,
			h: 22,
			fill: "transparent",
			text: "Thursday",
			fontSize: 14,
			weight: 500,
			ink: "#1c1917",
		}),
	);
	nest(
		nodes,
		"phone",
		blank({
			id: "phone-title",
			kind: "text",
			name: "Title",
			x: 24,
			y: 64,
			w: 240,
			h: 100,
			fill: "transparent",
			text: "On the\ntable",
			fontSize: 42,
			weight: 700,
			ink: "#1c1917",
		}),
	);

	const cards: { id: string; name: string; y: number; title: string; body: string }[] = [
		{
			id: "card-payphone",
			name: "Payphone",
			y: 220,
			title: "Neon payphone",
			body: "Answer it, then walk the job.",
		},
		{
			id: "card-modeller",
			name: "Modeller",
			y: 348,
			title: "Modeller",
			body: "Push a face until it becomes a room.",
		},
		{
			id: "card-sequencer",
			name: "Sequencer",
			y: 476,
			title: "Sequencer",
			body: "Sixteen steps and a bass line.",
		},
	];

	for (const card of cards) {
		nest(
			nodes,
			"phone",
			blank({
				id: card.id,
				kind: "rect",
				name: card.name,
				x: 16,
				y: card.y,
				w: 268,
				h: 112,
				fill: "#241f1c",
				radius: 18,
			}),
		);
		nest(
			nodes,
			"phone",
			blank({
				id: `${card.id}-title`,
				kind: "text",
				name: `${card.name} title`,
				x: 32,
				y: card.y + 18,
				w: 230,
				h: 28,
				fill: "transparent",
				text: card.title,
				fontSize: 16,
				weight: 650,
				ink: "#f4efe8",
			}),
		);
		nest(
			nodes,
			"phone",
			blank({
				id: `${card.id}-body`,
				kind: "text",
				name: `${card.name} body`,
				x: 32,
				y: card.y + 50,
				w: 230,
				h: 44,
				fill: "transparent",
				text: card.body,
				fontSize: 14,
				weight: 400,
				ink: "#c8c0b6",
			}),
		);
	}

	return { nodes, rootIds: ["poster", "phone"] };
}

export const HOME: Box = { x: 48, y: 16, w: 920, h: 720 };

export function outermost(doc: Doc, ids: string[]): string[] {
	const set = new Set(ids);
	return ids.filter((id) => {
		let parent = doc.nodes[id]?.parentId ?? null;
		while (parent) {
			if (set.has(parent)) return false;
			parent = doc.nodes[parent]?.parentId ?? null;
		}
		return doc.nodes[id] != null;
	});
}

export function worldBox(doc: Doc, id: string): Box {
	let x = 0;
	let y = 0;
	const chain: Node[] = [];
	let cursor: string | null = id;
	while (cursor) {
		const current: Node | undefined = doc.nodes[cursor];
		if (!current) break;
		chain.push(current);
		cursor = current.parentId;
	}
	for (let index = chain.length - 1; index >= 0; index -= 1) {
		x += chain[index].x;
		y += chain[index].y;
	}
	const node = doc.nodes[id];
	return { x, y, w: node?.w ?? 0, h: node?.h ?? 0 };
}

export function toLocal(doc: Doc, parentId: string | null, point: Point): Point {
	if (!parentId) return point;
	const origin = worldBox(doc, parentId);
	return { x: point.x - origin.x, y: point.y - origin.y };
}

export function unionBox(doc: Doc, ids: string[]): Box | null {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const id of ids) {
		if (!doc.nodes[id]) continue;
		const box = worldBox(doc, id);
		minX = Math.min(minX, box.x);
		minY = Math.min(minY, box.y);
		maxX = Math.max(maxX, box.x + box.w);
		maxY = Math.max(maxY, box.y + box.h);
	}
	if (!Number.isFinite(minX)) return null;
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function containsPoint(box: Box, x: number, y: number): boolean {
	return x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h;
}

function intersects(a: Box, b: Box): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function containsBox(outer: Box, inner: Box): boolean {
	return (
		outer.x <= inner.x &&
		outer.y <= inner.y &&
		outer.x + outer.w >= inner.x + inner.w &&
		outer.y + outer.h >= inner.y + inner.h
	);
}

export function hitTest(doc: Doc, x: number, y: number): string | null {
	function walk(ids: string[], ox: number, oy: number): string | null {
		for (let index = ids.length - 1; index >= 0; index -= 1) {
			const node = doc.nodes[ids[index]];
			if (!node) continue;
			const nx = ox + node.x;
			const ny = oy + node.y;
			const child = walk(node.childIds, nx, ny);
			if (child) return child;
			if (containsPoint({ x: nx, y: ny, w: node.w, h: node.h }, x, y)) return node.id;
		}
		return null;
	}
	return walk(doc.rootIds, 0, 0);
}

export function frameUnder(doc: Doc, x: number, y: number, skip: Set<string>): string | null {
	let found: string | null = null;
	function walk(ids: string[], ox: number, oy: number) {
		for (const id of ids) {
			if (skip.has(id)) continue;
			const node = doc.nodes[id];
			if (!node) continue;
			const nx = ox + node.x;
			const ny = oy + node.y;
			const inside = containsPoint({ x: nx, y: ny, w: node.w, h: node.h }, x, y);
			if (node.kind === "frame" && inside) {
				found = id;
				walk(node.childIds, nx, ny);
			}
		}
	}
	walk(doc.rootIds, 0, 0);
	return found;
}

export function marqueeHits(doc: Doc, box: Box): string[] {
	if (box.w < 1 && box.h < 1) return [];
	const hits: string[] = [];
	function walk(ids: string[], ox: number, oy: number) {
		for (const id of ids) {
			const node = doc.nodes[id];
			if (!node) continue;
			const rect = { x: ox + node.x, y: oy + node.y, w: node.w, h: node.h };
			if (intersects(rect, box) && !containsBox(rect, box)) hits.push(id);
			walk(node.childIds, rect.x, rect.y);
		}
	}
	walk(doc.rootIds, 0, 0);
	return outermost(doc, hits);
}

function skipTree(doc: Doc, ids: string[]): Set<string> {
	const skip = new Set<string>();
	function mark(id: string) {
		if (skip.has(id)) return;
		skip.add(id);
		for (const child of doc.nodes[id]?.childIds ?? []) mark(child);
	}
	for (const id of ids) mark(id);
	return skip;
}

export function snapMove(
	doc: Doc,
	ids: string[],
	dx: number,
	dy: number,
	threshold: number,
): { dx: number; dy: number; guides: Guide[] } {
	const moving = outermost(doc, ids);
	const skip = skipTree(doc, moving);
	const xs: number[] = [];
	const ys: number[] = [];

	function collect(list: string[], ox: number, oy: number) {
		for (const id of list) {
			const node = doc.nodes[id];
			if (!node) continue;
			const nx = ox + node.x;
			const ny = oy + node.y;
			if (!skip.has(id)) {
				xs.push(nx, nx + node.w / 2, nx + node.w);
				ys.push(ny, ny + node.h / 2, ny + node.h);
			}
			collect(node.childIds, nx, ny);
		}
	}
	collect(doc.rootIds, 0, 0);

	let bestDx = 0;
	let bestX = threshold;
	let guideX: number | null = null;
	let bestDy = 0;
	let bestY = threshold;
	let guideY: number | null = null;

	for (const id of moving) {
		const box = worldBox(doc, id);
		const verticals = [box.x + dx, box.x + box.w / 2 + dx, box.x + box.w + dx];
		const horizontals = [box.y + dy, box.y + box.h / 2 + dy, box.y + box.h + dy];
		for (const edge of verticals) {
			for (const target of xs) {
				const distance = Math.abs(target - edge);
				if (distance < bestX) {
					bestX = distance;
					bestDx = target - edge;
					guideX = target;
				}
			}
		}
		for (const edge of horizontals) {
			for (const target of ys) {
				const distance = Math.abs(target - edge);
				if (distance < bestY) {
					bestY = distance;
					bestDy = target - edge;
					guideY = target;
				}
			}
		}
	}

	const guides: Guide[] = [];
	if (guideX != null) guides.push({ axis: "x", at: guideX });
	if (guideY != null) guides.push({ axis: "y", at: guideY });
	return { dx: dx + bestDx, dy: dy + bestDy, guides };
}

export function translate(doc: Doc, ids: string[], dx: number, dy: number): Doc {
	if (dx === 0 && dy === 0) return doc;
	const nodes = { ...doc.nodes };
	for (const id of outermost(doc, ids)) {
		const node = nodes[id];
		if (!node) continue;
		nodes[id] = { ...node, x: node.x + dx, y: node.y + dy };
	}
	return { ...doc, nodes };
}

export function setBox(doc: Doc, id: string, box: Box): Doc {
	const node = doc.nodes[id];
	if (!node) return doc;
	if (node.x === box.x && node.y === box.y && node.w === box.w && node.h === box.h) return doc;
	return {
		...doc,
		nodes: { ...doc.nodes, [id]: { ...node, x: box.x, y: box.y, w: box.w, h: box.h } },
	};
}

export function patchNode(doc: Doc, id: string, patch: Partial<Node>): Doc {
	const node = doc.nodes[id];
	if (!node) return doc;
	const keys = Object.keys(patch) as (keyof Node)[];
	if (keys.every((key) => patch[key] === node[key])) return doc;
	return {
		...doc,
		nodes: {
			...doc.nodes,
			[id]: { ...node, ...patch, id: node.id, parentId: node.parentId, childIds: node.childIds },
		},
	};
}

export function paint(doc: Doc, ids: string[], color: string): Doc {
	let next = doc;
	for (const id of ids) {
		const node = next.nodes[id];
		if (!node) continue;
		next = patchNode(next, id, node.kind === "text" ? { ink: color } : { fill: color });
	}
	return next;
}

function nextName(doc: Doc, kind: Kind): string {
	const label = KIND_LABEL[kind];
	let max = 0;
	for (const node of Object.values(doc.nodes)) {
		if (node.kind !== kind) continue;
		const match = new RegExp(`^${label} (\\d+)$`).exec(node.name);
		if (match) max = Math.max(max, Number(match[1]));
	}
	return `${label} ${max + 1}`;
}

export function inkFor(fill: string): string {
	const hex = fill.replace("#", "");
	if (hex.length < 6) return "#f4efe8";
	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);
	if ([r, g, b].some((channel) => Number.isNaN(channel))) return "#f4efe8";
	const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	return luminance > 0.62 ? "#1c1917" : "#f4efe8";
}

export function createShape(
	doc: Doc,
	kind: Kind,
	parentId: string | null,
	box: Box,
): { doc: Doc; id: string } {
	const id = uid();
	const parent = parentId ? doc.nodes[parentId] : null;
	const node: Node = {
		id,
		kind,
		name: nextName(doc, kind),
		parentId,
		x: box.x,
		y: box.y,
		w: Math.max(8, box.w),
		h: Math.max(8, box.h),
		fill:
			kind === "frame"
				? "#f4efe8"
				: kind === "ellipse"
					? "#3d7a6a"
					: kind === "text"
						? "transparent"
						: "#e4e0d6",
		radius: 0,
		text: kind === "text" ? "Text" : "",
		fontSize: kind === "text" ? 32 : 16,
		weight: kind === "text" ? 650 : 400,
		ink: inkFor(parent?.fill ?? "#221f1c"),
		childIds: [],
	};
	return { doc: insertNode(doc, node), id };
}

function insertNode(doc: Doc, node: Node): Doc {
	const nodes = { ...doc.nodes, [node.id]: node };
	if (!node.parentId || !nodes[node.parentId]) {
		return { nodes, rootIds: [...doc.rootIds, node.id] };
	}
	const parent = nodes[node.parentId];
	nodes[node.parentId] = { ...parent, childIds: [...parent.childIds, node.id] };
	return { nodes, rootIds: doc.rootIds };
}

export function removeNodes(doc: Doc, ids: string[]): Doc {
	const drop = skipTree(doc, outermost(doc, ids));
	const nodes: Record<string, Node> = {};
	for (const [id, node] of Object.entries(doc.nodes)) {
		if (drop.has(id)) continue;
		nodes[id] = { ...node, childIds: node.childIds.filter((child) => !drop.has(child)) };
	}
	return { nodes, rootIds: doc.rootIds.filter((id) => !drop.has(id)) };
}

function containsNode(doc: Doc, ancestor: string, id: string): boolean {
	let cursor: string | null = id;
	while (cursor) {
		if (cursor === ancestor) return true;
		cursor = doc.nodes[cursor]?.parentId ?? null;
	}
	return false;
}

export function placeLayer(doc: Doc, id: string, parentId: string | null, index: number): Doc {
	const node = doc.nodes[id];
	if (!node) return doc;
	if (parentId && (parentId === id || containsNode(doc, id, parentId) || !doc.nodes[parentId]))
		return doc;
	if (parentId && doc.nodes[parentId].kind !== "frame") return doc;

	const destination = (parentId ? doc.nodes[parentId].childIds : doc.rootIds).slice();
	let at = index;
	const from = destination.indexOf(id);
	if (from !== -1 && from < at) at -= 1;
	const siblings = destination.filter((item) => item !== id);
	at = Math.max(0, Math.min(at, siblings.length));
	if (node.parentId === parentId && at === from) return doc;

	const local =
		node.parentId === parentId
			? { x: node.x, y: node.y }
			: toLocal(doc, parentId, worldBox(doc, id));
	const nodes = { ...doc.nodes };
	let rootIds = doc.rootIds.slice();
	if (node.parentId && nodes[node.parentId]) {
		const previous = nodes[node.parentId];
		nodes[node.parentId] = {
			...previous,
			childIds: previous.childIds.filter((child) => child !== id),
		};
	} else {
		rootIds = rootIds.filter((root) => root !== id);
	}
	siblings.splice(at, 0, id);
	nodes[id] = { ...node, parentId, x: local.x, y: local.y };
	if (parentId) nodes[parentId] = { ...nodes[parentId], childIds: siblings };
	else rootIds = siblings;
	return { nodes, rootIds };
}

export function reparent(doc: Doc, id: string, parentId: string | null): Doc {
	const node = doc.nodes[id];
	if (!node || node.parentId === parentId) return doc;
	if (parentId && (parentId === id || containsNode(doc, id, parentId) || !doc.nodes[parentId]))
		return doc;
	const world = worldBox(doc, id);
	const local = toLocal(doc, parentId, world);
	const nodes = { ...doc.nodes };
	let rootIds = doc.rootIds;
	if (node.parentId && nodes[node.parentId]) {
		const previous = nodes[node.parentId];
		nodes[node.parentId] = {
			...previous,
			childIds: previous.childIds.filter((child) => child !== id),
		};
	} else {
		rootIds = rootIds.filter((root) => root !== id);
	}
	nodes[id] = { ...node, parentId, x: local.x, y: local.y };
	if (parentId) {
		const parent = nodes[parentId];
		nodes[parentId] = { ...parent, childIds: [...parent.childIds, id] };
	} else {
		rootIds = [...rootIds, id];
	}
	return { nodes, rootIds };
}

export function dropParent(doc: Doc, id: string): string | null | undefined {
	const node = doc.nodes[id];
	if (!node) return undefined;
	const box = worldBox(doc, id);
	const skip = skipTree(doc, [id]);
	const frame = frameUnder(doc, box.x + box.w / 2, box.y + box.h / 2, skip);
	if (frame === node.parentId) return undefined;
	return frame;
}

export function duplicateNodes(doc: Doc, ids: string[]): { doc: Doc; ids: string[] } {
	let next = doc;
	const copies: string[] = [];
	for (const id of outermost(doc, ids)) {
		const cloned = cloneTree(next, id, 24, 24);
		if (!cloned) continue;
		next = cloned.doc;
		copies.push(cloned.id);
	}
	return { doc: next, ids: copies };
}

function cloneTree(doc: Doc, id: string, dx: number, dy: number): { doc: Doc; id: string } | null {
	const source = doc.nodes[id];
	if (!source) return null;
	const idMap = new Map<string, string>();
	const queue = [id];
	while (queue.length) {
		const current = queue.shift();
		if (!current || idMap.has(current)) continue;
		idMap.set(current, uid());
		queue.push(...(doc.nodes[current]?.childIds ?? []));
	}
	const nodes = { ...doc.nodes };
	for (const [oldId, newId] of idMap) {
		const node = doc.nodes[oldId];
		if (!node) continue;
		const parentId =
			node.parentId && idMap.has(node.parentId)
				? (idMap.get(node.parentId) ?? null)
				: node.parentId;
		nodes[newId] = {
			...node,
			id: newId,
			parentId,
			childIds: node.childIds.map((child) => idMap.get(child) ?? child),
			x: node.x + (oldId === id ? dx : 0),
			y: node.y + (oldId === id ? dy : 0),
		};
	}
	const copyId = idMap.get(id);
	if (!copyId) return null;
	const parentId = source.parentId;
	if (!parentId || !nodes[parentId]) {
		const rootIds = doc.rootIds.slice();
		const index = rootIds.indexOf(id);
		rootIds.splice(index + 1, 0, copyId);
		return { doc: { nodes, rootIds }, id: copyId };
	}
	const parent = nodes[parentId];
	const childIds = parent.childIds.slice();
	const index = childIds.indexOf(id);
	childIds.splice(index + 1, 0, copyId);
	nodes[parentId] = { ...parent, childIds };
	return { doc: { nodes, rootIds: doc.rootIds }, id: copyId };
}

export type Stack = "forward" | "backward" | "front" | "back";

export function restack(doc: Doc, id: string, stack: Stack): Doc {
	const node = doc.nodes[id];
	if (!node) return doc;
	const siblings = node.parentId ? doc.nodes[node.parentId]?.childIds : doc.rootIds;
	if (!siblings) return doc;
	const index = siblings.indexOf(id);
	if (index < 0) return doc;
	let next = index;
	if (stack === "forward") next = Math.min(siblings.length - 1, index + 1);
	if (stack === "backward") next = Math.max(0, index - 1);
	if (stack === "front") next = siblings.length - 1;
	if (stack === "back") next = 0;
	if (next === index) return doc;
	const order = siblings.slice();
	order.splice(index, 1);
	order.splice(next, 0, id);
	if (!node.parentId) return { ...doc, rootIds: order };
	return {
		...doc,
		nodes: { ...doc.nodes, [node.parentId]: { ...doc.nodes[node.parentId], childIds: order } },
	};
}

export function boxFromPoints(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	square: boolean,
): Box {
	let x2 = bx;
	let y2 = by;
	if (square) {
		const size = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
		x2 = ax + Math.sign(bx - ax || 1) * size;
		y2 = ay + Math.sign(by - ay || 1) * size;
	}
	const x1 = Math.min(ax, x2);
	const y1 = Math.min(ay, y2);
	return { x: x1, y: y1, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function roundBox(box: Box): Box {
	const x = Math.round(box.x);
	const y = Math.round(box.y);
	const right = Math.round(box.x + box.w);
	const bottom = Math.round(box.y + box.h);
	return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

export function sameDoc(a: Doc, b: Doc): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b);
}
