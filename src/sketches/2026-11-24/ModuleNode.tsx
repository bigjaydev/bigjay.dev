import { memo, useCallback } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
	MODULES,
	formatKnob,
	powerLabel,
	powerOptions,
	type KnobDef,
	type ModulePower,
	type ModuleType,
} from "./modules";
import Keybed from "./Keybed";
import PianoRoll from "./PianoRoll";

export type SynthNodeData = {
	moduleType: ModuleType;
	params: Record<string, number>;
	power: ModulePower;
	onParamChange: (nodeId: string, key: string, value: number) => void;
	onPowerChange: (nodeId: string, power: ModulePower) => void;
	onNote: (nodeId: string, freq: number | null) => void;
	onTrigger: (nodeId: string) => void;
};

export type SynthNode = Node<SynthNodeData, "module">;

function ParamControl({
	knob,
	moduleType,
	value,
	onChange,
}: {
	knob: KnobDef;
	moduleType: ModuleType;
	value: number;
	onChange: (value: number) => void;
}) {
	if (knob.options) {
		return (
			<div className="synth-knob synth-knob--choice nodrag nopan">
				<span className="synth-knob__label">{knob.label}</span>
				<div className="synth-choice" role="group" aria-label={knob.label}>
					{knob.options.map((label, index) => {
						const optionValue = knob.min + index * knob.step;
						return (
							<button
								key={label}
								type="button"
								className={Math.round(value) === optionValue ? "is-active" : undefined}
								onClick={() => onChange(optionValue)}
							>
								{label}
							</button>
						);
					})}
				</div>
			</div>
		);
	}

	return (
		<label className="synth-knob nodrag nopan">
			<span className="synth-knob__label">{knob.label}</span>
			<input
				type="range"
				min={knob.min}
				max={knob.max}
				step={knob.step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				onPointerDown={(e) => e.stopPropagation()}
			/>
			<span className="synth-knob__value">{formatKnob(moduleType, knob.id, value)}</span>
		</label>
	);
}

function ModuleNodeComponent({ id, data }: NodeProps<SynthNode>) {
	const def = MODULES[data.moduleType];
	const options = powerOptions(data.moduleType);

	const setParam = useCallback(
		(key: string, value: number) => data.onParamChange(id, key, value),
		[data, id],
	);

	return (
		<div
			className={`synth-module${data.power === "on" ? "" : " is-bypassed"}`}
			style={{
				width: def.width,
				background: `linear-gradient(165deg, ${def.tint} 0%, #1c1c1a 110%)`,
			}}
		>
			<header className="synth-module__head">
				<span className={`synth-module__led${data.power === "on" ? "" : " is-off"}`} />
				<span className="synth-module__title">{def.label}</span>
				<div className="synth-power-switch nodrag nopan" role="group" aria-label="Module power">
					{options.map((option) => (
						<button
							key={option}
							type="button"
							className={data.power === option ? `is-active is-${option}` : undefined}
							title={
								option === "on"
									? "Process"
									: option === "thru"
										? "Passthrough"
										: "Mute this branch"
							}
							onClick={() => data.onPowerChange(id, option)}
						>
							{powerLabel(option)}
						</button>
					))}
				</div>
			</header>

			<div className="synth-module__ports synth-module__ports--in">
				{def.inputs.map((port) => (
					<div key={port.id} className="synth-port">
						<Handle
							type="target"
							position={Position.Left}
							id={port.id}
							className={`synth-jack synth-jack--${port.kind}`}
							title={`${port.label} (${port.kind})`}
						/>
						<span>{port.label}</span>
					</div>
				))}
			</div>

			<div className="synth-module__knobs">
				{def.knobs.map((knob) => (
					<ParamControl
						key={knob.id}
						knob={knob}
						moduleType={data.moduleType}
						value={data.params[knob.id] ?? knob.default}
						onChange={(value) => setParam(knob.id, value)}
					/>
				))}
			</div>

			{data.moduleType === "keyboard" && (
				<Keybed
					octave={Math.round(data.params.octave ?? 3)}
					onNote={(freq) => data.onNote(id, freq)}
				/>
			)}

			{data.moduleType === "pianoroll" && (
				<PianoRoll onNote={(freq) => data.onNote(id, freq)} />
			)}

			{data.moduleType === "envelope" && (
				<button
					type="button"
					className="synth-trigger nodrag nopan"
					onPointerDown={(e) => {
						e.stopPropagation();
						data.onTrigger(id);
					}}
				>
					TRIG
				</button>
			)}

			<div className="synth-module__ports synth-module__ports--out">
				{def.outputs.map((port) => (
					<div key={port.id} className="synth-port synth-port--out">
						<span>{port.label}</span>
						<Handle
							type="source"
							position={Position.Right}
							id={port.id}
							className={`synth-jack synth-jack--${port.kind}`}
							title={`${port.label} (${port.kind})`}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

export default memo(ModuleNodeComponent);
