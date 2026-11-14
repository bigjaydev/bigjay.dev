import type { Ending, ItemId, RoomId } from "./house";

const BONE = "#d8cfc2";
const INK = "#14110e";

export default function Scene({
	room,
	lit,
	ending,
	hasKey,
	nameKnown,
	saltPoured,
	items,
}: {
	room: RoomId;
	lit: boolean;
	ending: Ending;
	hasKey: boolean;
	nameKnown: boolean;
	saltPoured: boolean;
	items: ItemId[];
}) {
	const here = new Set(items);
	return (
		<svg viewBox="0 0 640 208" className="h-auto w-full bg-[#14110e]" aria-hidden="true">
			<defs>
				<radialGradient id="house-glow" cx="50%" cy="50%" r="50%">
					<stop offset="0%" stopColor="#fecef5" stopOpacity="0.55" />
					<stop offset="70%" stopColor="#fecef5" stopOpacity="0.08" />
					<stop offset="100%" stopColor="#fecef5" stopOpacity="0" />
				</radialGradient>
			</defs>
			{ending === "out" ? (
				<Outside />
			) : (
				<g>
					<rect width="640" height="208" fill={INK} />
					<rect y="162" width="640" height="46" fill="#1b1713" />
					<line x1="28" y1="162" x2="612" y2="162" stroke="#3a322a" strokeWidth="1.5" />
					{room === "foyer" && <Foyer hasKey={hasKey} nameKnown={nameKnown} />}
					{room === "parlor" && <Parlor matches={here.has("matches")} />}
					{room === "dining" && <Dining candle={here.has("candle")} />}
					{room === "kitchen" && <Kitchen salt={here.has("salt")} />}
					{room === "cellar" && <Cellar iron={here.has("key")} saltPoured={saltPoured} />}
					{room === "hall" && <Hall />}
					{room === "bedroom" && <Bedroom locket={here.has("locket")} />}
					{room === "study" && <Study />}
					{ending !== "kept" && <You x={132} foot={162} lit={lit} />}
					{ending === "kept" && <rect width="640" height="208" fill="#050403" opacity="0.82" />}
				</g>
			)}
		</svg>
	);
}

function stroke() {
	return { fill: "none", stroke: BONE, strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
}

function You({ x, foot, lit }: { x: number; foot: number; lit: boolean }) {
	return (
		<g>
			{lit && <circle cx={x + 18} cy={foot - 36} r="28" fill="url(#house-glow)" className="motion-safe:animate-pulse" />}
			<g {...stroke()} stroke="#fecef5">
				<circle cx={x} cy={foot - 52} r="7" />
				<path d={`M${x} ${foot - 45} V${foot - 16}`} />
				<path d={`M${x - 12} ${foot - 32} H${x + 16}`} />
				<path d={`M${x} ${foot - 16} l-9 16 M${x} ${foot - 16} l8 16`} />
			</g>
			{lit && <circle cx={x + 18} cy={foot - 36} r="2.4" fill="#fecef5" />}
		</g>
	);
}

function Foyer({ hasKey, nameKnown }: { hasKey: boolean; nameKnown: boolean }) {
	const ready = hasKey && nameKnown;
	return (
		<g {...stroke()}>
			<path d="M48 162 V78 Q48 46 86 46 H140 V162" />
			<path d="M500 162 V78 Q500 46 538 46 H600 V162" />
			{ready ? (
				<g>
					<rect x="292" y="40" width="70" height="122" fill="#efe6d6" stroke="none" />
					<path d="M292 40 L250 56 V174 L292 162" />
				</g>
			) : (
				<g>
					<rect x="268" y="36" width="104" height="126" />
					<path d="M320 36 V162" />
					<circle cx="348" cy="104" r="3.5" fill={hasKey ? "#fecef5" : BONE} stroke="none" />
					{nameKnown && <rect x="280" y="156" width="80" height="3" fill="#fecef5" stroke="none" />}
				</g>
			)}
			<path d="M390 162 V138 H418 V116 H446 V94 H474" />
		</g>
	);
}

function Parlor({ matches }: { matches: boolean }) {
	return (
		<g {...stroke()}>
			<rect x="64" y="96" width="86" height="66" />
			<path d="M52 96 H162" />
			<path d="M92 162 V128 H122 V162" />
			<rect x="430" y="48" width="64" height="96" />
			<circle cx="462" cy="78" r="8" stroke="#6d6458" />
			<path d="M462 92 V128" stroke="#6d6458" />
			<path d="M450 108 H474" stroke="#6d6458" />
			{matches && <rect x="118" y="86" width="16" height="8" />}
		</g>
	);
}

function Dining({ candle }: { candle: boolean }) {
	return (
		<g {...stroke()}>
			<path d="M150 118 H490 L460 158 H180 Z" />
			<circle cx="320" cy="136" r="10" />
			{candle && (
				<g>
					<rect x="314" y="78" width="12" height="28" />
					<path d="M320 78 C326 70 318 64 320 56 C322 64 314 70 320 78" fill="#fecef5" stroke="none" />
				</g>
			)}
			<rect x="360" y="128" width="18" height="8" transform="rotate(-8 369 132)" />
		</g>
	);
}

function Kitchen({ salt }: { salt: boolean }) {
	return (
		<g {...stroke()}>
			<path d="M48 108 H300" />
			{salt && (
				<g>
					<rect x="96" y="78" width="22" height="30" rx="4" />
					<path d="M100 78 H114" />
				</g>
			)}
			<rect x="250" y="124" width="46" height="28" />
			<path d="M250 138 H296 M273 124 V152" />
			<rect x="470" y="58" width="78" height="104" />
			<path d="M478 78 H540 M478 100 H540 M478 122 H540" />
		</g>
	);
}

function Cellar({ iron, saltPoured }: { iron: boolean; saltPoured: boolean }) {
	return (
		<g {...stroke()}>
			<path d="M40 52 H600 M40 68 H600" stroke="#3a322a" />
			<path d="M78 162 V70 M96 162 V70 M78 90 H96 M78 116 H96 M78 140 H96" />
			<path d="M300 162 V78 Q340 62 380 78 V162" fill="#241816" stroke="#6a4038" />
			{saltPoured && <path d="M220 158 H360" stroke="#efe6d6" strokeWidth="2" />}
			{iron && (
				<g transform="translate(470 96)" stroke={BONE}>
					<circle cx="0" cy="0" r="7" />
					<path d="M7 0 H28 M20 0 V6 M26 0 V6" />
				</g>
			)}
		</g>
	);
}

function Hall() {
	return (
		<g {...stroke()}>
			<circle cx="320" cy="78" r="28" />
			<path d="M320 78 V66 M320 78 H334" />
			<rect x="70" y="58" width="70" height="104" />
			<circle cx="126" cy="112" r="2.5" fill={BONE} stroke="none" />
			<rect x="500" y="58" width="70" height="104" />
			<circle cx="514" cy="112" r="2.5" fill={BONE} stroke="none" />
			<path d="M250 162 V146 H390 V162" />
		</g>
	);
}

function Bedroom({ locket }: { locket: boolean }) {
	return (
		<g {...stroke()}>
			<rect x="250" y="108" width="190" height="54" />
			<rect x="262" y="96" width="36" height="18" />
			{locket && <circle cx="400" cy="124" r="5" />}
			<rect x="500" y="52" width="70" height="52" />
			<path d="M500 52 L570 104 M570 52 L500 104" />
		</g>
	);
}

function Study() {
	return (
		<g {...stroke()}>
			<path d="M180 162 V118 H420 V162" />
			<path d="M210 118 V96 H250 V118" />
			<path d="M300 118 V92 H360 V118" />
			<path d="M308 100 H352 M330 92 V112" />
			<rect x="470" y="48" width="90" height="64" />
			<path d="M478 70 C500 62 520 78 548 66 M478 88 C506 80 528 96 552 84" stroke="#8a8175" />
		</g>
	);
}

function Outside() {
	return (
		<g>
			<rect width="640" height="208" fill="#e7dcc8" />
			<rect width="640" height="92" fill="#d5ddd8" />
			<rect x="36" y="48" width="92" height="122" fill={INK} />
			<path d="M128 48 L168 64 V184 L128 170" fill="none" stroke="#2a241c" strokeWidth="2" />
			<path d="M0 170 H640" stroke="#b7aa96" strokeWidth="2" />
			<rect x="470" y="58" width="78" height="48" fill="none" stroke="#8d8374" strokeWidth="1.5" />
			<path d="M509 58 V106" stroke="#8d8374" strokeWidth="1.5" />
			<You x={230} foot={170} lit={false} />
		</g>
	);
}
