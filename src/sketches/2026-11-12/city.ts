export const CITY_W = 960;
export const CITY_H = 640;

export type Building = { x: number; y: number; w: number; h: number; shade: number };
export type Tree = { x: number; y: number; r: number };
export type Cell = { x: number; y: number; w: number; h: number };
export type Block = {
	cells: Cell[];
	gaps: Cell[];
	park: boolean;
	plaza: boolean;
	shade: number;
	buildings: Building[];
	trees: Tree[];
};
export type Road = { x: number; y: number; w: number; h: number; avenue: boolean };
export type City = {
	seed: number;
	blocks: Block[];
	roads: Road[];
	bounds: Cell;
};

const ROOFS = ["#cbb89a", "#b7a488", "#d8c6aa", "#a89478", "#cfc0a4", "#9c8b72"];

function mulberry32(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function divide(total: number, weights: number[]): number[] {
	const sum = weights.reduce((totalWeight, weight) => totalWeight + weight, 0) || 1;
	const out = weights.map((weight) => Math.floor((weight / sum) * total));
	let left = total - out.reduce((totalWidth, width) => totalWidth + width, 0);
	for (let index = 0; left > 0; index++) {
		const slot = out[index % out.length];
		if (slot == null) break;
		out[index % out.length] = slot + 1;
		left -= 1;
	}
	return out;
}

function pickAvenues(count: number, want: number, rand: () => number): boolean[] {
	const flags = Array<boolean>(count).fill(false);
	if (count === 0 || want <= 0) return flags;
	const chosen: number[] = [];
	const target = Math.min(want, count);
	for (let attempt = 0; attempt < 40 && chosen.length < target; attempt++) {
		const index = Math.floor(rand() * count);
		if (flags[index]) continue;
		if (chosen.some((item) => Math.abs(item - index) < 2)) continue;
		flags[index] = true;
		chosen.push(index);
	}
	for (let index = 0; chosen.length < target && index < count; index++) {
		if (flags[index]) continue;
		flags[index] = true;
		chosen.push(index);
	}
	return flags;
}

function fitCount(count: number, space: number) {
	let next = count;
	while (next > 4 && (next - 1) * 10 + next * 34 > space) next -= 1;
	return next;
}

function makeUnion(count: number, maxBlock: number) {
	const parent = Array.from({ length: count }, (_, index) => index);
	const size = Array<number>(count).fill(1);
	function find(index: number): number {
		let root = index;
		while (parent[root] !== root) root = parent[root] ?? root;
		let cursor = index;
		while (cursor !== root) {
			const next = parent[cursor] ?? root;
			parent[cursor] = root;
			cursor = next;
		}
		return root;
	}
	function unite(a: number, b: number) {
		const left = find(a);
		const right = find(b);
		if (left === right) return false;
		const leftSize = size[left] ?? 1;
		const rightSize = size[right] ?? 1;
		if (leftSize + rightSize > maxBlock) return false;
		if (leftSize < rightSize) {
			parent[left] = right;
			size[right] = leftSize + rightSize;
		} else {
			parent[right] = left;
			size[left] = leftSize + rightSize;
		}
		return true;
	}
	return { find, unite };
}

function buildingsFor(cell: Cell, rand: () => number): Building[] {
	const pad = 5;
	const x = cell.x + pad;
	const y = cell.y + pad;
	const w = cell.w - pad * 2;
	const h = cell.h - pad * 2;
	if (w < 8 || h < 8) return [];
	const cols = w > 68 ? 2 : 1;
	const rows = h > 68 ? 2 : 1;
	const gap = cols > 1 || rows > 1 ? 4 : 0;
	const cellW = (w - gap * (cols - 1)) / cols;
	const cellH = (h - gap * (rows - 1)) / rows;
	const buildings: Building[] = [];
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const shrinkX = cellW * (0.04 + rand() * 0.16);
			const shrinkY = cellH * (0.04 + rand() * 0.16);
			buildings.push({
				x: x + col * (cellW + gap) + shrinkX / 2,
				y: y + row * (cellH + gap) + shrinkY / 2,
				w: Math.max(4, cellW - shrinkX),
				h: Math.max(4, cellH - shrinkY),
				shade: rand(),
			});
		}
	}
	return buildings;
}

function treesFor(cell: Cell, rand: () => number): Tree[] {
	const count = Math.max(1, Math.round((cell.w * cell.h) / 560));
	const trees: Tree[] = [];
	for (let index = 0; index < count; index++) {
		const r = 2.4 + rand() * 3.2;
		const spanX = Math.max(1, cell.w - r * 2 - 8);
		const spanY = Math.max(1, cell.h - r * 2 - 8);
		trees.push({
			x: cell.x + r + 4 + rand() * spanX,
			y: cell.y + r + 4 + rand() * spanY,
			r,
		});
	}
	return trees;
}

export function generateCity(seed: number, density: number, parks: number): City {
	const rand = mulberry32(seed);
	const margin = 40;
	const innerW = CITY_W - margin * 2;
	const innerH = CITY_H - margin * 2;
	const streets = Math.min(1, Math.max(0, density));
	const green = Math.min(1, Math.max(0, parks));
	const cols = fitCount(6 + Math.round(streets * 8), innerW);
	const rows = fitCount(5 + Math.round(streets * 6), innerH);

	const avenueV = pickAvenues(cols - 1, streets > 0.25 ? 2 : 1, rand);
	const avenueH = pickAvenues(rows - 1, streets > 0.45 ? 2 : 1, rand);
	const vWidth = avenueV.map((avenue) =>
		avenue ? 16 + Math.floor(rand() * 5) : 7 + Math.floor(rand() * 3),
	);
	const hWidth = avenueH.map((avenue) =>
		avenue ? 16 + Math.floor(rand() * 5) : 7 + Math.floor(rand() * 3),
	);
	const colW = divide(
		innerW - vWidth.reduce((total, width) => total + width, 0),
		Array.from({ length: cols }, () => 0.75 + rand() * 0.5),
	);
	const rowH = divide(
		innerH - hWidth.reduce((total, width) => total + width, 0),
		Array.from({ length: rows }, () => 0.75 + rand() * 0.5),
	);

	const colX: number[] = [];
	const rowY: number[] = [];
	let cursorX = margin;
	for (let col = 0; col < cols; col++) {
		colX.push(cursorX);
		cursorX += colW[col] ?? 0;
		if (col < cols - 1) cursorX += vWidth[col] ?? 0;
	}
	let cursorY = margin;
	for (let row = 0; row < rows; row++) {
		rowY.push(cursorY);
		cursorY += rowH[row] ?? 0;
		if (row < rows - 1) cursorY += hWidth[row] ?? 0;
	}

	const union = makeUnion(rows * cols, 3);
	const closedV = Array.from({ length: rows }, () =>
		Array<boolean>(Math.max(0, cols - 1)).fill(false),
	);
	const closedH = Array.from({ length: Math.max(0, rows - 1) }, () =>
		Array<boolean>(cols).fill(false),
	);
	const closeChance = 0.36 - streets * 0.2;
	const indexOf = (row: number, col: number) => row * cols + col;

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols - 1; col++) {
			if (avenueV[col]) continue;
			if (rand() > closeChance) continue;
			if (union.unite(indexOf(row, col), indexOf(row, col + 1))) {
				const rowClosed = closedV[row];
				if (rowClosed) rowClosed[col] = true;
			}
		}
	}
	for (let row = 0; row < rows - 1; row++) {
		for (let col = 0; col < cols; col++) {
			if (avenueH[row]) continue;
			if (rand() > closeChance) continue;
			if (union.unite(indexOf(row, col), indexOf(row + 1, col))) {
				const rowClosed = closedH[row];
				if (rowClosed) rowClosed[col] = true;
			}
		}
	}

	const groups = new Map<number, number[]>();
	for (let index = 0; index < rows * cols; index++) {
		const root = union.find(index);
		const list = groups.get(root);
		if (list) list.push(index);
		else groups.set(root, [index]);
	}

	const blocks: Block[] = [];
	for (const members of groups.values()) {
		const cells: Cell[] = members.map((index) => {
			const row = Math.floor(index / cols);
			const col = index % cols;
			return {
				x: colX[col] ?? margin,
				y: rowY[row] ?? margin,
				w: colW[col] ?? 0,
				h: rowH[row] ?? 0,
			};
		});
		const gaps: Cell[] = [];
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols - 1; col++) {
				if (!closedV[row]?.[col]) continue;
				if (!members.includes(indexOf(row, col))) continue;
				gaps.push({
					x: (colX[col] ?? 0) + (colW[col] ?? 0),
					y: rowY[row] ?? 0,
					w: vWidth[col] ?? 0,
					h: rowH[row] ?? 0,
				});
			}
		}
		for (let row = 0; row < rows - 1; row++) {
			for (let col = 0; col < cols; col++) {
				if (!closedH[row]?.[col]) continue;
				if (!members.includes(indexOf(row, col))) continue;
				gaps.push({
					x: colX[col] ?? 0,
					y: (rowY[row] ?? 0) + (rowH[row] ?? 0),
					w: colW[col] ?? 0,
					h: hWidth[row] ?? 0,
				});
			}
		}

		const park = rand() < green * 0.55;
		const plaza = !park && cells.length === 1 && rand() < 0.12;
		const shade = rand();
		const buildings = park || plaza ? [] : cells.flatMap((cell) => buildingsFor(cell, rand));
		const trees = park ? cells.flatMap((cell) => treesFor(cell, rand)) : [];
		blocks.push({ cells, gaps, park, plaza, shade, buildings, trees });
	}

	const roads: Road[] = [];
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols - 1; col++) {
			if (closedV[row]?.[col]) continue;
			roads.push({
				x: (colX[col] ?? 0) + (colW[col] ?? 0),
				y: rowY[row] ?? 0,
				w: vWidth[col] ?? 0,
				h: rowH[row] ?? 0,
				avenue: avenueV[col] === true,
			});
		}
	}
	for (let row = 0; row < rows - 1; row++) {
		for (let col = 0; col < cols; col++) {
			if (closedH[row]?.[col]) continue;
			roads.push({
				x: colX[col] ?? 0,
				y: (rowY[row] ?? 0) + (rowH[row] ?? 0),
				w: colW[col] ?? 0,
				h: hWidth[row] ?? 0,
				avenue: avenueH[row] === true,
			});
		}
	}

	const right = cursorX;
	const bottom = cursorY;
	return {
		seed,
		blocks,
		roads,
		bounds: { x: margin, y: margin, w: right - margin, h: bottom - margin },
	};
}

function fillPieces(ctx: CanvasRenderingContext2D, pieces: Cell[], color: string) {
	ctx.fillStyle = color;
	for (const piece of pieces) ctx.fillRect(piece.x, piece.y, piece.w, piece.h);
}

export function paintCity(ctx: CanvasRenderingContext2D, city: City) {
	ctx.fillStyle = "#f4ecdf";
	ctx.fillRect(0, 0, CITY_W, CITY_H);

	ctx.fillStyle = "#4e4a43";
	ctx.fillRect(city.bounds.x, city.bounds.y, city.bounds.w, city.bounds.h);
	const roads = [...city.roads].sort((a, b) => Number(a.avenue) - Number(b.avenue));
	for (const road of roads) {
		ctx.fillStyle = road.avenue ? "#2f2d2a" : "#5a554c";
		ctx.fillRect(road.x, road.y, road.w, road.h);
	}

	for (const block of city.blocks) {
		const ground = block.park ? (block.shade > 0.5 ? "#b7c9a4" : "#c5d4b2") : "#e6dccb";
		fillPieces(ctx, block.cells, ground);
		fillPieces(ctx, block.gaps, ground);

		for (const building of block.buildings) {
			const roof = ROOFS[Math.floor(building.shade * ROOFS.length) % ROOFS.length] ?? "#cbb89a";
			ctx.fillStyle = roof;
			ctx.fillRect(building.x, building.y, building.w, building.h);
			ctx.fillStyle = "rgba(88, 72, 52, 0.28)";
			ctx.fillRect(building.x, building.y + building.h - 1.5, building.w, 1.5);
			ctx.fillRect(building.x + building.w - 1.5, building.y, 1.5, building.h);
		}

		for (const tree of block.trees) {
			ctx.fillStyle = "#6f8f62";
			ctx.beginPath();
			ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#d5e4c4";
			ctx.beginPath();
			ctx.arc(tree.x - tree.r * 0.25, tree.y - tree.r * 0.28, tree.r * 0.32, 0, Math.PI * 2);
			ctx.fill();
		}

		if (block.plaza) {
			const cell = block.cells[0];
			if (cell) {
				ctx.strokeStyle = "#c4b59a";
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(
					cell.x + cell.w / 2,
					cell.y + cell.h / 2,
					Math.min(cell.w, cell.h) * 0.16,
					0,
					Math.PI * 2,
				);
				ctx.stroke();
			}
		}
	}

	ctx.save();
	ctx.strokeStyle = "rgba(244, 236, 220, 0.72)";
	ctx.lineWidth = 1.1;
	ctx.setLineDash([9, 7]);
	ctx.lineCap = "butt";
	for (const road of city.roads) {
		if (!road.avenue || road.w < 4 || road.h < 4) continue;
		ctx.beginPath();
		if (road.w >= road.h) {
			ctx.moveTo(road.x + 3, road.y + road.h / 2);
			ctx.lineTo(road.x + road.w - 3, road.y + road.h / 2);
		} else {
			ctx.moveTo(road.x + road.w / 2, road.y + 3);
			ctx.lineTo(road.x + road.w / 2, road.y + road.h - 3);
		}
		ctx.stroke();
	}
	ctx.restore();

	ctx.strokeStyle = "#2c2926";
	ctx.lineWidth = 1.5;
	ctx.strokeRect(city.bounds.x + 0.5, city.bounds.y + 0.5, city.bounds.w - 1, city.bounds.h - 1);
}
