import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ROOT_ID, redoTarget, useUndoStore, type Card, type HistNode } from "./store";

const NODE_W = 172;
const NODE_H = 52;
const GAP_X = 22;
const GAP_Y = 32;
const PAD = 8;

type Point = { x: number; y: number };

function layoutTree(nodes: Record<string, HistNode>, rootId: string) {
	const widths = new Map<string, number>();

	function measure(id: string): number {
		const kids = nodes[id]?.childIds ?? [];
		if (kids.length === 0) {
			widths.set(id, NODE_W);
			return NODE_W;
		}
		const inner = kids.reduce((sum, kid) => sum + measure(kid), 0) + GAP_X * (kids.length - 1);
		const width = Math.max(NODE_W, inner);
		widths.set(id, width);
		return width;
	}

	const positions = new Map<string, Point>();

	function place(id: string, left: number, depth: number) {
		const width = widths.get(id) ?? NODE_W;
		positions.set(id, { x: left + (width - NODE_W) / 2, y: depth * (NODE_H + GAP_Y) });
		const kids = nodes[id]?.childIds ?? [];
		if (kids.length === 0) return;
		const inner =
			kids.reduce((sum, kid) => sum + (widths.get(kid) ?? NODE_W), 0) + GAP_X * (kids.length - 1);
		let cursor = left + (width - inner) / 2;
		for (const kid of kids) {
			place(kid, cursor, depth + 1);
			cursor += (widths.get(kid) ?? NODE_W) + GAP_X;
		}
	}

	const total = measure(rootId);
	place(rootId, 0, 0);
	let deepest = 0;
	for (const point of positions.values()) deepest = Math.max(deepest, point.y);

	return {
		positions,
		width: total + PAD * 2,
		height: deepest + NODE_H + PAD * 2,
	};
}

function ancestorsOf(nodes: Record<string, HistNode>, id: string): Set<string> {
	const path = new Set<string>();
	let cursor: string | null = id;
	while (cursor) {
		path.add(cursor);
		cursor = nodes[cursor]?.parentId ?? null;
	}
	return path;
}

function Grip() {
	return (
		<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
			<circle cx="2" cy="2.5" r="1.15" fill="currentColor" />
			<circle cx="8" cy="2.5" r="1.15" fill="currentColor" />
			<circle cx="2" cy="8" r="1.15" fill="currentColor" />
			<circle cx="8" cy="8" r="1.15" fill="currentColor" />
			<circle cx="2" cy="13.5" r="1.15" fill="currentColor" />
			<circle cx="8" cy="13.5" r="1.15" fill="currentColor" />
		</svg>
	);
}

function Note({ card, placeholder }: { card: Card; placeholder: string }) {
	const setText = useUndoStore((state) => state.setText);
	const removeCard = useUndoStore((state) => state.removeCard);
	const areaRef = useRef<HTMLTextAreaElement>(null);
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: card.id,
	});

	useLayoutEffect(() => {
		const area = areaRef.current;
		if (!area) return;
		area.style.height = "0px";
		area.style.height = `${Math.max(area.scrollHeight, 72)}px`;
	}, [card.text]);

	return (
		<article
			ref={setNodeRef}
			data-note={card.id}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={`relative rounded-2xl bg-[#101211] ring-1 ring-white/10 ${isDragging ? "z-10 opacity-70" : ""}`}
		>
			<div className="flex">
				<button
					type="button"
					aria-label={`Drag to reorder: ${card.text.trim() || "blank note"}`}
					className="flex w-9 shrink-0 cursor-grab touch-none items-center justify-center self-stretch text-[#f4efe8]/35 select-none hover:text-[#f4efe8]/80 active:cursor-grabbing"
					{...attributes}
					{...listeners}
				>
					<Grip />
				</button>
				<textarea
					ref={areaRef}
					value={card.text}
					placeholder={placeholder}
					rows={2}
					spellCheck
					aria-label={card.text.trim() ? "Note" : "Blank note"}
					onChange={(event) => setText(card.id, event.target.value)}
					className="min-h-[4.5rem] w-full resize-none bg-transparent py-3 pr-10 text-sm leading-6 text-[#f4efe8] outline-none placeholder:text-[#f4efe8]/30"
				/>
			</div>
			<button
				type="button"
				aria-label={`Remove note${card.text.trim() ? `: ${card.text.trim()}` : ""}`}
				onClick={() => removeCard(card.id)}
				className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full text-sm text-[#f4efe8]/45 hover:bg-white/10 hover:text-[#f4efe8]"
			>
				×
			</button>
		</article>
	);
}

function Notes({ cards }: { cards: Card[] }) {
	const addCard = useUndoStore((state) => state.addCard);
	const moveCard = useUndoStore((state) => state.moveCard);
	const listRef = useRef<HTMLDivElement>(null);
	const pendingFocus = useRef<string | null>(null);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	useLayoutEffect(() => {
		const id = pendingFocus.current;
		if (!id || !listRef.current) return;
		const article = [...listRef.current.querySelectorAll<HTMLElement>("[data-note]")].find(
			(element) => element.getAttribute("data-note") === id,
		);
		const area = article?.querySelector<HTMLTextAreaElement>("textarea");
		if (!area) return;
		area.focus();
		pendingFocus.current = null;
	}, [cards]);

	function onDragEnd(event: DragEndEvent) {
		const overId = event.over?.id;
		if (overId == null || overId === event.active.id) return;
		const latest = useUndoStore.getState();
		const order = latest.nodes[latest.currentId].doc.cards;
		const from = order.findIndex((card) => card.id === event.active.id);
		const to = order.findIndex((card) => card.id === overId);
		if (from < 0 || to < 0) return;
		moveCard(from, to);
	}

	return (
		<section className="min-w-0">
			<div className="mb-2 flex items-center justify-between gap-3">
				<h2 className="text-sm text-[#f4efe8]/70">Notes</h2>
				<button
					type="button"
					onClick={() => {
						pendingFocus.current = addCard();
					}}
					className="rounded-full bg-[#fecef5] px-3 py-1.5 text-sm text-[#191b1a]"
				>
					Add a note
				</button>
			</div>
			<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
				<SortableContext
					items={cards.map((card) => card.id)}
					strategy={verticalListSortingStrategy}
				>
					<div ref={listRef} className="flex flex-col gap-2">
						{cards.length === 0 ? (
							<p className="rounded-2xl bg-[#101211] px-4 py-6 text-sm text-[#f4efe8]/45">
								No notes in this version.
							</p>
						) : (
							cards.map((card, index) => (
								<Note
									key={card.id}
									card={card}
									placeholder={index === 0 ? "Write a version of this note" : "Another note"}
								/>
							))
						)}
					</div>
				</SortableContext>
			</DndContext>
		</section>
	);
}

function nodeTone(
	id: string,
	currentId: string,
	onPath: boolean,
	sibling: boolean,
	forward: boolean,
	isRedo: boolean,
): string {
	if (id === currentId) return "bg-[#fecef5] text-[#191b1a]";
	if (sibling) return "bg-[#fecef5]/10 text-[#f4efe8] ring-1 ring-[#fecef5]/55";
	if (isRedo) return "bg-white/10 text-[#f4efe8] ring-1 ring-[#fecef5]/70";
	if (forward) return "bg-white/10 text-[#f4efe8]/90 ring-1 ring-white/15";
	if (onPath) return "bg-white/10 text-[#f4efe8]";
	return "bg-white/[0.03] text-[#f4efe8]/50 ring-1 ring-white/10";
}

function History({
	nodes,
	currentId,
	redoId,
	onOpen,
}: {
	nodes: Record<string, HistNode>;
	currentId: string;
	redoId: string | null;
	onOpen: (id: string) => void;
}) {
	const scrollerRef = useRef<HTMLDivElement>(null);
	const layout = useMemo(() => layoutTree(nodes, ROOT_ID), [nodes]);
	const path = useMemo(() => ancestorsOf(nodes, currentId), [nodes, currentId]);
	const current = nodes[currentId];
	const siblingIds = new Set(
		current?.parentId
			? (nodes[current.parentId]?.childIds.filter((id) => id !== currentId) ?? [])
			: [],
	);
	const childIds = new Set(current?.childIds ?? []);

	useEffect(() => {
		const scroller = scrollerRef.current;
		const node = [...(scroller?.querySelectorAll<HTMLElement>("[data-hist]") ?? [])].find(
			(element) => element.getAttribute("data-hist") === currentId,
		);
		if (!scroller || !node) return;
		const nodeRect = node.getBoundingClientRect();
		const box = scroller.getBoundingClientRect();
		const left =
			nodeRect.left < box.left
				? nodeRect.left - box.left - 12
				: nodeRect.right > box.right
					? nodeRect.right - box.right + 12
					: 0;
		const top =
			nodeRect.top < box.top
				? nodeRect.top - box.top - 12
				: nodeRect.bottom > box.bottom
					? nodeRect.bottom - box.bottom + 12
					: 0;
		if (left || top) scroller.scrollBy({ left, top });
	}, [currentId, layout]);

	const edges = Object.values(nodes).flatMap((node) => {
		if (!node.parentId) return [];
		const parent = layout.positions.get(node.parentId);
		const child = layout.positions.get(node.id);
		if (!parent || !child) return [];
		const x1 = parent.x + PAD + NODE_W / 2;
		const y1 = parent.y + PAD + NODE_H;
		const x2 = child.x + PAD + NODE_W / 2;
		const y2 = child.y + PAD;
		const mid = (y1 + y2) / 2;
		const onPath = path.has(node.id);
		const fork = siblingIds.has(node.id) || childIds.has(node.id);
		return [
			{
				id: node.id,
				d: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`,
				stroke: onPath || fork ? "#fecef5" : "rgba(244,239,232,0.22)",
				width: onPath ? 1.75 : 1.25,
				opacity: onPath ? 1 : fork ? 0.55 : 1,
			},
		];
	});

	return (
		<div
			ref={scrollerRef}
			className="max-h-[32rem] overflow-auto rounded-2xl bg-[#101211]"
			role="group"
			aria-label="Undo history"
		>
			<div className="flex min-w-full justify-center">
				<div className="relative" style={{ width: layout.width, height: layout.height }}>
					<svg
						className="pointer-events-none absolute inset-0"
						width={layout.width}
						height={layout.height}
						aria-hidden="true"
					>
						{edges.map((edge) => (
							<path
								key={edge.id}
								d={edge.d}
								fill="none"
								stroke={edge.stroke}
								strokeWidth={edge.width}
								opacity={edge.opacity}
							/>
						))}
					</svg>
					{Object.values(nodes).map((node) => {
						const point = layout.positions.get(node.id);
						if (!point) return null;
						const here = node.id === currentId;
						return (
							<button
								key={node.id}
								type="button"
								data-hist={node.id}
								aria-current={here ? "true" : undefined}
								title={
									here ? `${node.label}: ${node.detail}` : `Open ${node.label}: ${node.detail}`
								}
								onClick={() => onOpen(node.id)}
								style={{
									left: point.x + PAD,
									top: point.y + PAD,
									width: NODE_W,
									height: NODE_H,
								}}
								className={`absolute overflow-hidden rounded-xl px-2.5 py-1.5 text-left ${nodeTone(
									node.id,
									currentId,
									path.has(node.id),
									siblingIds.has(node.id),
									childIds.has(node.id),
									node.id === redoId,
								)}`}
							>
								<span className="block truncate text-[10px] font-medium tracking-wide uppercase">
									{node.label}
								</span>
								<span className="mt-0.5 block truncate text-xs">{node.detail}</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function hereText(node: HistNode): string {
	if (node.childIds.length > 1) {
		return `${node.childIds.length} branches leave this version. Edit to add another, or open one.`;
	}
	if (node.childIds.length === 1) {
		return "A later version is still attached. Editing here starts a new branch beside it.";
	}
	if (node.parentId)
		return "Tip of this branch. Undo steps back, and the text you add next stays here.";
	return "Nothing edited yet. The first change grows the tree.";
}

export default function UndoTree() {
	const { nodes, currentId, lastChild, undo, redo, checkout } = useUndoStore();

	const current = nodes[currentId];
	const cards = current.doc.cards;
	const redoId = redoTarget({ nodes, currentId, lastChild });

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
			// Ctrl+Z or Command+Z
			if (event.code === "KeyZ" && !event.shiftKey) {
				event.preventDefault();
				undo();
				return;
			}
			// Ctrl+Shift+Z or Command+Shift+Z
			if ((event.code === "KeyZ" && event.shiftKey) || event.code === "KeyY") {
				event.preventDefault();
				redo();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [undo, redo]);

	return (
		<div className="mx-auto max-w-6xl px-6 pb-16">
			<div className="rounded-3xl bg-[#191b1a] p-4 text-[#f4efe8] sm:p-5">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<p className="font-space-grotesk text-lg text-[#fecef5]">Versions</p>
						<p className="mt-1 max-w-xl text-sm leading-6 text-[#f4efe8]/60">
							Typing, adding, removing, and reordering each leave a node. Undo steps to the parent.
							Edit from there and the path you left stays beside the new one.
						</p>
					</div>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={undo}
							disabled={current.parentId == null}
							aria-keyshortcuts="Control+Z"
							className="rounded-full px-3 py-1.5 text-sm text-[#f4efe8]/85 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
						>
							Undo
						</button>
						<button
							type="button"
							onClick={redo}
							disabled={redoId == null}
							aria-keyshortcuts="Control+Shift+Z"
							className="rounded-full px-3 py-1.5 text-sm text-[#f4efe8]/85 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
						>
							Redo
						</button>
					</div>
				</div>

				<div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
					<Notes cards={cards} />
					<section className="min-w-0">
						<div className="mb-2 flex items-baseline justify-between gap-3">
							<h2 className="text-sm text-[#f4efe8]/70">History</h2>
							<p className="truncate text-xs text-[#fecef5]">
								{current.label}
								<span className="text-[#f4efe8]/45"> · {current.detail}</span>
							</p>
						</div>
						<History nodes={nodes} currentId={currentId} redoId={redoId} onOpen={checkout} />
						<p className="mt-2 text-xs leading-5 text-[#f4efe8]/55">{hereText(current)}</p>
						<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#f4efe8]/45">
							<li className="flex items-center gap-1.5">
								<span className="h-2.5 w-2.5 rounded-sm bg-[#fecef5]" />
								Here
							</li>
							<li className="flex items-center gap-1.5">
								<span className="h-2.5 w-2.5 rounded-sm bg-[#fecef5]/20 ring-1 ring-[#fecef5]/55" />
								Other branch
							</li>
							<li className="flex items-center gap-1.5">
								<span className="h-2.5 w-2.5 rounded-sm bg-white/15" />
								On this path
							</li>
						</ul>
						<p className="mt-2 text-[11px] text-[#f4efe8]/35">
							Ctrl+Z steps back. Ctrl+Shift+Z redoes the branch you last had open. Click any node to
							open it.
						</p>
					</section>
				</div>
			</div>
		</div>
	);
}
