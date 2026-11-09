import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
	detectSeparator,
	isNumericColumn,
	parseCsv,
	run,
	samples,
	shapeOf,
	suggestSplitNames,
	summary,
	toPandas,
	uid,
	type AggFn,
	type Cell,
	type Cmp,
	type Frame,
	type Measure,
	type Step,
} from "./frame";

const AGGS: AggFn[] = ["sum", "mean", "count", "min", "max"];
const CMPS: { id: Cmp; label: string }[] = [
	{ id: "eq", label: "is" },
	{ id: "neq", label: "is not" },
	{ id: "contains", label: "contains" },
	{ id: "gt", label: ">" },
	{ id: "gte", label: "≥" },
	{ id: "lt", label: "<" },
	{ id: "lte", label: "≤" },
];

const control =
	"max-w-full rounded-lg bg-[#191b1a] px-2 py-1 text-sm text-[#f4efe8] ring-1 ring-white/10 outline-none focus:ring-[#fecef5]/70";

type Draft = {
	rows: string[];
	spread: string | null;
	values: Measure[];
	aside: string[];
};

type Role = "rows" | "spread" | "values" | "aside";
type Panel = "split" | "unite" | "filter" | "rename" | "calc" | "paste" | null;

function identityDraft(frame: Frame): Draft {
	return { rows: [...frame.columns], spread: null, values: [], aside: [] };
}

function draftDirty(draft: Draft, frame: Frame): boolean {
	return !(
		draft.spread == null &&
		draft.values.length === 0 &&
		draft.aside.length === 0 &&
		draft.rows.length === frame.columns.length &&
		draft.rows.every((column, index) => column === frame.columns[index])
	);
}

function without(draft: Draft, columns: string[]): Draft {
	const moving = new Set(columns);
	return {
		rows: draft.rows.filter((column) => !moving.has(column)),
		spread: draft.spread && moving.has(draft.spread) ? null : draft.spread,
		values: draft.values.filter((value) => !moving.has(value.column)),
		aside: draft.aside.filter((column) => !moving.has(column)),
	};
}

function place(draft: Draft, columns: string[], role: Role, frame: Frame): Draft {
	const next = without(draft, columns);
	if (role === "spread") {
		const [first, ...rest] = columns;
		if (next.spread) next.rows.push(next.spread);
		next.spread = first ?? null;
		next.rows.push(...rest);
	} else if (role === "values") {
		for (const column of columns) {
			next.values.push({ column, fn: isNumericColumn(frame, column) ? "sum" : "count" });
		}
	} else if (role === "aside") next.aside.push(...columns);
	else next.rows.push(...columns);
	return next;
}

function insertRows(draft: Draft, columns: string[], before: string | null, frame: Frame): Draft {
	const placed = place(draft, columns, "rows", frame);
	const rows = placed.rows.filter((column) => !columns.includes(column));
	const at = before == null ? rows.length : Math.max(0, rows.indexOf(before));
	rows.splice(at, 0, ...columns);
	return { ...placed, rows };
}

function shapeFromDraft(draft: Draft): Step {
	if (draft.spread) {
		return {
			id: "draft",
			kind: "pivot",
			index: [...draft.rows],
			columns: draft.spread,
			values: draft.values.map((value) => ({ ...value })),
		};
	}
	if (draft.values.length) {
		const taken = new Set(draft.rows);
		const aggs = draft.values.map((value) => {
			let as = taken.has(value.column) ? `${value.fn}_${value.column}` : value.column;
			let n = 2;
			while (taken.has(as)) {
				as = `${value.fn}_${value.column}_${n}`;
				n += 1;
			}
			taken.add(as);
			return { column: value.column, fn: value.fn, as };
		});
		return { id: "draft", kind: "groupby", by: [...draft.rows], aggs };
	}
	return { id: "draft", kind: "keep", columns: [...draft.rows] };
}

function describeDraft(draft: Draft): string {
	if (draft.spread) {
		const measures = draft.values.length
			? draft.values.map((value) => `${value.fn} of ${value.column}`).join(", ")
			: "no value yet";
		const keys = draft.rows.length ? draft.rows.join(", ") : "no row keys";
		return `Spread ${draft.spread} into headers. Rows: ${keys}. Cells: ${measures}.`;
	}
	if (draft.values.length) {
		const measures = draft.values.map((value) => `${value.fn} of ${value.column}`).join(", ");
		const keys = draft.rows.length ? draft.rows.join(", ") : "the whole table";
		return `Group by ${keys}. ${measures}.`;
	}
	if (draft.aside.length) {
		return `Keep ${draft.rows.join(", ") || "nothing"}. Leave out ${draft.aside.join(", ")}.`;
	}
	return `Column order: ${draft.rows.join(", ")}.`;
}

function formatCell(value: Cell | undefined): string {
	if (value == null) return "—";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return "—";
		return value.toLocaleString("en-AU", { maximumFractionDigits: 2 });
	}
	return value;
}

function firstCell(frame: Frame, column: string): string {
	const cell = frame.rows.find((row) => row[column] != null)?.[column];
	return cell == null ? "" : String(cell);
}

function Tool({
	label,
	disabled,
	onClick,
	title,
}: {
	label: string;
	disabled?: boolean;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	title?: string;
}) {
	return (
		<button
			type="button"
			title={title}
			disabled={disabled}
			onClick={onClick}
			className="rounded-full px-3 py-1.5 text-sm text-[#f4efe8]/85 hover:bg-white/10 disabled:opacity-30"
		>
			{label}
		</button>
	);
}

export default function Wrangler() {
	const [source, setSource] = useState<Frame>(samples[0].frame);
	const [sourceLabel, setSourceLabel] = useState(samples[0].id);
	const [steps, setSteps] = useState<Step[]>([]);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [selected, setSelected] = useState<string[]>([]);
	const [anchor, setAnchor] = useState<string | null>(null);
	const [panel, setPanel] = useState<Panel>(null);
	const [sep, setSep] = useState(", ");
	const [cmp, setCmp] = useState<Cmp>("eq");
	const [filterValue, setFilterValue] = useState("");
	const [renameTo, setRenameTo] = useState("");
	const [calcName, setCalcName] = useState("calc");
	const [calcExpr, setCalcExpr] = useState("");
	const [uniteName, setUniteName] = useState("combined");
	const [csv, setCsv] = useState("");
	const [csvError, setCsvError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const stages = useMemo(() => run(source, steps), [source, steps]);
	const committed = stages.at(-1)?.frame ?? source;
	const active = draft ?? identityDraft(committed);
	const dirty = draft != null && draftDirty(active, committed);
	const draftStep = dirty ? shapeFromDraft(active) : null;
	const preview = draftStep ? run(committed, [draftStep])[0] : null;
	const previewError = preview?.error ?? null;
	const shown = preview && !preview.error ? preview.frame : committed;
	const failure = stages.find((stage) => stage.error)?.error ?? null;
	const blocked = failure != null;
	const frames = [source, ...stages.map((stage) => stage.frame)];
	const codeSteps = draftStep && preview && !preview.error ? [...steps, draftStep] : steps;
	const codeInputs =
		draftStep && preview && !preview.error
			? [...frames.slice(0, steps.length), committed]
			: frames.slice(0, steps.length);
	const code = toPandas(codeSteps, codeInputs);
	const prior = shown === committed && steps.length ? frames[steps.length - 1] : committed;

	function loadSource(frame: Frame, label: string) {
		setSource(frame);
		setSourceLabel(label);
		setSteps([]);
		setDraft(null);
		setSelected([]);
		setPanel(null);
		setCsvError(null);
	}

	function append(step: Step) {
		if (blocked) return;
		setSteps((prev) => [...prev, step]);
		setDraft(null);
		setSelected([]);
		setPanel(null);
	}

	function truncate(count: number) {
		setSteps((prev) => prev.slice(0, count));
		setDraft(null);
		setSelected([]);
		setPanel(null);
	}

	function choose(column: string, shift: boolean) {
		if (shift && anchor) {
			const order = committed.columns;
			const start = order.indexOf(anchor);
			const end = order.indexOf(column);
			if (start >= 0 && end >= 0) {
				const [from, to] = start < end ? [start, end] : [end, start];
				setSelected(order.slice(from, to + 1));
				return;
			}
		}
		setAnchor(column);
		setSelected((current) =>
			current.includes(column) ? current.filter((name) => name !== column) : [...current, column],
		);
	}

	function moveColumns(columns: string[], role: Role) {
		if (!columns.length || blocked) return;
		setDraft(place(draft ?? identityDraft(committed), columns, role, committed));
		setSelected([]);
	}

	function dragged(column: string): string[] {
		return selected.includes(column) && selected.length > 1 ? selected : [column];
	}

	const one = selected.length === 1 ? selected[0] : null;

	return (
		<div className="mx-auto max-w-6xl px-6 pb-16">
			<div className="rounded-3xl bg-[#191b1a] p-4 text-[#f4efe8] sm:p-5">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<p className="font-space-grotesk text-lg text-[#fecef5]">Structure</p>
						<p className="mt-1 max-w-xl text-sm leading-6 text-[#f4efe8]/60">
							Move any columns between row keys, headers, and values. Keep the shape, then do it
							again to the table you just made.
						</p>
					</div>
					<p className="text-sm text-[#f4efe8]/70 tabular-nums">
						{shown.rows.length} rows · {shown.columns.length} columns
						{dirty ? " · preview" : ""}
					</p>
				</div>

				<div className="mt-4 flex flex-wrap items-center gap-1.5">
					<span className="mr-1 text-xs text-[#f4efe8]/45">Start from</span>
					{samples.map((sample) => (
						<button
							key={sample.id}
							type="button"
							aria-pressed={sourceLabel === sample.id && steps.length === 0}
							className={`rounded-full px-2.5 py-1 text-xs ${
								sourceLabel === sample.id
									? "bg-[#fecef5] text-[#191b1a]"
									: "text-[#f4efe8]/80 hover:underline"
							}`}
							onClick={() => loadSource(sample.frame, sample.id)}
						>
							{sample.label}
						</button>
					))}
					<button
						type="button"
						className="rounded-full px-2.5 py-1 text-xs text-[#f4efe8]/80 hover:underline"
						onClick={() => setPanel(panel === "paste" ? null : "paste")}
					>
						Paste CSV
					</button>
					{steps.length ? (
						<button
							type="button"
							className="rounded-full px-2.5 py-1 text-xs text-[#f4efe8]/80 hover:underline"
							onClick={() => truncate(steps.length - 1)}
						>
							Undo
						</button>
					) : null}
				</div>

				{panel === "paste" ? (
					<div className="mt-3 rounded-2xl bg-[#101211] p-3">
						<textarea
							aria-label="CSV"
							className={`${control} h-28 w-full font-mono`}
							placeholder={"city,item,qty\nLisbon,Tulip,4"}
							value={csv}
							onChange={(event) => setCsv(event.target.value)}
						/>
						<div className="mt-2 flex items-center gap-3">
							<button
								type="button"
								className="rounded-full bg-[#fecef5] px-3 py-1.5 text-sm text-[#191b1a]"
								onClick={() => {
									try {
										loadSource(parseCsv(csv), "pasted");
										setPanel(null);
									} catch (error) {
										setCsvError(error instanceof Error ? error.message : "Could not read that CSV");
									}
								}}
							>
								Use this table
							</button>
							{csvError ? <p className="text-xs text-red-300">{csvError}</p> : null}
						</div>
					</div>
				) : null}

				<div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
					<Well
						label="Row keys"
						hint="Stay as rows"
						onDrop={(column) => moveColumns(dragged(column), "rows")}
					>
						{active.rows.map((column) => (
							<Chip
								key={column}
								column={column}
								selected={selected.includes(column)}
								onSelect={choose}
								onDrop={(name) =>
									setDraft(
										insertRows(draft ?? identityDraft(committed), dragged(name), column, committed),
									)
								}
							/>
						))}
					</Well>
					<Well
						label="Spread"
						hint="Values become headers"
						onDrop={(column) => moveColumns(dragged(column), "spread")}
					>
						{active.spread ? (
							<Chip
								column={active.spread}
								selected={selected.includes(active.spread)}
								onSelect={choose}
								onDrop={(name) => moveColumns(dragged(name), "spread")}
							/>
						) : (
							<Placeholder>One column</Placeholder>
						)}
					</Well>
					<Well
						label="Values"
						hint="Fill the cells"
						onDrop={(column) => moveColumns(dragged(column), "values")}
					>
						{active.values.length ? (
							active.values.map((value) => (
								<span key={value.column} className="inline-flex items-center gap-1">
									<Chip
										column={value.column}
										selected={selected.includes(value.column)}
										onSelect={choose}
										onDrop={(name) => moveColumns(dragged(name), "values")}
									/>
									<select
										aria-label={`${value.column} aggregation`}
										className="rounded-lg bg-[#191b1a] px-1.5 py-1 text-xs text-[#f4efe8] ring-1 ring-white/10 outline-none"
										value={value.fn}
										onChange={(event) =>
											setDraft({
												...active,
												values: active.values.map((item) =>
													item.column === value.column
														? { ...item, fn: event.target.value as AggFn }
														: item,
												),
											})
										}
									>
										{AGGS.map((fn) => (
											<option key={fn} value={fn}>
												{fn}
											</option>
										))}
									</select>
								</span>
							))
						) : (
							<Placeholder>Measures</Placeholder>
						)}
					</Well>
				</div>

				<Well
					label="Leave out"
					hint="Dropped from this shape"
					onDrop={(column) => moveColumns(dragged(column), "aside")}
					className="mt-2"
				>
					{active.aside.length ? (
						active.aside.map((column) => (
							<Chip
								key={column}
								column={column}
								selected={selected.includes(column)}
								onSelect={choose}
								onDrop={(name) => moveColumns(dragged(name), "aside")}
							/>
						))
					) : (
						<Placeholder>Nothing</Placeholder>
					)}
				</Well>

				{dirty ? (
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<p className="text-xs leading-5 text-[#fecef5]">{describeDraft(active)}</p>
						<button
							type="button"
							className="rounded-full bg-[#fecef5] px-3 py-1.5 text-sm text-[#191b1a] disabled:opacity-30"
							disabled={blocked || previewError != null}
							onClick={() => {
								if (!draftStep || previewError) return;
								append({ ...draftStep, id: uid() });
							}}
						>
							Keep this shape
						</button>
						<button
							type="button"
							className="rounded-full px-3 py-1.5 text-sm text-[#f4efe8]/70 hover:underline"
							onClick={() => setDraft(null)}
						>
							Clear
						</button>
					</div>
				) : (
					<p className="mt-3 text-xs leading-5 text-[#f4efe8]/45">
						Select columns, or drag them. Spread turns one column into headers. Values collapse the
						rows. Leave out drops a column. Then keep the shape.
					</p>
				)}
				{previewError ? <p className="mt-2 text-xs text-red-300">{previewError}</p> : null}
				{failure ? <p className="mt-2 text-xs text-red-300">{failure}</p> : null}

				<div className="mt-3 flex flex-wrap gap-1">
					<Tool
						label="Row key"
						disabled={!selected.length || blocked}
						onClick={() => moveColumns(selected, "rows")}
					/>
					<Tool
						label="Spread"
						disabled={selected.length !== 1 || blocked}
						onClick={() => moveColumns(selected.slice(0, 1), "spread")}
					/>
					<Tool
						label="Value"
						disabled={!selected.length || blocked}
						onClick={() => moveColumns(selected, "values")}
					/>
					<Tool
						label="Leave out"
						disabled={!selected.length || blocked}
						onClick={() => moveColumns(selected, "aside")}
					/>
					<span className="mx-1 hidden w-px bg-white/10 sm:inline" />
					<Tool
						label="Gather"
						title="Turn the selected columns into rows"
						disabled={!selected.length || blocked}
						onClick={() =>
							append({
								id: uid(),
								kind: "melt",
								ids: committed.columns.filter((column) => !selected.includes(column)),
								values: selected,
								varName: "name",
								valueName: "value",
							})
						}
					/>
					<Tool
						label="Split"
						disabled={!one || blocked}
						onClick={() => {
							if (!one) return;
							setSep(detectSeparator(committed, one));
							setPanel("split");
						}}
					/>
					<Tool
						label="Unite"
						disabled={selected.length < 2 || blocked}
						onClick={() => {
							setSep(" ");
							setUniteName("combined");
							setPanel("unite");
						}}
					/>
					<Tool
						label="Transpose"
						disabled={committed.columns.length < 2 || blocked}
						onClick={() =>
							append({
								id: uid(),
								kind: "transpose",
								index: one ?? committed.columns[0],
								name: "field",
							})
						}
					/>
					<Tool
						label="Drop"
						disabled={!selected.length || selected.length === committed.columns.length || blocked}
						onClick={() => append({ id: uid(), kind: "drop", columns: selected })}
					/>
					<span className="mx-1 hidden w-px bg-white/10 sm:inline" />
					<Tool
						label="Sort"
						title="Sort ascending. Shift-click for descending."
						disabled={!one || blocked}
						onClick={(event) => {
							if (!one) return;
							const dir: "asc" | "desc" = event.shiftKey ? "desc" : "asc";
							append({ id: uid(), kind: "sort", column: one, dir });
						}}
					/>
					<Tool
						label="Filter"
						disabled={!one || blocked}
						onClick={() => {
							if (!one) return;
							setCmp("eq");
							setFilterValue(firstCell(committed, one));
							setPanel("filter");
						}}
					/>
					<Tool
						label="Rename"
						disabled={!one || blocked}
						onClick={() => {
							if (!one) return;
							setRenameTo(one);
							setPanel("rename");
						}}
					/>
					<Tool
						label="Number"
						disabled={!one || blocked}
						onClick={() => {
							if (!one) return;
							append({ id: uid(), kind: "cast", column: one, to: "number" });
						}}
					/>
					<Tool
						label="Text"
						disabled={!one || blocked}
						onClick={() => {
							if (!one) return;
							append({ id: uid(), kind: "cast", column: one, to: "text" });
						}}
					/>
					<Tool
						label="Calculate"
						disabled={blocked}
						onClick={() => {
							setCalcName("calc");
							setCalcExpr("");
							setPanel("calc");
						}}
					/>
				</div>

				{panel === "split" && one ? (
					<Bar>
						<span>Split {one} on</span>
						<input
							aria-label="Separator"
							className={`${control} w-20 font-mono`}
							value={sep}
							onChange={(event) => setSep(event.target.value)}
						/>
						<button
							type="button"
							className="rounded-full bg-[#fecef5] px-3 py-1.5 text-sm text-[#191b1a]"
							onClick={() =>
								append({
									id: uid(),
									kind: "split",
									column: one,
									sep,
									into: suggestSplitNames(committed, one, sep),
								})
							}
						>
							Into columns
						</button>
						<button
							type="button"
							className="rounded-full px-3 py-1.5 text-sm text-[#f4efe8]/80 ring-1 ring-white/15"
							onClick={() => append({ id: uid(), kind: "explode", column: one, sep })}
						>
							Into rows
						</button>
					</Bar>
				) : null}
				{panel === "unite" && selected.length > 1 ? (
					<Bar>
						<span>Unite {selected.join(" and ")} with</span>
						<input
							aria-label="Separator"
							className={`${control} w-20 font-mono`}
							value={sep}
							onChange={(event) => setSep(event.target.value)}
						/>
						<span>as</span>
						<input
							aria-label="New column"
							className={`${control} w-32`}
							value={uniteName}
							onChange={(event) => setUniteName(event.target.value)}
						/>
						<button
							type="button"
							className="rounded-full bg-[#fecef5] px-3 py-1.5 text-sm text-[#191b1a]"
							onClick={() =>
								append({ id: uid(), kind: "unite", columns: selected, into: uniteName, sep })
							}
						>
							Unite
						</button>
					</Bar>
				) : null}
				{panel === "filter" && one ? (
					<Bar>
						<span>Keep rows where {one}</span>
						<select
							aria-label="Comparison"
							className={control}
							value={cmp}
							onChange={(event) => setCmp(event.target.value as Cmp)}
						>
							{CMPS.map((item) => (
								<option key={item.id} value={item.id}>
									{item.label}
								</option>
							))}
						</select>
						<input
							aria-label="Filter value"
							className={`${control} w-32`}
							value={filterValue}
							onChange={(event) => setFilterValue(event.target.value)}
						/>
						<button
							type="button"
							className="rounded-full bg-[#fecef5] px-3 py-1.5 text-sm text-[#191b1a]"
							onClick={() =>
								append({ id: uid(), kind: "filter", column: one, cmp, value: filterValue })
							}
						>
							Filter
						</button>
					</Bar>
				) : null}
				{panel === "rename" && one ? (
					<Bar>
						<span>Rename {one} to</span>
						<input
							aria-label="New name"
							className={`${control} w-36`}
							value={renameTo}
							onChange={(event) => setRenameTo(event.target.value)}
						/>
						<button
							type="button"
							className="rounded-full bg-[#fecef5] px-3 py-1.5 text-sm text-[#191b1a]"
							onClick={() => append({ id: uid(), kind: "rename", from: one, to: renameTo })}
						>
							Rename
						</button>
					</Bar>
				) : null}
				{panel === "calc" ? (
					<Bar>
						<span>Add</span>
						<input
							aria-label="New column"
							className={`${control} w-28`}
							value={calcName}
							onChange={(event) => setCalcName(event.target.value)}
						/>
						<span>=</span>
						<input
							aria-label="Expression"
							className={`${control} w-52 font-mono`}
							spellCheck={false}
							placeholder="qty * price"
							value={calcExpr}
							onChange={(event) => setCalcExpr(event.target.value)}
						/>
						<button
							type="button"
							className="rounded-full bg-[#fecef5] px-3 py-1.5 text-sm text-[#191b1a]"
							onClick={() => append({ id: uid(), kind: "derive", name: calcName, expr: calcExpr })}
						>
							Add column
						</button>
					</Bar>
				) : null}

				<div className="mt-4 flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1">
					<button
						type="button"
						className={pill(steps.length === 0 && !dirty)}
						onClick={() => truncate(0)}
					>
						data · {shapeOf(source)}
					</button>
					{steps.map((step, index) => {
						const stage = stages[index];
						return (
							<div key={step.id} className="flex shrink-0 items-center gap-1.5">
								<span aria-hidden="true" className="text-sm text-[#f4efe8]/30">
									→
								</span>
								<button
									type="button"
									title="Drop the shapes after this one"
									className={pill(
										index === steps.length - 1 && !dirty,
										stage.error ? "error" : undefined,
									)}
									onClick={() => truncate(index + 1)}
								>
									{index + 1} {summary(step)} · {shapeOf(stage.frame)}
									{stage.error ? " · failed" : ""}
								</button>
							</div>
						);
					})}
				</div>

				<div className="mt-3 max-h-[28rem] min-w-0 overflow-auto rounded-2xl ring-1 ring-white/10">
					<table className="w-full border-collapse text-sm">
						<caption className="sr-only">
							{shown.rows.length} rows and {shown.columns.length} columns
						</caption>
						<thead>
							<tr className="border-b border-white/15">
								{shown.columns.map((column) => {
									const numeric = isNumericColumn(shown, column);
									const fresh = !prior.columns.includes(column);
									const on = selected.includes(column);
									return (
										<th
											key={column}
											className={`sticky top-0 bg-[#191b1a] px-3 py-2 font-normal whitespace-nowrap ${
												numeric ? "text-right" : "text-left"
											}`}
										>
											<button
												type="button"
												className={numeric ? "ml-auto block text-right" : "block text-left"}
												disabled={!committed.columns.includes(column)}
												title={
													committed.columns.includes(column)
														? undefined
														: "Keep this shape before moving the new columns"
												}
												onClick={(event) => choose(column, event.shiftKey)}
											>
												<span
													className={`flex items-center gap-1.5 text-sm ${numeric ? "justify-end" : ""} ${
														on ? "text-[#fecef5]" : ""
													}`}
												>
													{fresh ? (
														<span className="inline-block h-1.5 w-1.5 rounded-full bg-[#fecef5]" />
													) : null}
													{column}
												</span>
												<span className="mt-0.5 block text-[10px] tracking-wide text-[#f4efe8]/40 uppercase">
													{numeric ? "number" : "text"}
												</span>
											</button>
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody>
							{shown.rows.slice(0, 80).map((row, index) => (
								<tr key={index} className="border-b border-white/10 last:border-0">
									{shown.columns.map((column) => {
										const value = row[column];
										const numeric = typeof value === "number";
										return (
											<td
												key={column}
												className={`px-3 py-1.5 whitespace-nowrap tabular-nums ${
													numeric ? "text-right" : "text-left"
												} ${value == null ? "text-[#f4efe8]/30" : ""}`}
											>
												{formatCell(value)}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
					{shown.rows.length === 0 ? (
						<p className="px-3 py-6 text-sm text-[#f4efe8]/50">No rows.</p>
					) : null}
				</div>
				{shown.rows.length > 80 ? (
					<p className="mt-2 text-xs text-[#f4efe8]/45">Showing 80 of {shown.rows.length} rows.</p>
				) : null}

				<div className="mt-4 min-w-0 rounded-2xl bg-[#101211] p-4">
					<div className="mb-2 flex items-center justify-between gap-3">
						<p className="font-space-grotesk text-sm text-[#fecef5]">pandas</p>
						<button
							type="button"
							className="text-xs text-[#f4efe8]/70 hover:underline"
							onClick={() => {
								navigator.clipboard.writeText(code).then(
									() => {
										setCopied(true);
										window.setTimeout(() => setCopied(false), 1200);
									},
									() => setCopied(false),
								);
							}}
						>
							{copied ? "Copied" : "Copy"}
						</button>
					</div>
					<pre className="m-0 max-w-full overflow-x-auto font-mono text-xs leading-6 text-[#fecef5]">
						{code}
					</pre>
					<p className="mt-2 text-[11px] text-[#f4efe8]/40">
						{dirty && !previewError
							? "Includes the shape that isn't kept yet."
							: "The shapes kept so far."}
					</p>
				</div>
			</div>
		</div>
	);
}

function pill(active: boolean, problem?: "error") {
	if (active) return "shrink-0 rounded-full bg-[#fecef5] px-3 py-1.5 text-sm text-[#191b1a]";
	if (problem === "error")
		return "shrink-0 rounded-full bg-red-400/15 px-3 py-1.5 text-sm text-red-200";
	return "shrink-0 rounded-full px-3 py-1.5 text-sm text-[#f4efe8]/75 hover:bg-white/10";
}

function Placeholder({ children }: { children: string }) {
	return <span className="px-1 py-1 text-xs text-[#f4efe8]/30">{children}</span>;
}

function Well({
	label,
	hint,
	onDrop,
	className,
	children,
}: {
	label: string;
	hint: string;
	onDrop: (column: string) => void;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={`min-h-16 rounded-2xl bg-[#101211] p-2 ${className ?? ""}`}
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault();
				const column = event.dataTransfer.getData("text/plain");
				if (column) onDrop(column);
			}}
		>
			<p className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
				<span className="text-[10px] tracking-wide text-[#f4efe8]/45 uppercase">{label}</span>
				<span className="text-[10px] text-[#f4efe8]/30">{hint}</span>
			</p>
			<div className="flex flex-wrap items-center gap-1.5">{children}</div>
		</div>
	);
}

function Chip({
	column,
	selected,
	onSelect,
	onDrop,
}: {
	column: string;
	selected: boolean;
	onSelect: (column: string, shift: boolean) => void;
	onDrop: (column: string) => void;
}) {
	return (
		<button
			type="button"
			draggable
			onDragStart={(event) => {
				event.dataTransfer.setData("text/plain", column);
				event.dataTransfer.effectAllowed = "move";
			}}
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault();
				event.stopPropagation();
				const name = event.dataTransfer.getData("text/plain");
				if (name) onDrop(name);
			}}
			onClick={(event) => onSelect(column, event.shiftKey)}
			className={`cursor-grab rounded-full px-2.5 py-1 text-sm active:cursor-grabbing ${
				selected ? "bg-[#fecef5] text-[#191b1a]" : "bg-white/10 text-[#f4efe8] hover:bg-white/15"
			}`}
		>
			{column}
		</button>
	);
}

function Bar({ children }: { children: ReactNode }) {
	return (
		<div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[#101211] px-3 py-2 text-sm">
			{children}
		</div>
	);
}
