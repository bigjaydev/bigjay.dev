import {
	ROOMS,
	type HomeState,
	type RoomId,
} from "./home";

type Props = {
	home: HomeState;
	activeVacuum: RoomId | null;
	progress: number;
	onToggleLight: (room: RoomId) => void;
};

/** Room polygons in viewBox units (800×640). */
const PLAN: Record<
	RoomId,
	{ path: string; label: [number, number]; hit: { x: number; y: number; w: number; h: number } }
> = {
	living: {
		path: "M40 40 H390 V330 H40 Z",
		label: [215, 68],
		hit: { x: 40, y: 40, w: 350, h: 290 },
	},
	kitchen: {
		path: "M390 40 H760 V280 H390 Z",
		label: [575, 68],
		hit: { x: 390, y: 40, w: 370, h: 240 },
	},
	hallway: {
		path: "M330 330 H470 V600 H330 Z",
		label: [400, 470],
		hit: { x: 330, y: 330, w: 140, h: 270 },
	},
	bedroom: {
		path: "M40 330 H330 V600 H40 Z",
		label: [185, 358],
		hit: { x: 40, y: 330, w: 290, h: 270 },
	},
	bathroom: {
		path: "M470 280 H760 V600 H470 Z",
		label: [615, 318],
		hit: { x: 470, y: 280, w: 290, h: 320 },
	},
};

const FILL_OFF: Record<RoomId, string> = {
	living: "#2a2926",
	kitchen: "#262b29",
	hallway: "#2c2a26",
	bedroom: "#2b272e",
	bathroom: "#242c30",
};

const FILL_ON: Record<RoomId, string> = {
	living: "#ffe7a8",
	kitchen: "#fff0c2",
	hallway: "#ffeec0",
	bedroom: "#ffe4d4",
	bathroom: "#e8f4ff",
};

export default function HousePlan({ home, activeVacuum, progress, onToggleLight }: Props) {
	return (
		<svg
			viewBox="0 0 800 640"
			width="100%"
			height="100%"
			preserveAspectRatio="xMidYMid meet"
			className="block"
			role="img"
			aria-label="Cutaway floor plan of the house"
		>
			<defs>
				<pattern id="yard" width="18" height="18" patternUnits="userSpaceOnUse">
					<path d="M0 18 L18 0" stroke="#6f8f6a" strokeWidth="0.6" opacity="0.35" />
				</pattern>
				<filter id="warm-glow" x="-20%" y="-20%" width="140%" height="140%">
					<feGaussianBlur stdDeviation="8" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<radialGradient id="lamp" cx="50%" cy="50%" r="50%">
					<stop offset="0%" stopColor="#fff6c8" stopOpacity="0.95" />
					<stop offset="55%" stopColor="#ffd56a" stopOpacity="0.35" />
					<stop offset="100%" stopColor="#ffd56a" stopOpacity="0" />
				</radialGradient>
			</defs>

			{/* Yard / plot */}
			<rect x="0" y="0" width="800" height="640" fill="#c5d4b8" />
			<rect x="0" y="0" width="800" height="640" fill="url(#yard)" />

			{/* Outer slab shadow */}
			<rect x="28" y="28" width="744" height="584" rx="10" fill="#1c2426" opacity="0.12" />

			{/* Shell */}
			<path
				d="M40 40 H760 V600 H40 Z"
				fill="#f4efe6"
				stroke="#1c2426"
				strokeWidth="10"
				strokeLinejoin="round"
			/>

			{ROOMS.map((room) => {
				const plan = PLAN[room.id];
				const lit = home.lights[room.id];
				return (
					<g key={room.id}>
						<path
							d={plan.path}
							fill={lit ? FILL_ON[room.id] : FILL_OFF[room.id]}
							stroke="#1c2426"
							strokeWidth="3"
							className="transition-[fill] duration-500"
						/>
						{lit ? (
							<circle
								cx={plan.label[0]}
								cy={plan.hit.y + plan.hit.h * 0.45}
								r={Math.min(plan.hit.w, plan.hit.h) * 0.28}
								fill="url(#lamp)"
								opacity="0.85"
							/>
						) : null}
						{/* Hit target */}
						<rect
							x={plan.hit.x}
							y={plan.hit.y}
							width={plan.hit.w}
							height={plan.hit.h}
							fill="transparent"
							className="cursor-pointer"
							onClick={() => onToggleLight(room.id)}
							role="button"
							tabIndex={0}
							aria-label={`${room.label}, lights ${lit ? "on" : "off"}`}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onToggleLight(room.id);
								}
							}}
						/>
						<text
							x={plan.label[0]}
							y={plan.label[1]}
							textAnchor="middle"
							fill={lit ? "#1c2426" : "#d7d2c8"}
							opacity={lit ? 0.55 : 0.7}
							style={{
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: 11,
								letterSpacing: "0.16em",
								pointerEvents: "none",
							}}
						>
							{room.label.toUpperCase()}
						</text>
						{/* Ceiling lamp fixture */}
						<g transform={`translate(${plan.label[0]}, ${plan.hit.y + 28})`} pointerEvents="none">
							<circle
								r="7"
								fill={lit ? "#f5d76a" : "#9aa3a6"}
								stroke="#1c2426"
								strokeWidth="1.5"
								style={{
									filter: lit ? "url(#warm-glow)" : undefined,
								}}
							>
								{lit ? (
									<animate
										attributeName="opacity"
										values="0.75;1;0.75"
										dur="2.2s"
										repeatCount="indefinite"
									/>
								) : null}
							</circle>
						</g>
					</g>
				);
			})}

			{/* Interior walls redrawn on top for clean joins */}
			<path
				d="M390 40 V330 M40 330 H470 M330 330 V600 M470 280 V600 M390 280 H470"
				fill="none"
				stroke="#1c2426"
				strokeWidth="6"
				strokeLinecap="square"
				pointerEvents="none"
			/>

			{/* Door gaps */}
			<Door x={318} y={330} horizontal />
			<Door x={390} y={250} />
			<Door x={470} y={360} />
			<Door x={330} y={430} />

			{/* Windows */}
			<Window x={140} y={40} w={120} />
			<Window x={520} y={40} w={100} />
			<Window x={40} y={430} w={18} vertical h={90} />
			<Window x={760} y={360} w={18} vertical h={100} />
			<Window x={200} y={600} w={90} />

			{/* Furniture + appliances */}
			<LivingFurniture tvOn={home.tvOn} />
			<KitchenFurniture ovenTemp={home.ovenTemp} fridgeOpen={home.fridgeOpen} />
			<BedroomFurniture />
			<BathroomFurniture />
			<HallDock vacuumIdle={home.vacuum.mode === "idle"} />

			{/* Dim unlit rooms so furniture reads as dark too */}
			{ROOMS.map((room) =>
				home.lights[room.id] ? null : (
					<path
						key={`dim-${room.id}`}
						d={PLAN[room.id].path}
						fill="#0b0d0e"
						opacity="0.52"
						pointerEvents="none"
					/>
				),
			)}

			{activeVacuum ? (
				<VacuumBot room={activeVacuum} progress={progress} />
			) : (
				<VacuumBot room="hallway" progress={0} docked />
			)}

			{/* Entrance step */}
			<rect x="352" y="600" width="96" height="14" fill="#1c2426" opacity="0.2" />
			<text
				x="400"
				y="628"
				textAnchor="middle"
				fill="#1c2426"
				opacity="0.45"
				style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10, letterSpacing: "0.14em" }}
			>
				ENTRY
			</text>
		</svg>
	);
}

function Door({
	x,
	y,
	horizontal = false,
}: {
	x: number;
	y: number;
	horizontal?: boolean;
}) {
	if (horizontal) {
		return <rect x={x} y={y - 4} width={44} height={8} fill="#f4efe6" />;
	}
	return <rect x={x - 4} y={y} width={8} height={44} fill="#f4efe6" />;
}

function Window({
	x,
	y,
	w,
	h = 14,
	vertical = false,
}: {
	x: number;
	y: number;
	w: number;
	h?: number;
	vertical?: boolean;
}) {
	if (vertical) {
		return (
			<g>
				<rect x={x - w / 2} y={y} width={w} height={h} fill="#a9c7d6" stroke="#1c2426" strokeWidth="2" />
				<line x1={x} y1={y + 4} x2={x} y2={y + h - 4} stroke="#1c2426" strokeWidth="1" opacity="0.35" />
			</g>
		);
	}
	return (
		<g>
			<rect x={x} y={y - h / 2} width={w} height={h} fill="#a9c7d6" stroke="#1c2426" strokeWidth="2" />
			<line x1={x + 8} y1={y} x2={x + w - 8} y2={y} stroke="#1c2426" strokeWidth="1" opacity="0.35" />
		</g>
	);
}

function LivingFurniture({ tvOn }: { tvOn: boolean }) {
	return (
		<g pointerEvents="none">
			{/* Rug */}
			<rect x="90" y="150" width="200" height="120" rx="4" fill="#c45c4a" opacity="0.35" />
			{/* Sofa */}
			<rect x="100" y="165" width="170" height="54" rx="8" fill="#4f6f8f" stroke="#1c2426" strokeWidth="2" />
			<rect x="108" y="172" width="50" height="40" rx="6" fill="#6a8bab" />
			<rect x="212" y="172" width="50" height="40" rx="6" fill="#6a8bab" />
			{/* Coffee table */}
			<rect x="155" y="235" width="70" height="28" rx="3" fill="#8b6a45" stroke="#1c2426" strokeWidth="1.5" />
			{/* TV stand + screen */}
			<rect x="130" y="70" width="140" height="18" rx="2" fill="#2a3336" stroke="#1c2426" strokeWidth="1.5" />
			<rect
				x="145"
				y="78"
				width="110"
				height="62"
				rx="3"
				fill={tvOn ? "#3d8fd8" : "#1c2426"}
				stroke="#1c2426"
				strokeWidth="2"
			/>
			{tvOn ? (
				<>
					<rect x="155" y="90" width="90" height="38" fill="#7ec8ff" opacity="0.85">
						<animate attributeName="opacity" values="0.55;0.95;0.55" dur="2.8s" repeatCount="indefinite" />
					</rect>
					<text
						x="200"
						y="114"
						textAnchor="middle"
						fill="#fff"
						style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", letterSpacing: "0.08em" }}
					>
						LIVE
					</text>
				</>
			) : (
				<text
					x="200"
					y="114"
					textAnchor="middle"
					fill="#6a7376"
					style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
				>
					TV
				</text>
			)}
			{/* Plant */}
			<circle cx="330" cy="110" r="16" fill="#3f7a4e" stroke="#1c2426" strokeWidth="1.5" />
			<rect x="325" y="124" width="10" height="16" fill="#8b6a45" stroke="#1c2426" strokeWidth="1" />
		</g>
	);
}

function KitchenFurniture({
	ovenTemp,
	fridgeOpen,
}: {
	ovenTemp: number | null;
	fridgeOpen: boolean;
}) {
	return (
		<g pointerEvents="none">
			{/* Counters L-shape */}
			<rect x="410" y="60" width="320" height="46" fill="#d9cfc0" stroke="#1c2426" strokeWidth="2" />
			<rect x="684" y="60" width="46" height="180" fill="#d9cfc0" stroke="#1c2426" strokeWidth="2" />
			{/* Sink */}
			<rect x="520" y="70" width="54" height="28" rx="4" fill="#b7c9d1" stroke="#1c2426" strokeWidth="1.5" />
			<circle cx="547" cy="84" r="4" fill="#8aa0aa" />
			{/* Fridge */}
			<g transform="translate(420 130)">
				<rect
					width="54"
					height="90"
					rx="3"
					fill={fridgeOpen ? "#dce8ec" : "#8fa0a6"}
					stroke="#1c2426"
					strokeWidth="2"
				/>
				<g
					style={{
						transform: fridgeOpen ? "translate(-34px, 0)" : "translate(2px, 0)",
						transition: "transform 0.45s ease",
					}}
				>
					<rect
						y="4"
						width="26"
						height="82"
						rx="2"
						fill="#b7c5ca"
						stroke="#1c2426"
						strokeWidth="1.5"
					/>
				</g>
				{fridgeOpen ? (
					<>
						<rect x="10" y="12" width="34" height="10" fill="#f4efe6" opacity="0.9" />
						<rect x="10" y="28" width="34" height="10" fill="#f4efe6" opacity="0.75" />
						<rect x="12" y="48" width="14" height="18" fill="#e8b84a" />
						<rect x="30" y="52" width="12" height="12" fill="#6fbf73" />
					</>
				) : (
					<circle cx="44" cy="48" r="3" fill="#1c2426" opacity="0.45" />
				)}
				<text
					x="27"
					y="110"
					textAnchor="middle"
					fill="#1c2426"
					opacity="0.45"
					style={{ fontSize: 9, fontFamily: "ui-monospace, monospace", letterSpacing: "0.08em" }}
				>
					FRIDGE
				</text>
			</g>
			{/* Oven / range */}
			<g transform="translate(610 125)">
				<rect width="70" height="78" rx="3" fill="#2f3432" stroke="#1c2426" strokeWidth="2" />
				<circle cx="18" cy="16" r="5" fill="#1c2426" stroke="#6a7376" strokeWidth="1" />
				<circle cx="35" cy="16" r="5" fill="#1c2426" stroke="#6a7376" strokeWidth="1" />
				<circle cx="52" cy="16" r="5" fill="#1c2426" stroke="#6a7376" strokeWidth="1" />
				<rect
					x="10"
					y="30"
					width="50"
					height="38"
					rx="2"
					fill={ovenTemp ? "#d4552a" : "#1c2426"}
					stroke="#1c2426"
					strokeWidth="1.5"
				>
					{ovenTemp ? (
						<animate attributeName="opacity" values="0.55;1;0.55" dur="1.6s" repeatCount="indefinite" />
					) : null}
				</rect>
				{ovenTemp ? (
					<text
						x="35"
						y="54"
						textAnchor="middle"
						fill="#fff6c8"
						style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", fontWeight: 700 }}
					>
						{ovenTemp}°
					</text>
				) : (
					<text
						x="35"
						y="54"
						textAnchor="middle"
						fill="#6a7376"
						style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
					>
						OVEN
					</text>
				)}
			</g>
			{/* Table */}
			<rect x="500" y="200" width="100" height="48" rx="3" fill="#a67c52" stroke="#1c2426" strokeWidth="2" />
			<circle cx="520" cy="224" r="7" fill="#d9cfc0" stroke="#1c2426" strokeWidth="1" />
			<circle cx="580" cy="224" r="7" fill="#d9cfc0" stroke="#1c2426" strokeWidth="1" />
		</g>
	);
}

function BedroomFurniture() {
	return (
		<g pointerEvents="none">
			{/* Bed */}
			<rect x="70" y="390" width="150" height="100" rx="6" fill="#6b7db3" stroke="#1c2426" strokeWidth="2" />
			<rect x="78" y="398" width="48" height="28" rx="4" fill="#f4efe6" stroke="#1c2426" strokeWidth="1.2" />
			<rect x="164" y="398" width="48" height="28" rx="4" fill="#f4efe6" stroke="#1c2426" strokeWidth="1.2" />
			{/* Nightstand */}
			<rect x="230" y="400" width="36" height="36" rx="2" fill="#8b6a45" stroke="#1c2426" strokeWidth="1.5" />
			{/* Wardrobe */}
			<rect x="70" y="520" width="110" height="54" rx="2" fill="#7a5c3e" stroke="#1c2426" strokeWidth="2" />
			<line x1="125" y1="522" x2="125" y2="572" stroke="#1c2426" strokeWidth="1.5" />
		</g>
	);
}

function BathroomFurniture() {
	return (
		<g pointerEvents="none">
			{/* Bath */}
			<rect x="500" y="470" width="120" height="70" rx="18" fill="#c5d8e0" stroke="#1c2426" strokeWidth="2" />
			<rect x="512" y="482" width="96" height="46" rx="14" fill="#e7f2f6" />
			{/* Toilet */}
			<rect x="660" y="500" width="40" height="28" rx="6" fill="#f4efe6" stroke="#1c2426" strokeWidth="1.5" />
			<ellipse cx="680" cy="540" rx="18" ry="14" fill="#f4efe6" stroke="#1c2426" strokeWidth="1.5" />
			{/* Sink */}
			<rect x="500" y="340" width="70" height="40" rx="6" fill="#d5e2e8" stroke="#1c2426" strokeWidth="1.5" />
			<circle cx="535" cy="360" r="8" fill="#a9c0ca" />
			{/* Mirror */}
			<rect x="512" y="300" width="46" height="28" rx="2" fill="#9ebfd0" stroke="#1c2426" strokeWidth="1.5" />
		</g>
	);
}

function HallDock({ vacuumIdle }: { vacuumIdle: boolean }) {
	return (
		<g pointerEvents="none">
			<rect
				x="368"
				y="540"
				width="64"
				height="36"
				rx="4"
				fill="#2a3336"
				stroke="#1c2426"
				strokeWidth="2"
				opacity={vacuumIdle ? 1 : 0.45}
			/>
			<text
				x="400"
				y="562"
				textAnchor="middle"
				fill="#8fd3c2"
				style={{ fontSize: 9, fontFamily: "ui-monospace, monospace", letterSpacing: "0.1em" }}
			>
				DOCK
			</text>
		</g>
	);
}

function VacuumBot({
	room,
	progress,
	docked = false,
}: {
	room: RoomId;
	progress: number;
	docked?: boolean;
}) {
	const plan = PLAN[room];
	const cx = docked ? 400 : plan.hit.x + plan.hit.w * (0.35 + 0.3 * Math.sin(progress * Math.PI * 2));
	const cy = docked ? 556 : plan.hit.y + plan.hit.h * (0.4 + 0.25 * Math.cos(progress * Math.PI * 2));

	return (
		<g transform={`translate(${cx} ${cy})`} pointerEvents="none">
			{!docked ? (
				<circle r="22" fill="#8fd3c2" opacity="0.2">
					<animate attributeName="r" values="16;26;16" dur="1.4s" repeatCount="indefinite" />
				</circle>
			) : null}
			<circle r="14" fill="#2a3336" stroke="#1c2426" strokeWidth="2" />
			<circle r="6" fill="#8fd3c2" />
			{!docked ? (
				<path
					d="M-8 0 A8 8 0 0 1 8 0"
					fill="none"
					stroke="#f4efe6"
					strokeWidth="2"
					strokeLinecap="round"
					opacity="0.7"
				>
					<animateTransform
						attributeName="transform"
						type="rotate"
						from="0"
						to="360"
						dur="1s"
						repeatCount="indefinite"
					/>
				</path>
			) : null}
		</g>
	);
}
