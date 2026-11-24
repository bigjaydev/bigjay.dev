import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ReactFlow,
	Background,
	Controls,
	MiniMap,
	addEdge,
	useNodesState,
	useEdgesState,
	BackgroundVariant,
	type Connection,
	type Edge,
	type OnConnect,
	type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./synth.css";
import ModuleNode, { type SynthNode, type SynthNodeData } from "./ModuleNode";
import AddMenu from "./AddMenu";
import { AudioEngine } from "./audio";
import {
	MODULES,
	defaultParams,
	type ModulePower,
	type ModuleType,
} from "./modules";

const EDGE_COLORS: Record<string, string> = {
	audio: "#c9a227",
	cv: "#4aa3a0",
};

function portKind(moduleType: ModuleType, portId: string, side: "in" | "out") {
	const def = MODULES[moduleType];
	const ports = side === "in" ? def.inputs : def.outputs;
	return ports.find((p) => p.id === portId)?.kind ?? "audio";
}

type NodeHandlers = Pick<
	SynthNodeData,
	"onParamChange" | "onPowerChange" | "onNote" | "onTrigger"
>;

function makeNode(
	id: string,
	type: ModuleType,
	position: { x: number; y: number },
	handlers: NodeHandlers,
	params?: Record<string, number>,
): SynthNode {
	return {
		id,
		type: "module",
		position,
		deletable: type !== "output",
		data: {
			moduleType: type,
			params: params ?? defaultParams(type),
			power: "on" satisfies ModulePower,
			...handlers,
		},
	};
}

function initialGraph(handlers: NodeHandlers): { nodes: SynthNode[]; edges: Edge[] } {
	const nodes: SynthNode[] = [
		makeNode("roll1", "pianoroll", { x: 20, y: 20 }, handlers),
		makeNode("vco1", "vco", { x: 500, y: 40 }, handlers, {
			...defaultParams("vco"),
			freq: 0,
			wave: 2,
		}),
		makeNode("lfo1", "lfo", { x: 500, y: 320 }, handlers, {
			...defaultParams("lfo"),
			rate: 0.35,
			depth: 0.55,
		}),
		makeNode("vcf1", "vcf", { x: 720, y: 60 }, handlers, {
			...defaultParams("vcf"),
			cutoff: 1400,
			q: 5,
		}),
		makeNode("vca1", "vca", { x: 940, y: 80 }, handlers, {
			...defaultParams("vca"),
			gain: 0,
			bias: 0,
		}),
		makeNode("delay1", "delay", { x: 1140, y: 90 }, handlers),
		makeNode("out1", "output", { x: 1360, y: 120 }, handlers),
	];

	const edges: Edge[] = [
		{
			id: "e-roll-vco",
			source: "roll1",
			sourceHandle: "cv",
			target: "vco1",
			targetHandle: "fm",
			style: { stroke: EDGE_COLORS.cv },
		},
		{
			id: "e-roll-vca",
			source: "roll1",
			sourceHandle: "gate",
			target: "vca1",
			targetHandle: "cv",
			style: { stroke: EDGE_COLORS.cv },
		},
		{
			id: "e-vco-vcf",
			source: "vco1",
			sourceHandle: "out",
			target: "vcf1",
			targetHandle: "in",
			style: { stroke: EDGE_COLORS.audio },
		},
		{
			id: "e-lfo-vcf",
			source: "lfo1",
			sourceHandle: "out",
			target: "vcf1",
			targetHandle: "cutoff",
			style: { stroke: EDGE_COLORS.cv },
		},
		{
			id: "e-vcf-vca",
			source: "vcf1",
			sourceHandle: "out",
			target: "vca1",
			targetHandle: "in",
			style: { stroke: EDGE_COLORS.audio },
		},
		{
			id: "e-vca-delay",
			source: "vca1",
			sourceHandle: "out",
			target: "delay1",
			targetHandle: "in",
			style: { stroke: EDGE_COLORS.audio },
		},
		{
			id: "e-delay-out",
			source: "delay1",
			sourceHandle: "out",
			target: "out1",
			targetHandle: "in",
			style: { stroke: EDGE_COLORS.audio },
		},
	];

	return { nodes, edges };
}

let nextId = 1;

export default function Synth() {
	const engineRef = useRef(new AudioEngine());
	const [armed, setArmed] = useState(false);
	const handlersRef = useRef<NodeHandlers>({
		onParamChange: () => {},
		onPowerChange: () => {},
		onNote: () => {},
		onTrigger: () => {},
	});

	const seed = useMemo(
		() =>
			initialGraph({
				onParamChange: (id, key, value) => handlersRef.current.onParamChange(id, key, value),
				onPowerChange: (id, power) => handlersRef.current.onPowerChange(id, power),
				onNote: (id, freq) => handlersRef.current.onNote(id, freq),
				onTrigger: (id) => handlersRef.current.onTrigger(id),
			}),
		[],
	);

	const [nodes, setNodes, onNodesChange] = useNodesState(seed.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(seed.edges);
	const nodeTypes: NodeTypes = useMemo(() => ({ module: ModuleNode }), []);

	const onParamChange = useCallback((nodeId: string, key: string, value: number) => {
		engineRef.current.setParam(nodeId, key, value);
		setNodes((prev) =>
			prev.map((n) =>
				n.id === nodeId
					? { ...n, data: { ...n.data, params: { ...n.data.params, [key]: value } } }
					: n,
			),
		);
	}, [setNodes]);

	const onPowerChange = useCallback((nodeId: string, power: ModulePower) => {
		engineRef.current.setPower(nodeId, power);
		setNodes((prev) =>
			prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, power } } : n)),
		);
	}, [setNodes]);

	const onNote = useCallback((nodeId: string, freq: number | null) => {
		const engine = engineRef.current;
		if (freq == null) engine.noteOff(nodeId);
		else engine.noteOn(nodeId, freq);
	}, []);

	const onTrigger = useCallback((nodeId: string) => {
		engineRef.current.trigger(nodeId);
	}, []);

	handlersRef.current = { onParamChange, onPowerChange, onNote, onTrigger };

	useEffect(() => {
		if (!armed) return;
		engineRef.current.sync(
			nodes.map((n) => ({
				id: n.id,
				type: n.data.moduleType,
				params: n.data.params,
				power: n.data.power,
			})),
			edges.map((e) => ({
				fromId: e.source,
				fromPort: e.sourceHandle ?? "out",
				toId: e.target,
				toPort: e.targetHandle ?? "in",
			})),
		);
	}, [nodes, edges, armed]);

	const onConnect: OnConnect = useCallback(
		(connection: Connection) => {
			const source = nodes.find((n) => n.id === connection.source);
			if (!source || !connection.sourceHandle) return;
			const kind = portKind(source.data.moduleType, connection.sourceHandle, "out");
			setEdges((eds) =>
				addEdge(
					{
						...connection,
						style: { stroke: EDGE_COLORS[kind] },
					},
					eds,
				),
			);
		},
		[nodes, setEdges],
	);

	const togglePower = useCallback(async () => {
		const engine = engineRef.current;
		if (armed) {
			await engine.suspend();
			setArmed(false);
			return;
		}
		await engine.resume();
		engine.sync(
			nodes.map((n) => ({
				id: n.id,
				type: n.data.moduleType,
				params: n.data.params,
				power: n.data.power,
			})),
			edges.map((e) => ({
				fromId: e.source,
				fromPort: e.sourceHandle ?? "out",
				toId: e.target,
				toPort: e.targetHandle ?? "in",
			})),
		);
		setArmed(true);
	}, [armed, nodes, edges]);

	const addModule = useCallback(
		(type: ModuleType) => {
			const id = `${type}-${nextId++}`;
			const handlers: NodeHandlers = {
				onParamChange: (nid, key, value) => handlersRef.current.onParamChange(nid, key, value),
				onPowerChange: (nid, power) => handlersRef.current.onPowerChange(nid, power),
				onNote: (nid, freq) => handlersRef.current.onNote(nid, freq),
				onTrigger: (nid) => handlersRef.current.onTrigger(nid),
			};
			const node = makeNode(
				id,
				type,
				{ x: 120 + Math.random() * 280, y: 80 + Math.random() * 280 },
				handlers,
			);
			setNodes((ns) => [...ns, node]);
		},
		[setNodes],
	);

	return (
		<div className="synth-root">
			<div className="synth-toolbar">
				<button
					type="button"
					className={`synth-power${armed ? " is-on" : ""}`}
					onClick={() => void togglePower()}
				>
					<span className="synth-power__dot" />
					{armed ? "Power Off" : "Power On"}
				</button>
				<AddMenu onAdd={addModule} />
				<span className="synth-hint">power on · hit Play on the roll · gold = audio · teal = CV</span>
			</div>

			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{ padding: 0.2 }}
				proOptions={{ hideAttribution: true }}
				deleteKeyCode={["Backspace", "Delete"]}
				minZoom={0.4}
				maxZoom={1.6}
				defaultEdgeOptions={{ type: "default" }}
			>
				<Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2a2c26" />
				<Controls showInteractive={false} />
				<MiniMap
					pannable
					zoomable
					nodeColor={(n) => MODULES[(n.data as SynthNodeData).moduleType]?.tint ?? "#333"}
					maskColor="rgba(10,10,8,0.55)"
				/>
			</ReactFlow>
		</div>
	);
}
