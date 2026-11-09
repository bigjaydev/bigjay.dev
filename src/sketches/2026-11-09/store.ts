import { create } from "zustand";

// Each edit is a node. Undo moves to the parent and leaves that child in place.
// Editing again adds a sibling, so the version you stepped away from stays reachable.
// A new sibling with the same notes joins the existing one instead of sitting beside it.
// Keystrokes on the same note fold into the current leaf until you pause.

const COALESCE_MS = 650;

export type Card = {
	id: string;
	text: string;
};

export type Doc = {
	cards: Card[];
};

export type ActionKind = "start" | "write" | "add" | "remove" | "reorder";

export type HistNode = {
	id: string;
	parentId: string | null;
	childIds: string[];
	doc: Doc;
	kind: ActionKind;
	label: string;
	detail: string;
	/** Note this node is folding keystrokes into, when kind is write. */
	cardId: string | null;
	/** Further keystrokes fold into this leaf until this time. */
	coalesceUntil: number;
};

type Snapshot = {
	nodes: Record<string, HistNode>;
	currentId: string;
	/** Child last opened under each node. Redo follows this. */
	lastChild: Record<string, string>;
};

type Store = Snapshot & {
	setText: (cardId: string, text: string) => void;
	addCard: () => string;
	removeCard: (cardId: string) => void;
	moveCard: (from: number, to: number) => void;
	undo: () => void;
	redo: () => void;
	checkout: (id: string) => void;
};

export const ROOT_ID = "root";

function cloneDoc(doc: Doc): Doc {
	return { cards: doc.cards.map((card) => ({ ...card })) };
}

function docsEqual(a: Doc, b: Doc): boolean {
	if (a.cards.length !== b.cards.length) return false;
	return a.cards.every((card, index) => {
		const other = b.cards[index];
		return other != null && card.id === other.id && card.text === other.text;
	});
}

/** Sibling that already holds this document, so a new copy would be a duplicate. */
function matchingSibling(parent: HistNode, nodes: Record<string, HistNode>, doc: Doc, exceptId?: string): string | null {
	return parent.childIds.find((id) => id !== exceptId && nodes[id] != null && docsEqual(nodes[id].doc, doc)) ?? null;
}

function snippet(text: string, max = 42): string {
	const line = text.replace(/\s+/g, " ").trim();
	if (!line) return "Empty";
	if (line.length <= max) return line;
	return `${line.slice(0, max - 1)}…`;
}

function describeWrite(origin: string, next: string): { label: string; detail: string } {
	if (!origin.trim() && next.trim()) return { label: "Wrote", detail: snippet(next) };
	if (origin.trim() && !next.trim()) return { label: "Cleared", detail: snippet(origin) };
	return { label: "Edited", detail: snippet(next) };
}

function orderDetail(doc: Doc): string {
	if (doc.cards.length === 0) return "No notes";
	return doc.cards.map((card) => snippet(card.text, 16)).join(" · ");
}

function addedNewline(before: string, after: string): boolean {
	return after.split("\n").length > before.split("\n").length;
}

/** A single inserted, deleted, or replaced character — what one keystroke does. */
function isSmallEdit(before: string, after: string): boolean {
	if (Math.abs(before.length - after.length) > 1) return false;
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
	let end = 0;
	while (
		end < before.length - start &&
		end < after.length - start &&
		before[before.length - 1 - end] === after[after.length - 1 - end]
	) {
		end += 1;
	}
	return before.length - start - end <= 1 && after.length - start - end <= 1;
}

/** Drop a leaf that duplicated a sibling, and continue from the one that was already there. */
function adoptSibling(state: Snapshot, dropId: string, siblingId: string): Snapshot {
	const dropped = state.nodes[dropId];
	const parent = dropped?.parentId ? state.nodes[dropped.parentId] : undefined;
	if (!dropped || !parent || dropped.childIds.length > 0) return { ...state, ...visit(state, siblingId) };
	const nodes: Record<string, HistNode> = {
		...state.nodes,
		[parent.id]: { ...parent, childIds: parent.childIds.filter((id) => id !== dropId) },
	};
	delete nodes[dropId];
	const lastChild = { ...state.lastChild };
	for (const key of Object.keys(lastChild)) {
		if (lastChild[key] === dropId) delete lastChild[key];
	}
	delete lastChild[dropId];
	const next: Snapshot = { nodes, currentId: state.currentId, lastChild };
	return { ...next, ...visit(next, siblingId) };
}

function pushNode(
	state: Snapshot,
	draft: {
		doc: Doc;
		kind: ActionKind;
		label: string;
		detail: string;
		cardId: string | null;
		coalesceMs: number;
	},
): Snapshot {
	const parent = state.nodes[state.currentId];
	const existing = matchingSibling(parent, state.nodes, draft.doc);
	if (existing) return { ...state, ...visit(state, existing) };
	const id = crypto.randomUUID();
	const node: HistNode = {
		id,
		parentId: parent.id,
		childIds: [],
		doc: cloneDoc(draft.doc),
		kind: draft.kind,
		label: draft.label,
		detail: draft.detail,
		cardId: draft.cardId,
		coalesceUntil: draft.coalesceMs > 0 ? Date.now() + draft.coalesceMs : 0,
	};
	return {
		nodes: {
			...state.nodes,
			[parent.id]: { ...parent, childIds: [...parent.childIds, id] },
			[id]: node,
		},
		currentId: id,
		lastChild: { ...state.lastChild, [parent.id]: id },
	};
}

/** Remember the branch taken at every ancestor, so redo walks back down it. */
function visit(state: Snapshot, id: string): Pick<Snapshot, "currentId" | "lastChild"> {
	const lastChild = { ...state.lastChild };
	let cursor: string | null = id;
	while (cursor) {
		const node = state.nodes[cursor];
		if (!node?.parentId) break;
		lastChild[node.parentId] = cursor;
		cursor = node.parentId;
	}
	return { currentId: id, lastChild };
}

export function redoTarget(state: Snapshot): string | null {
	const current = state.nodes[state.currentId];
	if (!current || current.childIds.length === 0) return null;
	const preferred = state.lastChild[state.currentId];
	if (preferred && current.childIds.includes(preferred)) return preferred;
	return current.childIds[current.childIds.length - 1] ?? null;
}

function initialSnapshot(): Snapshot {
	const doc: Doc = {
		cards: [
			{ id: "note-1", text: "The first version of this thought." },
			{ id: "note-2", text: "Drag the handle to reorder." },
		],
	};
	const root: HistNode = {
		id: ROOT_ID,
		parentId: null,
		childIds: [],
		doc,
		kind: "start",
		label: "Start",
		detail: "Two notes",
		cardId: null,
		coalesceUntil: 0,
	};
	return { nodes: { [ROOT_ID]: root }, currentId: ROOT_ID, lastChild: {} };
}

export const useUndoStore = create<Store>((set, get) => ({
	...initialSnapshot(),

	setText: (cardId, text) => {
		const state = get();
		const current = state.nodes[state.currentId];
		const index = current.doc.cards.findIndex((card) => card.id === cardId);
		if (index < 0) return;
		const before = current.doc.cards[index].text;
		if (before === text) return;

		const now = Date.now();
		const small = isSmallEdit(before, text);
		const leaf = current.childIds.length === 0;
		const folding =
			small &&
			leaf &&
			current.kind === "write" &&
			current.cardId === cardId &&
			now < current.coalesceUntil &&
			!addedNewline(before, text);

		const doc: Doc = {
			cards: current.doc.cards.map((card, cardIndex) =>
				cardIndex === index ? { ...card, text } : { ...card },
			),
		};

		if (folding) {
			const parent = current.parentId ? state.nodes[current.parentId] : undefined;
			const match = parent ? matchingSibling(parent, state.nodes, doc, current.id) : null;
			if (match) {
				set(adoptSibling(state, current.id, match));
				return;
			}
			const origin = parent?.doc.cards.find((card) => card.id === cardId)?.text ?? before;
			const described = describeWrite(origin, text);
			set({
				nodes: {
					...state.nodes,
					[current.id]: {
						...current,
						doc,
						label: described.label,
						detail: described.detail,
						coalesceUntil: now + COALESCE_MS,
					},
				},
			});
			return;
		}

		const described = describeWrite(before, text);
		const seal = !small || addedNewline(before, text);
		set(
			pushNode(state, {
				doc,
				kind: "write",
				label: described.label,
				detail: described.detail,
				cardId,
				coalesceMs: seal ? 0 : COALESCE_MS,
			}),
		);
	},

	addCard: () => {
		const state = get();
		const current = state.nodes[state.currentId];
		const id = crypto.randomUUID();
		const doc: Doc = { cards: [...current.doc.cards.map((card) => ({ ...card })), { id, text: "" }] };
		set(
			pushNode(state, {
				doc,
				kind: "add",
				label: "Added",
				detail: `${doc.cards.length} notes`,
				cardId: null,
				coalesceMs: 0,
			}),
		);
		return id;
	},

	removeCard: (cardId) => {
		const state = get();
		const current = state.nodes[state.currentId];
		const card = current.doc.cards.find((item) => item.id === cardId);
		if (!card) return;
		const doc: Doc = {
			cards: current.doc.cards.filter((item) => item.id !== cardId).map((item) => ({ ...item })),
		};
		set(
			pushNode(state, {
				doc,
				kind: "remove",
				label: "Removed",
				detail: card.text.trim() ? snippet(card.text) : "Blank note",
				cardId: null,
				coalesceMs: 0,
			}),
		);
	},

	/** `to` is the index the note should occupy after the move. */
	moveCard: (from, to) => {
		const state = get();
		const current = state.nodes[state.currentId];
		const cards = current.doc.cards;
		if (from < 0 || to < 0 || from >= cards.length || to >= cards.length || from === to) return;
		const next = cards.map((card) => ({ ...card }));
		const [moved] = next.splice(from, 1);
		if (!moved) return;
		next.splice(to, 0, moved);
		set(
			pushNode(state, {
				doc: { cards: next },
				kind: "reorder",
				label: "Reordered",
				detail: orderDetail({ cards: next }),
				cardId: null,
				coalesceMs: 0,
			}),
		);
	},

	undo: () => {
		const state = get();
		const parentId = state.nodes[state.currentId]?.parentId;
		if (!parentId) return;
		set(visit(state, parentId));
	},

	redo: () => {
		const state = get();
		const next = redoTarget(state);
		if (!next) return;
		set(visit(state, next));
	},

	checkout: (id) => {
		const state = get();
		if (!state.nodes[id] || id === state.currentId) return;
		set(visit(state, id));
	},
}));
