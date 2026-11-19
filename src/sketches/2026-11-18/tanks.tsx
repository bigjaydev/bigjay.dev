import type { Chassis } from "./store";

const plate = "#e07a12";
const coal = "#16181e";
const glass = "#1b242c";
const cyan = "#3ee0ff";

function Paint({
	color,
	metal = 0.45,
	rough = 0.42,
	glow = 0,
}: {
	color: string;
	metal?: number;
	rough?: number;
	glow?: number;
}) {
	return (
		<meshStandardMaterial
			color={color}
			metalness={metal}
			roughness={rough}
			emissive={glow > 0 ? color : "#000"}
			emissiveIntensity={glow}
			toneMapped={glow <= 0}
		/>
	);
}

/** Orange and black wedge with a centreline cannon. */
export function Lance() {
	return (
		<group>
			<mesh castShadow position={[0, 0.22, 0.1]}>
				<boxGeometry args={[3.3, 0.28, 4.7]} />
				<Paint color={coal} metal={0.55} />
			</mesh>
			<mesh castShadow position={[0, 0.48, 0.15]}>
				<boxGeometry args={[3.6, 0.32, 4.5]} />
				<Paint color={plate} />
			</mesh>
			<mesh castShadow position={[0, 0.62, 1.7]} rotation={[-0.55, 0, 0]}>
				<boxGeometry args={[2.2, 0.22, 1.7]} />
				<Paint color={plate} />
			</mesh>
			<mesh castShadow position={[-1.55, 0.36, 0]}>
				<boxGeometry args={[0.45, 0.28, 3.6]} />
				<Paint color={coal} />
			</mesh>
			<mesh castShadow position={[1.55, 0.36, 0]}>
				<boxGeometry args={[0.45, 0.28, 3.6]} />
				<Paint color={coal} />
			</mesh>
			<mesh position={[0, 0.78, 0.35]}>
				<boxGeometry args={[0.85, 0.28, 1.15]} />
				<Paint color={glass} metal={0.7} rough={0.2} />
			</mesh>
			<mesh position={[-0.85, 0.42, -2.15]}>
				<boxGeometry args={[0.55, 0.12, 0.16]} />
				<Paint color="#ffb15a" glow={2.4} />
			</mesh>
			<mesh position={[0.85, 0.42, -2.15]}>
				<boxGeometry args={[0.55, 0.12, 0.16]} />
				<Paint color="#ffb15a" glow={2.4} />
			</mesh>
		</group>
	);
}

/** Long dark hull, orange spine, wing stabilizers with cyan tips. */
export function Sabre() {
	return (
		<group>
			<mesh castShadow position={[0, 0.38, 0]}>
				<boxGeometry args={[1.7, 0.42, 5.6]} />
				<Paint color="#23272e" metal={0.6} />
			</mesh>
			<mesh castShadow position={[0, 0.62, 0.2]}>
				<boxGeometry args={[0.55, 0.16, 4.4]} />
				<Paint color={plate} />
			</mesh>
			<mesh castShadow position={[-1.55, 0.46, -0.2]} rotation={[0, 0, 0.35]}>
				<boxGeometry args={[1.8, 0.08, 1.5]} />
				<Paint color="#2c3138" />
			</mesh>
			<mesh castShadow position={[1.55, 0.46, -0.2]} rotation={[0, 0, -0.35]}>
				<boxGeometry args={[1.8, 0.08, 1.5]} />
				<Paint color="#2c3138" />
			</mesh>
			<mesh position={[-2.3, 0.62, -0.2]}>
				<boxGeometry args={[0.28, 0.12, 0.7]} />
				<Paint color={cyan} glow={2.6} />
			</mesh>
			<mesh position={[2.3, 0.62, -0.2]}>
				<boxGeometry args={[0.28, 0.12, 0.7]} />
				<Paint color={cyan} glow={2.6} />
			</mesh>
			<mesh position={[0, 0.7, 0.85]}>
				<boxGeometry args={[0.7, 0.22, 0.9]} />
				<Paint color={glass} metal={0.75} rough={0.18} />
			</mesh>
			<mesh position={[0, 0.48, -2.7]}>
				<boxGeometry args={[0.7, 0.12, 0.16]} />
				<Paint color={cyan} glow={2.2} />
			</mesh>
		</group>
	);
}

/** Broad orange deck with a roof turret. */
export function Anvil() {
	return (
		<group>
			<mesh castShadow position={[0, 0.28, 0]}>
				<boxGeometry args={[4.4, 0.36, 4.2]} />
				<Paint color={coal} metal={0.5} />
			</mesh>
			<mesh castShadow position={[0, 0.52, 0.1]}>
				<boxGeometry args={[3.2, 0.28, 3.6]} />
				<Paint color={plate} />
			</mesh>
			<mesh castShadow position={[0, 0.95, -0.15]}>
				<boxGeometry args={[1.7, 0.4, 1.8]} />
				<Paint color="#2a241c" metal={0.5} />
			</mesh>
			<mesh position={[0, 1.2, -0.15]}>
				<boxGeometry args={[0.7, 0.16, 0.7]} />
				<Paint color={glass} metal={0.7} rough={0.2} />
			</mesh>
			<mesh position={[-1.3, 0.4, -1.9]}>
				<boxGeometry args={[0.5, 0.12, 0.14]} />
				<Paint color="#ffb15a" glow={2} />
			</mesh>
			<mesh position={[1.3, 0.4, -1.9]}>
				<boxGeometry args={[0.5, 0.12, 0.14]} />
				<Paint color="#ffb15a" glow={2} />
			</mesh>
		</group>
	);
}

/** Cab and crane. The mason lays pads and towers. */
export function Mason() {
	return (
		<group>
			<mesh castShadow position={[0, 0.28, 0]}>
				<boxGeometry args={[2.8, 0.36, 4.6]} />
				<Paint color={coal} />
			</mesh>
			<mesh castShadow position={[0, 0.85, -1.15]}>
				<boxGeometry args={[1.7, 0.8, 1.5]} />
				<Paint color={plate} />
			</mesh>
			<mesh position={[0, 0.95, -0.55]}>
				<boxGeometry args={[1.1, 0.4, 0.12]} />
				<Paint color={glass} metal={0.7} rough={0.2} />
			</mesh>
			<mesh castShadow position={[0.9, 1.3, 0.4]}>
				<boxGeometry args={[0.16, 1.5, 0.16]} />
				<Paint color="#3a3e46" />
			</mesh>
			<mesh castShadow position={[0.9, 1.95, 1.15]}>
				<boxGeometry args={[0.14, 0.14, 1.7]} />
				<Paint color="#ffb15a" glow={0.4} />
			</mesh>
			<mesh position={[0, 0.4, 2.15]}>
				<boxGeometry args={[1.4, 0.16, 0.4]} />
				<Paint color={plate} />
			</mesh>
		</group>
	);
}

export function TankBody({ chassis }: { chassis: Chassis }) {
	if (chassis === "sabre") return <Sabre />;
	if (chassis === "anvil") return <Anvil />;
	if (chassis === "mason") return <Mason />;
	return <Lance />;
}

export function ScionHull({ heavy }: { heavy: boolean }) {
	return heavy ? (
		<group>
			<mesh castShadow position={[0, 0.48, 0]}>
				<boxGeometry args={[3.4, 0.7, 3.6]} />
				<Paint color="#241820" metal={0.55} />
			</mesh>
			<mesh position={[0, 0.9, 0.2]}>
				<boxGeometry args={[0.28, 0.14, 2.4]} />
				<Paint color="#ff4fd8" glow={2} />
			</mesh>
		</group>
	) : (
		<group>
			<mesh castShadow position={[0, 0.5, 0]}>
				<boxGeometry args={[2.2, 0.55, 4.8]} />
				<Paint color="#241c22" metal={0.55} />
			</mesh>
			<mesh castShadow position={[0, 0.78, 1.7]} rotation={[-0.7, 0, 0]}>
				<boxGeometry args={[1.15, 0.2, 1.4]} />
				<Paint color="#3a2434" />
			</mesh>
			<mesh position={[0, 0.66, 0.15]}>
				<boxGeometry args={[0.22, 0.12, 2.4]} />
				<Paint color="#ff4fd8" glow={2.1} />
			</mesh>
		</group>
	);
}
