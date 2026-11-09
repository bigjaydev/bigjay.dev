export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export type Frame = {
	columns: string[];
	rows: Row[];
};

export type Cmp = "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte";
export type AggFn = "sum" | "mean" | "count" | "min" | "max";
export type Dir = "asc" | "desc";

export type Agg = {
	column: string;
	fn: AggFn;
	as: string;
};

export type Measure = {
	column: string;
	fn: AggFn;
};

export type Step =
	| { id: string; kind: "filter"; column: string; cmp: Cmp; value: string }
	| { id: string; kind: "sort"; column: string; dir: Dir }
	| { id: string; kind: "derive"; name: string; expr: string }
	| { id: string; kind: "keep"; columns: string[] }
	| { id: string; kind: "drop"; columns: string[] }
	| { id: string; kind: "rename"; from: string; to: string }
	| { id: string; kind: "move"; column: string; dir: "left" | "right" }
	| { id: string; kind: "cast"; column: string; to: "number" | "text" }
	| { id: string; kind: "groupby"; by: string[]; aggs: Agg[] }
	| { id: string; kind: "pivot"; index: string[]; columns: string; values: Measure[] }
	| {
			id: string;
			kind: "melt";
			ids: string[];
			values: string[];
			varName: string;
			valueName: string;
	  }
	| { id: string; kind: "split"; column: string; sep: string; into: string[] }
	| { id: string; kind: "explode"; column: string; sep: string }
	| { id: string; kind: "unite"; columns: string[]; into: string; sep: string }
	| { id: string; kind: "transpose"; index: string; name: string };

export type Stage = {
	frame: Frame;
	error: string | null;
	skipped: boolean;
};

const RAW: [string, string, string, number, number][] = [
	["Sat", "Lisbon / Flowers", "Tulip", 4, 3.5],
	["Sat", "Lisbon / Flowers", "Rose", 2, 6],
	["Sat", "Lisbon / Bread", "Loaf", 5, 4],
	["Sat", "Lisbon / Bread", "Bun", 12, 1.5],
	["Sat", "Lisbon / Records", "LP", 1, 24],
	["Sat", "Porto / Flowers", "Tulip", 3, 3.5],
	["Sat", "Porto / Flowers", "Rose", 1, 6],
	["Sat", "Porto / Records", "Single", 2, 8],
	["Sun", "Lisbon / Flowers", "Tulip", 6, 3.5],
	["Sun", "Lisbon / Flowers", "Rose", 2, 6],
	["Sun", "Lisbon / Bread", "Bun", 8, 1.5],
	["Sun", "Lisbon / Records", "LP", 1, 22],
	["Sun", "Porto / Flowers", "Tulip", 5, 3.5],
	["Sun", "Porto / Bread", "Loaf", 3, 4],
	["Sun", "Porto / Bread", "Bun", 9, 1.5],
	["Sun", "Porto / Records", "Single", 4, 8],
];

export const market: Frame = {
	columns: ["day", "where", "item", "qty", "price"],
	rows: RAW.map(([day, where, item, qty, price]) => ({ day, where, item, qty, price })),
};

let seq = 0;

export function uid(): string {
	seq += 1;
	return `step-${seq}`;
}

export function shapeOf(frame: Frame): string {
	return `${frame.rows.length}×${frame.columns.length}`;
}

export function isNumericColumn(frame: Frame, column: string): boolean {
	const values = frame.rows.map((row) => row[column]).filter((value) => value != null);
	return values.length > 0 && values.every((value) => typeof value === "number");
}

export function summary(step: Step): string {
	switch (step.kind) {
		case "filter":
			return `filter ${step.column}`;
		case "sort":
			return `sort ${step.column}`;
		case "derive":
			return step.name.trim() || "calculate";
		case "keep":
			return `keep ${step.columns.length}`;
		case "drop":
			return step.columns.length === 1 ? `drop ${step.columns[0]}` : `drop ${step.columns.length}`;
		case "rename":
			return `rename ${step.from}`;
		case "move":
			return `move ${step.column}`;
		case "groupby":
			return step.by.length ? `group ${step.by.join(", ")}` : "aggregate";
		case "cast":
			return `${step.to} ${step.column}`;
		case "pivot":
			return `spread ${step.columns}`;
		case "melt":
			return "gather";
		case "split":
			return `split ${step.column}`;
		case "explode":
			return `rows from ${step.column}`;
		case "unite":
			return `unite ${step.into}`;
		case "transpose":
			return `transpose ${step.index}`;
	}
}

function requireColumn(frame: Frame, column: string): void {
	if (!frame.columns.includes(column)) throw new Error(`No column “${column}”`);
}

function numericLiteral(raw: string): number | null {
	const trimmed = raw.trim();
	if (!trimmed || /^0\d/.test(trimmed)) return null;
	if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : null;
}

function matches(cell: Cell, cmp: Cmp, raw: string): boolean {
	if (cmp === "contains") {
		if (cell == null) return false;
		return String(cell).includes(raw);
	}
	if (cmp === "eq" || cmp === "neq") {
		const number = numericLiteral(raw);
		const same =
			number != null && typeof cell === "number"
				? cell === number
				: cell == null
					? raw === ""
					: String(cell) === raw;
		return cmp === "eq" ? same : !same;
	}
	const number = numericLiteral(raw);
	if (number == null) throw new Error("That comparison needs a number");
	if (typeof cell !== "number") return false;
	if (cmp === "gt") return cell > number;
	if (cmp === "gte") return cell >= number;
	if (cmp === "lt") return cell < number;
	return cell <= number;
}

function compareCells(a: Cell, b: Cell): number {
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a).localeCompare(String(b), "en");
}

function aggregate(values: Cell[], fn: AggFn): Cell {
	if (fn === "count") return values.filter((value) => value != null).length;
	if (values.some((value) => value != null && typeof value !== "number")) {
		throw new Error(`${fn} needs numbers`);
	}
	const nums = values.filter((value): value is number => typeof value === "number");
	if (fn === "sum") return nums.reduce((total, value) => total + value, 0);
	if (fn === "mean") {
		if (!nums.length) return null;
		return nums.reduce((total, value) => total + value, 0) / nums.length;
	}
	if (!nums.length) return null;
	return fn === "min" ? Math.min(...nums) : Math.max(...nums);
}

type Expr =
	| { type: "num"; value: number }
	| { type: "col"; name: string }
	| { type: "neg"; inner: Expr }
	| { type: "bin"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr };

function matchColumn(rest: string, columns: string[]): string | null {
	const ranked = [...columns].sort((a, b) => b.length - a.length);
	for (const name of ranked) {
		if (!name || !rest.startsWith(name)) continue;
		const next = rest[name.length];
		if (next && /[A-Za-z0-9_]/.test(next)) continue;
		if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(name)) continue;
		return name;
	}
	return null;
}

function tokenize(input: string, columns: string[]): ExprToken[] {
	const tokens: ExprToken[] = [];
	let index = 0;
	while (index < input.length) {
		const ch = input[index];
		if (ch === " " || ch === "\t") {
			index += 1;
			continue;
		}
		if (ch === "(" || ch === ")") {
			tokens.push({ type: ch });
			index += 1;
			continue;
		}
		if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
			tokens.push({ type: "op", op: ch });
			index += 1;
			continue;
		}
		const column = matchColumn(input.slice(index), columns);
		if (column) {
			tokens.push({ type: "col", name: column });
			index += column.length;
			continue;
		}
		const number = /^(?:\d+\.?\d*|\.\d+)/.exec(input.slice(index));
		if (number) {
			tokens.push({ type: "num", value: Number(number[0]) });
			index += number[0].length;
			continue;
		}
		throw new Error(`Can't read “${input.slice(index, index + 16).trim()}”`);
	}
	return tokens;
}

type ExprToken =
	| { type: "num"; value: number }
	| { type: "col"; name: string }
	| { type: "op"; op: "+" | "-" | "*" | "/" }
	| { type: "(" }
	| { type: ")" };

class Parser {
	private index = 0;
	private tokens: ExprToken[];

	constructor(tokens: ExprToken[]) {
		this.tokens = tokens;
	}

	parse(): Expr {
		if (!this.tokens.length) throw new Error("Write an expression, like qty * price");
		const expr = this.expr();
		if (this.index < this.tokens.length)
			throw new Error("There's extra at the end of the expression");
		return expr;
	}

	private peek(): ExprToken | undefined {
		return this.tokens[this.index];
	}

	private eat(): ExprToken {
		const token = this.tokens[this.index];
		this.index += 1;
		return token;
	}

	private expr(): Expr {
		let left = this.term();
		for (;;) {
			const token = this.peek();
			if (!token || token.type !== "op" || (token.op !== "+" && token.op !== "-")) break;
			this.eat();
			left = { type: "bin", op: token.op, left, right: this.term() };
		}
		return left;
	}

	private term(): Expr {
		let left = this.factor();
		for (;;) {
			const token = this.peek();
			if (!token || token.type !== "op" || (token.op !== "*" && token.op !== "/")) break;
			this.eat();
			left = { type: "bin", op: token.op, left, right: this.factor() };
		}
		return left;
	}

	private factor(): Expr {
		const token = this.peek();
		if (!token) throw new Error("The expression ended early");
		if (token.type === "op" && token.op === "-") {
			this.eat();
			return { type: "neg", inner: this.factor() };
		}
		if (token.type === "op" && token.op === "+") {
			this.eat();
			return this.factor();
		}
		if (token.type === "num") {
			this.eat();
			return { type: "num", value: token.value };
		}
		if (token.type === "col") {
			this.eat();
			return { type: "col", name: token.name };
		}
		if (token.type === "(") {
			this.eat();
			const inner = this.expr();
			if (this.peek()?.type !== ")") throw new Error("Missing )");
			this.eat();
			return inner;
		}
		throw new Error("Expected a column or a number");
	}
}

function parseExpr(input: string, columns: string[]): Expr {
	return new Parser(tokenize(input, columns)).parse();
}

function evalExpr(expr: Expr, row: Row): number | null {
	if (expr.type === "num") return expr.value;
	if (expr.type === "col") {
		const value = row[expr.name];
		if (value == null) return null;
		if (typeof value !== "number") throw new Error(`“${expr.name}” isn't a number`);
		return value;
	}
	if (expr.type === "neg") {
		const value = evalExpr(expr.inner, row);
		return value == null ? null : -value;
	}
	const left = evalExpr(expr.left, row);
	const right = evalExpr(expr.right, row);
	if (left == null || right == null) return null;
	if (expr.op === "+") return left + right;
	if (expr.op === "-") return left - right;
	if (expr.op === "*") return left * right;
	return right === 0 ? null : left / right;
}

function prec(op: "+" | "-" | "*" | "/"): number {
	return op === "*" || op === "/" ? 2 : 1;
}

function compileExpr(expr: Expr, parent = 0): string {
	if (expr.type === "num") return String(expr.value);
	if (expr.type === "col") return `df[${pyStr(expr.name)}]`;
	if (expr.type === "neg") {
		const text = `-${compileExpr(expr.inner, 3)}`;
		return parent > 3 ? `(${text})` : text;
	}
	const rank = prec(expr.op);
	const text = `${compileExpr(expr.left, rank)} ${expr.op} ${compileExpr(expr.right, rank + 1)}`;
	return rank < parent ? `(${text})` : text;
}

function applyStep(frame: Frame, step: Step): Frame {
	switch (step.kind) {
		case "filter": {
			requireColumn(frame, step.column);
			if (
				step.cmp !== "eq" &&
				step.cmp !== "neq" &&
				step.cmp !== "contains" &&
				numericLiteral(step.value) == null
			) {
				throw new Error("That comparison needs a number");
			}
			return {
				columns: frame.columns,
				rows: frame.rows.filter((row) => matches(row[step.column] ?? null, step.cmp, step.value)),
			};
		}
		case "sort": {
			requireColumn(frame, step.column);
			const sign = step.dir === "asc" ? 1 : -1;
			const ranked = frame.rows.map((row, index) => ({ row, index }));
			ranked.sort((a, b) => {
				const left = a.row[step.column] ?? null;
				const right = b.row[step.column] ?? null;
				if (left == null && right == null) return a.index - b.index;
				if (left == null) return 1;
				if (right == null) return -1;
				return compareCells(left, right) * sign || a.index - b.index;
			});
			return { columns: frame.columns, rows: ranked.map((item) => item.row) };
		}
		case "derive": {
			const name = step.name.trim();
			if (!name) throw new Error("Name the new column");
			if (frame.columns.includes(name)) throw new Error(`“${name}” is already a column`);
			const expr = parseExpr(step.expr, frame.columns);
			return {
				columns: [...frame.columns, name],
				rows: frame.rows.map((row) => ({ ...row, [name]: evalExpr(expr, row) })),
			};
		}
		case "keep": {
			if (!step.columns.length) throw new Error("Keep at least one column");
			const missing = step.columns.find((column) => !frame.columns.includes(column));
			if (missing) throw new Error(`No column “${missing}”`);
			return {
				columns: step.columns,
				rows: frame.rows.map((row) => {
					const next: Row = {};
					for (const column of step.columns) next[column] = row[column] ?? null;
					return next;
				}),
			};
		}
		case "drop": {
			if (!step.columns.length) throw new Error("Pick a column to drop");
			const missing = step.columns.find((column) => !frame.columns.includes(column));
			if (missing) throw new Error(`No column “${missing}”`);
			const columns = frame.columns.filter((column) => !step.columns.includes(column));
			if (!columns.length) throw new Error("Leave at least one column");
			return {
				columns,
				rows: frame.rows.map((row) => {
					const next: Row = {};
					for (const column of columns) next[column] = row[column] ?? null;
					return next;
				}),
			};
		}
		case "rename": {
			requireColumn(frame, step.from);
			const to = step.to.trim();
			if (!to) throw new Error("Name the column");
			if (to !== step.from && frame.columns.includes(to))
				throw new Error(`“${to}” is already a column`);
			if (to === step.from) return frame;
			return {
				columns: frame.columns.map((column) => (column === step.from ? to : column)),
				rows: frame.rows.map((row) => {
					const next: Row = {};
					for (const column of frame.columns) {
						next[column === step.from ? to : column] = row[column] ?? null;
					}
					return next;
				}),
			};
		}
		case "move": {
			requireColumn(frame, step.column);
			const index = frame.columns.indexOf(step.column);
			const target = step.dir === "left" ? index - 1 : index + 1;
			if (target < 0 || target >= frame.columns.length) return frame;
			const columns = [...frame.columns];
			[columns[index], columns[target]] = [columns[target], columns[index]];
			return { columns, rows: frame.rows };
		}
		case "groupby": {
			if (!step.aggs.length) throw new Error("Add an aggregation");
			for (const column of step.by) requireColumn(frame, column);
			const names = step.aggs.map((agg) => agg.as.trim());
			if (names.some((name) => !name)) throw new Error("Name each aggregation");
			if (new Set(names).size !== names.length)
				throw new Error("Aggregation names must be different");
			const clash = names.find((name) => step.by.includes(name));
			if (clash) throw new Error(`“${clash}” is already a group column`);
			for (const agg of step.aggs) requireColumn(frame, agg.column);

			const groups = new Map<string, { key: Cell[]; rows: Row[] }>();
			if (!step.by.length) {
				if (frame.rows.length) groups.set("[]", { key: [], rows: frame.rows });
			} else {
				for (const row of frame.rows) {
					const key = step.by.map((column) => row[column] ?? null);
					const sig = JSON.stringify(key);
					const group = groups.get(sig);
					if (group) group.rows.push(row);
					else groups.set(sig, { key, rows: [row] });
				}
			}

			const rows = [...groups.values()].map((group) => {
				const row: Row = {};
				step.by.forEach((column, index) => {
					row[column] = group.key[index];
				});
				step.aggs.forEach((agg, index) => {
					row[names[index]] = aggregate(
						group.rows.map((item) => item[agg.column] ?? null),
						agg.fn,
					);
				});
				return row;
			});
			return { columns: [...step.by, ...names], rows };
		}
		case "pivot": {
			if (!step.index.length) throw new Error("Choose at least one row key");
			if (!step.values.length) throw new Error("Choose a value column");
			for (const column of [
				...step.index,
				step.columns,
				...step.values.map((item) => item.column),
			]) {
				requireColumn(frame, column);
			}
			if (
				step.index.includes(step.columns) ||
				step.values.some((item) => item.column === step.columns)
			) {
				throw new Error("The spread column has to be different from the rows and the values");
			}
			const overlap = step.values.find((item) => step.index.includes(item.column));
			if (overlap) throw new Error(`“${overlap.column}” can't be both a row key and a value`);
			if (new Set(step.values.map((item) => item.column)).size !== step.values.length) {
				throw new Error("Each value column can only be used once");
			}

			const rowOrder: { sig: string; key: Cell[] }[] = [];
			const colOrder: { sig: string; key: Cell }[] = [];
			const seenRows = new Set<string>();
			const seenCols = new Set<string>();
			const buckets = new Map<string, Map<string, Map<string, Cell[]>>>();

			for (const row of frame.rows) {
				const key = step.index.map((column) => row[column] ?? null);
				const colKey = row[step.columns] ?? null;
				if (key.some((cell) => cell == null) || colKey == null) continue;
				const rowSig = JSON.stringify(key);
				const colSig = JSON.stringify(colKey);
				if (!seenRows.has(rowSig)) {
					seenRows.add(rowSig);
					rowOrder.push({ sig: rowSig, key });
				}
				if (!seenCols.has(colSig)) {
					seenCols.add(colSig);
					colOrder.push({ sig: colSig, key: colKey });
				}
				let cols = buckets.get(rowSig);
				if (!cols) {
					cols = new Map();
					buckets.set(rowSig, cols);
				}
				let measures = cols.get(colSig);
				if (!measures) {
					measures = new Map();
					cols.set(colSig, measures);
				}
				for (const value of step.values) {
					const list = measures.get(value.column);
					if (list) list.push(row[value.column] ?? null);
					else measures.set(value.column, [row[value.column] ?? null]);
				}
			}
			if (!rowOrder.length || !colOrder.length) throw new Error("Nothing to spread");

			const used = new Set<string>(step.index);
			const headers: { name: string; colSig: string; column: string; fn: AggFn }[] = [];
			const several = step.values.length > 1;
			for (const value of step.values) {
				for (const column of colOrder) {
					const label = String(column.key) || "(blank)";
					const base = several ? `${value.column}_${label}` : label;
					let name = base;
					let n = 2;
					while (used.has(name)) {
						name = `${base}_${n}`;
						n += 1;
					}
					used.add(name);
					headers.push({ name, colSig: column.sig, column: value.column, fn: value.fn });
				}
			}

			const rows = rowOrder.map((rowKey) => {
				const row: Row = {};
				step.index.forEach((column, index) => {
					row[column] = rowKey.key[index];
				});
				const cols = buckets.get(rowKey.sig);
				for (const header of headers) {
					const bucket = cols?.get(header.colSig)?.get(header.column) ?? [];
					row[header.name] = bucket.length ? aggregate(bucket, header.fn) : null;
				}
				return row;
			});
			return { columns: [...step.index, ...headers.map((header) => header.name)], rows };
		}
		case "melt": {
			for (const column of [...step.ids, ...step.values]) requireColumn(frame, column);
			if (!step.values.length) throw new Error("Pick columns to melt");
			const overlap = step.ids.find((column) => step.values.includes(column));
			if (overlap) throw new Error(`“${overlap}” can't be both kept and melted`);
			const varName = step.varName.trim();
			const valueName = step.valueName.trim();
			if (!varName || !valueName) throw new Error("Name the two new columns");
			if (varName === valueName) throw new Error("The new columns need different names");
			if (step.ids.includes(varName) || step.ids.includes(valueName)) {
				throw new Error("Those names are already kept columns");
			}
			const rows: Row[] = [];
			for (const row of frame.rows) {
				for (const column of step.values) {
					const next: Row = {};
					for (const id of step.ids) next[id] = row[id] ?? null;
					next[varName] = column;
					next[valueName] = row[column] ?? null;
					rows.push(next);
				}
			}
			return { columns: [...step.ids, varName, valueName], rows };
		}
		case "split": {
			requireColumn(frame, step.column);
			const into = step.into.map((name) => name.trim());
			if (!into.length) throw new Error("Name the new columns");
			if (into.some((name) => !name)) throw new Error("Name the new columns");
			if (new Set(into).size !== into.length)
				throw new Error("The new columns need different names");
			if (!step.sep) throw new Error("The separator is empty");
			const clash = into.find((name) => frame.columns.includes(name));
			if (clash) throw new Error(`“${clash}” is already a column`);
			const at = frame.columns.indexOf(step.column);
			const columns = [...frame.columns.slice(0, at + 1), ...into, ...frame.columns.slice(at + 1)];
			const rows = frame.rows.map((row) => {
				const text = row[step.column] == null ? "" : String(row[step.column]);
				const parts = text.split(step.sep);
				const next: Row = { ...row };
				into.forEach((name, index) => {
					if (index < into.length - 1) next[name] = parts[index] ?? null;
					else next[name] = parts.length > index ? parts.slice(index).join(step.sep) : null;
				});
				return next;
			});
			return { columns, rows };
		}
		case "explode": {
			requireColumn(frame, step.column);
			if (!step.sep) throw new Error("The separator is empty");
			const rows: Row[] = [];
			for (const row of frame.rows) {
				const value = row[step.column];
				const parts =
					value == null || value === "" ? [value ?? null] : String(value).split(step.sep);
				for (const part of parts) rows.push({ ...row, [step.column]: part === "" ? null : part });
			}
			return { columns: frame.columns, rows };
		}
		case "unite": {
			if (step.columns.length < 2) throw new Error("Pick at least two columns");
			for (const column of step.columns) requireColumn(frame, column);
			const into = step.into.trim();
			if (!into) throw new Error("Name the new column");
			if (frame.columns.includes(into) && !step.columns.includes(into)) {
				throw new Error(`“${into}” is already a column`);
			}
			const at = frame.columns.findIndex((column) => step.columns.includes(column));
			const columns = [
				...frame.columns.slice(0, at).filter((column) => !step.columns.includes(column)),
				into,
				...frame.columns.slice(at).filter((column) => !step.columns.includes(column)),
			];
			const rows = frame.rows.map((row) => {
				const text = step.columns
					.map((column) => row[column])
					.filter((value) => value != null && value !== "")
					.map(String)
					.join(step.sep);
				const next: Row = {};
				for (const column of columns) {
					next[column] = column === into ? text : (row[column] ?? null);
				}
				return next;
			});
			return { columns, rows };
		}
		case "transpose": {
			requireColumn(frame, step.index);
			const name = step.name.trim();
			if (!name) throw new Error("Name the new column");
			if (frame.columns.includes(name) && name !== step.index) {
				throw new Error(`“${name}” is already a column`);
			}
			const headers: string[] = [];
			for (const row of frame.rows) {
				const cell = row[step.index];
				if (cell == null || cell === "") throw new Error("A row label is blank");
				const base = String(cell);
				if (base === name) throw new Error(`“${base}” would clash with the new column`);
				if (headers.includes(base)) {
					throw new Error(`“${base}” labels more than one row. Group those rows first.`);
				}
				headers.push(base);
			}
			if (!headers.length) throw new Error("Nothing to transpose");
			const fields = frame.columns.filter((column) => column !== step.index);
			if (!fields.length) throw new Error("Need another column to transpose");
			const rows = fields.map((field) => {
				const row: Row = { [name]: field };
				frame.rows.forEach((source, index) => {
					row[headers[index]] = source[field] ?? null;
				});
				return row;
			});
			return { columns: [name, ...headers], rows };
		}
		case "cast": {
			requireColumn(frame, step.column);
			const rows = frame.rows.map((row) => {
				const value = row[step.column] ?? null;
				let next: Cell;
				if (step.to === "text") next = value == null ? null : String(value);
				else if (value == null || value === "") next = null;
				else if (typeof value === "number") next = value;
				else next = numericLiteral(String(value));
				return { ...row, [step.column]: next };
			});
			return { columns: frame.columns, rows };
		}
	}
}

export function run(source: Frame, steps: Step[]): Stage[] {
	const stages: Stage[] = [];
	let current = source;
	let blocked = false;
	for (const step of steps) {
		if (blocked) {
			stages.push({ frame: current, error: null, skipped: true });
			continue;
		}
		try {
			current = applyStep(current, step);
			stages.push({ frame: current, error: null, skipped: false });
		} catch (error) {
			blocked = true;
			stages.push({
				frame: current,
				error: error instanceof Error ? error.message : "This step failed",
				skipped: false,
			});
		}
	}
	return stages;
}

function pyStr(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function pyList(values: string[]): string {
	return `[${values.map(pyStr).join(", ")}]`;
}

function isIdent(name: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function aggCall(aggs: Agg[]): string {
	const named = aggs.map((agg) => ({ ...agg, as: agg.as.trim() }));
	if (named.every((agg) => isIdent(agg.as))) {
		return named.map((agg) => `${agg.as}=(${pyStr(agg.column)}, ${pyStr(agg.fn)})`).join(", ");
	}
	const body = named
		.map((agg) => `${pyStr(agg.as)}: (${pyStr(agg.column)}, ${pyStr(agg.fn)})`)
		.join(", ");
	return `**{${body}}`;
}

function stepCode(step: Step, columns: string[]): string {
	switch (step.kind) {
		case "filter": {
			const col = `df[${pyStr(step.column)}]`;
			if (step.cmp === "contains") {
				return `df = df[${col}.astype(str).str.contains(${pyStr(step.value)}, na=False, regex=False)]`;
			}
			const number = numericLiteral(step.value);
			const literal = number == null ? pyStr(step.value) : String(number);
			const op = { eq: "==", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" }[step.cmp];
			return `df = df[${col} ${op} ${literal}]`;
		}
		case "sort":
			return `df = df.sort_values(${pyStr(step.column)}, ascending=${step.dir === "asc" ? "True" : "False"}, na_position="last")`;
		case "derive": {
			const name = step.name.trim();
			if (!name) throw new Error("Name the new column");
			return `df[${pyStr(name)}] = ${compileExpr(parseExpr(step.expr, columns))}`;
		}
		case "keep":
			return `df = df[${pyList(step.columns)}]`;
		case "drop":
			return `df = df.drop(columns=${pyList(step.columns)})`;
		case "rename":
			return `df = df.rename(columns={${pyStr(step.from)}: ${pyStr(step.to.trim())}})`;
		case "move": {
			const shift = step.dir === "left" ? "- 1" : "+ 1";
			const guard = step.dir === "left" ? "i > 0" : "i + 1 < len(cols)";
			return [
				`cols = df.columns.tolist()`,
				`i = cols.index(${pyStr(step.column)})`,
				`if ${guard}:`,
				`    cols.insert(i ${shift}, cols.pop(i))`,
				`    df = df[cols]`,
			].join("\n");
		}
		case "groupby": {
			const agg = aggCall(step.aggs);
			if (!step.by.length) {
				const fields = step.aggs
					.map((item) => `${pyStr(item.as.trim())}: df[${pyStr(item.column)}].${item.fn}()`)
					.join(", ");
				return `df = pd.DataFrame([{${fields}}])`;
			}
			return `df = df.groupby(${pyList(step.by)}, as_index=False, sort=False).agg(${agg})`;
		}
		case "pivot": {
			const index = pyList(step.index);
			const values = step.values.map((item) => item.column);
			const sameFn = step.values.every((item) => item.fn === step.values[0].fn);
			const aggfunc = sameFn
				? pyStr(step.values[0].fn)
				: `{${step.values.map((item) => `${pyStr(item.column)}: ${pyStr(item.fn)}`).join(", ")}}`;
			const valueArg = values.length === 1 ? pyStr(values[0]) : pyList(values);
			const pivot = `df.pivot_table(index=${index}, columns=${pyStr(step.columns)}, values=${valueArg}, aggfunc=${aggfunc}, sort=False)`;
			if (values.length === 1) return `df = ${pivot}.reset_index()`;
			return `wide = ${pivot}\nwide.columns = [f"{a}_{b}" for a, b in wide.columns]\ndf = wide.reset_index()`;
		}
		case "melt":
			return `df = df.melt(id_vars=${pyList(step.ids)}, value_vars=${pyList(step.values)}, var_name=${pyStr(step.varName.trim())}, value_name=${pyStr(step.valueName.trim())})`;
		case "split":
			return `df[${pyList(step.into.map((name) => name.trim()))}] = df[${pyStr(step.column)}].astype(str).str.split(${pyStr(step.sep)}, n=${Math.max(step.into.length - 1, 0)}, expand=True, regex=False)`;
		case "explode":
			return `df = df.assign(**{${pyStr(step.column)}: df[${pyStr(step.column)}].astype(str).str.split(${pyStr(step.sep)}, regex=False)}).explode(${pyStr(step.column)}, ignore_index=True)`;
		case "unite":
			return `df[${pyStr(step.into.trim())}] = ${step.columns.map((column) => `df[${pyStr(column)}].astype(str)`).join(` + ${pyStr(step.sep)} + `)}\ndf = df.drop(columns=${pyList(step.columns)})`;
		case "transpose":
			return `df = df.set_index(${pyStr(step.index)}).T.reset_index(names=${pyStr(step.name.trim())})\ndf.columns.name = None`;
		case "cast":
			return step.to === "number"
				? `df[${pyStr(step.column)}] = pd.to_numeric(df[${pyStr(step.column)}], errors="coerce")`
				: `df[${pyStr(step.column)}] = df[${pyStr(step.column)}].astype("string")`;
	}
}

export function toPandas(steps: Step[], inputs: Frame[]): string {
	const lines = ["df = data.copy()"];
	let needsPandas = false;
	steps.forEach((step, index) => {
		try {
			const code = stepCode(step, inputs[index]?.columns ?? []);
			if (code.includes("pd.")) needsPandas = true;
			lines.push(code);
		} catch {
			lines.push(`# ${summary(step)} could not be written out`);
		}
	});
	if (needsPandas) lines.unshift("import pandas as pd", "");
	return lines.join("\n");
}

function uniqueHeaders(names: string[]): string[] {
	const used = new Set<string>();
	return names.map((name, index) => {
		const base = name.trim() || `column_${index + 1}`;
		let next = base;
		let n = 2;
		while (used.has(next)) {
			next = `${base}_${n}`;
			n += 1;
		}
		used.add(next);
		return next;
	});
}

export function suggestSplitNames(frame: Frame, column: string, sep: string): string[] {
	let widest = 1;
	if (sep) {
		for (const row of frame.rows) {
			const text = row[column] == null ? "" : String(row[column]);
			widest = Math.max(widest, text.split(sep).length);
		}
	}
	const taken = new Set(frame.columns);
	const names: string[] = [];
	for (let index = 1; index <= widest; index += 1) {
		let name = `${column}_${index}`;
		let n = 2;
		while (taken.has(name) || names.includes(name)) {
			name = `${column}_${index}_${n}`;
			n += 1;
		}
		names.push(name);
	}
	return names;
}

export function detectSeparator(frame: Frame, column: string): string {
	const candidates = [" / ", ", ", " | ", "|", ";", ",", "/", "-"];
	let best = ", ";
	let score = 0;
	for (const sep of candidates) {
		let hits = 0;
		for (const row of frame.rows) {
			const text = row[column] == null ? "" : String(row[column]);
			if (text.includes(sep)) hits += 1;
		}
		if (hits > score || (hits === score && hits > 0 && sep.length > best.length)) {
			best = sep;
			score = hits;
		}
	}
	return score ? best : ", ";
}

export function parseCsv(text: string): Frame {
	const table = parseCsvRows(text.replace(/^\uFEFF/, ""));
	const filled = table.filter((row) => row.some((cell) => cell.trim() !== ""));
	if (filled.length < 2) throw new Error("Paste a header row and at least one data row");
	const columns = uniqueHeaders(filled[0]);
	const rows = filled.slice(1).map((record) => {
		const row: Row = {};
		columns.forEach((column, index) => {
			const raw = (record[index] ?? "").trim();
			if (!raw) row[column] = null;
			else {
				const number = numericLiteral(raw);
				row[column] = number == null ? raw : number;
			}
		});
		return row;
	});
	return { columns, rows };
}

function parseCsvRows(text: string): string[][] {
	const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (quoted) {
			if (char === '"') {
				if (source[index + 1] === '"') {
					cell += '"';
					index += 1;
				} else quoted = false;
			} else cell += char;
		} else if (char === '"') quoted = true;
		else if (char === ",") {
			row.push(cell);
			cell = "";
		} else if (char === "\n") {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
		} else cell += char;
	}
	if (cell.length || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows;
}

function buildSamples(): { id: string; label: string; frame: Frame }[] {
	const long = run(market, [
		{ id: "sample-split", kind: "split", column: "where", sep: " / ", into: ["city", "stall"] },
		{ id: "sample-drop", kind: "drop", columns: ["where"] },
	]);
	const longFrame = long[1]?.frame;
	if (!longFrame || long.some((stage) => stage.error))
		throw new Error("Could not build the long sample");
	const wide = run(longFrame, [
		{
			id: "sample-pivot",
			kind: "pivot",
			index: ["stall"],
			columns: "item",
			values: [{ column: "qty", fn: "sum" }],
		},
	]);
	if (!wide[0] || wide[0].error)
		throw new Error(wide[0]?.error ?? "Could not build the wide sample");
	return [
		{ id: "long", label: "Long", frame: longFrame },
		{ id: "wide", label: "Wide", frame: wide[0].frame },
		{ id: "packed", label: "Packed", frame: market },
	];
}

export const samples = buildSamples();
