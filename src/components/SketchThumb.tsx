import ThumbMist from "./ThumbMist";

type Props = {
	back: string;
	mid: string;
	front: string;
	day: string;
	monthYear: string;
	shortDate: string;
};

const MIST_LAYERS = [
	{ band: 0.42, spread: 0.55, density: 0.26, speed: 0.28, seed: 1.7 },
	{ band: 0.55, spread: 0.48, density: 0.29, speed: 0.4, seed: 4.2 },
];

export default function SketchThumb({ back, mid, front, day, monthYear, shortDate }: Props) {
	return (
		<span className="relative z-[1] block min-h-56 md:min-h-64">
			{/*
			  Clipper opens on hover. Paint is a fixed expanded height so images/WebGL
			  never resize mid-animation (clip-path on canvas was flashing the mist).
			*/}
			<span className="absolute inset-0 overflow-hidden transition-[top,bottom] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-top-7 group-hover:-bottom-7 md:group-hover:-top-9 md:group-hover:-bottom-9">
				<span className="bg-bg-media text-fg-on-media absolute inset-x-0 top-1/2 h-[17.5rem] w-full -translate-y-1/2 md:h-[20.5rem]">
					<img
						src={back}
						alt=""
						decoding="async"
						className="pointer-events-none absolute inset-[-6%] z-0 h-[112%] w-[112%] max-w-none origin-center object-cover transition-transform duration-2000 ease-out group-hover:translate-x-[-0.2%] group-hover:translate-y-[0.12%] group-hover:scale-[1.03]"
					/>
					<img
						src={mid}
						alt=""
						decoding="async"
						className="pointer-events-none absolute inset-[-8%] z-[1] h-[116%] w-[116%] max-w-none origin-center object-cover transition-transform duration-2000 ease-out group-hover:translate-x-[-0.5%] group-hover:translate-y-[0.3%] group-hover:scale-[1.05]"
					/>
					<span className="pointer-events-none absolute inset-0 z-[2] transition-transform duration-2000 ease-out group-hover:translate-x-[-0.5%] group-hover:translate-y-[0.3%] group-hover:scale-[1.05]">
						<ThumbMist layers={MIST_LAYERS} />
					</span>
					<img
						src={front}
						alt=""
						decoding="async"
						className="pointer-events-none absolute inset-[-10%] z-[3] h-[120%] w-[120%] max-w-none origin-center object-cover transition-transform duration-2000 ease-out group-hover:translate-x-[-0.9%] group-hover:translate-y-[0.55%] group-hover:scale-[1.08]"
					/>
					<span className="pointer-events-none absolute inset-0 z-[4] bg-[linear-gradient(rgba(52,74,88,0.12),rgba(52,74,88,0.32))]" />
					<span className="date-stroke absolute top-1/2 left-6 z-[5] -translate-y-1/2 text-6xl leading-none sm:text-7xl">
						{day}
					</span>
					<span className="font-meta absolute top-1/2 right-5 z-[5] -translate-y-1/2 text-[11px] [writing-mode:vertical-rl]">
						{monthYear}
					</span>
					<span className="font-meta absolute right-5 bottom-5 z-[5] text-[11px]">{shortDate}</span>
				</span>
			</span>
		</span>
	);
}
