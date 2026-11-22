export type GameKind = "trivia" | "word_chain" | "twenty_questions" | "rhyme";

export type GameState =
	| { kind: "idle" }
	| {
			kind: "trivia";
			index: number;
			score: number;
			asked: number;
			awaiting: string;
	  }
	| {
			kind: "word_chain";
			lastLetter: string;
			used: string[];
			score: number;
	  }
	| {
			kind: "twenty_questions";
			secret: string;
			category: string;
			turns: number;
			max: number;
	  }
	| {
			kind: "rhyme";
			seed: string;
			used: string[];
			score: number;
	  };

const TRIVIA: { q: string; a: string; hint: string }[] = [
	{ q: "What planet is known as the Red Planet?", a: "mars", hint: "Fourth from the sun." },
	{ q: "How many keys does a standard piano have?", a: "88", hint: "Eight-eight." },
	{ q: "What is the largest ocean on Earth?", a: "pacific", hint: "It touches Asia and the Americas." },
	{ q: "Who wrote the play Romeo and Juliet?", a: "shakespeare", hint: "English bard." },
	{ q: "What gas do plants absorb from the air?", a: "carbon dioxide", hint: "CO2." },
	{ q: "What is the capital of Japan?", a: "tokyo", hint: "Starts with T." },
	{ q: "How many legs does a spider have?", a: "8", hint: "Same as an octopus's arms." },
	{ q: "What year did the first iPhone launch?", a: "2007", hint: "Late 2000s." },
	{ q: "What is H2O better known as?", a: "water", hint: "You're mostly made of it." },
	{ q: "Which instrument has 6 strings in standard tuning?", a: "guitar", hint: "Rock staple." },
	{ q: "What continent is Egypt on?", a: "africa", hint: "Nile flows through it." },
	{ q: "How many degrees in a right angle?", a: "90", hint: "A quarter turn." },
];

const TWENTY: { secret: string; category: string }[] = [
	{ secret: "a traffic cone", category: "roadside object" },
	{ secret: "a thermos of coffee", category: "car-cabin object" },
	{ secret: "the moon", category: "thing in the sky" },
	{ secret: "a paper map", category: "navigation relic" },
	{ secret: "a rubber duck", category: "toy" },
	{ secret: "a lighthouse", category: "building" },
	{ secret: "a cassette tape", category: "music medium" },
	{ secret: "a sunflower", category: "plant" },
];

const RHYME_SEEDS = ["road", "night", "drive", "rain", "star", "wheel", "song", "light", "coast", "mile"];

const CHAIN_STARTERS = ["asphalt", "tunnel", "engine", "sunset", "glovebox", "horizon", "radio", "detour"];

function pick<T>(items: T[]): T {
	return items[Math.floor(Math.random() * items.length)]!;
}

function normalize(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function lastAlpha(word: string): string {
	const letters = word.toLowerCase().replace(/[^a-z]/g, "");
	return letters.slice(-1) || "a";
}

export function startGame(kind: GameKind): { state: GameState; prompt: string } {
	if (kind === "trivia") {
		const index = Math.floor(Math.random() * TRIVIA.length);
		const card = TRIVIA[index]!;
		return {
			state: { kind: "trivia", index, score: 0, asked: 1, awaiting: card.a },
			prompt: `Trivia round. Question 1: ${card.q}`,
		};
	}
	if (kind === "word_chain") {
		const first = pick(CHAIN_STARTERS);
		return {
			state: { kind: "word_chain", lastLetter: lastAlpha(first), used: [first], score: 0 },
			prompt: `Word chain. I start with “${first}”. Your word must start with “${lastAlpha(first).toUpperCase()}”.`,
		};
	}
	if (kind === "twenty_questions") {
		const card = pick(TWENTY);
		return {
			state: {
				kind: "twenty_questions",
				secret: card.secret,
				category: card.category,
				turns: 0,
				max: 20,
			},
			prompt: `Twenty questions. I'm thinking of ${card.category}. Ask yes/no questions, or guess. You have 20 turns.`,
		};
	}
	const seed = pick(RHYME_SEEDS);
	return {
		state: { kind: "rhyme", seed, used: [seed], score: 0 },
		prompt: `Rhyme battle. Give me a word that rhymes with “${seed}”. No repeats.`,
	};
}

export function playTurn(state: GameState, utterance: string): { state: GameState; reply: string; handled: boolean } {
	if (state.kind === "idle") return { state, reply: "", handled: false };

	const said = normalize(utterance);
	if (!said) return { state, reply: "Say that again?", handled: true };
	if (/\b(stop|quit|end game|enough)\b/.test(said)) {
		return { state: { kind: "idle" }, reply: "Game parked. What else can I do?", handled: true };
	}

	if (state.kind === "trivia") {
		const card = TRIVIA[state.index]!;
		const correct = normalize(card.a);
		const ok =
			said === correct ||
			said.includes(correct) ||
			correct.split(" ").every((w) => said.includes(w));

		let score = state.score;
		let reply: string;
		if (ok) {
			score += 1;
			reply = "Nailed it.";
		} else if (/\bhint\b/.test(said)) {
			return { state, reply: `Hint: ${card.hint}`, handled: true };
		} else {
			reply = `Not quite — it was ${card.a}.`;
		}

		if (state.asked >= 5) {
			return {
				state: { kind: "idle" },
				reply: `${reply} Round over: ${score}/5. Want another game?`,
				handled: true,
			};
		}

		let nextIndex = (state.index + 1 + Math.floor(Math.random() * (TRIVIA.length - 1))) % TRIVIA.length;
		if (nextIndex === state.index) nextIndex = (nextIndex + 1) % TRIVIA.length;
		const next = TRIVIA[nextIndex]!;
		return {
			state: {
				kind: "trivia",
				index: nextIndex,
				score,
				asked: state.asked + 1,
				awaiting: next.a,
			},
			reply: `${reply} Question ${state.asked + 1}: ${next.q}`,
			handled: true,
		};
	}

	if (state.kind === "word_chain") {
		const word = said.split(" ")[0] ?? "";
		if (word.length < 2) return { state, reply: "Give me a real word.", handled: true };
		if (state.used.includes(word)) return { state, reply: "Already used. Try another.", handled: true };
		if (!word.startsWith(state.lastLetter)) {
			return {
				state,
				reply: `Needs to start with “${state.lastLetter.toUpperCase()}”.`,
				handled: true,
			};
		}
		const nextLetter = lastAlpha(word);
		const replyWord = inventChainReply(nextLetter, [...state.used, word]);
		if (!replyWord) {
			return {
				state: { kind: "idle" },
				reply: `Nice — “${word}”. I'm stumped on “${nextLetter.toUpperCase()}”. You win with ${state.score + 1} links.`,
				handled: true,
			};
		}
		return {
			state: {
				kind: "word_chain",
				lastLetter: lastAlpha(replyWord),
				used: [...state.used, word, replyWord],
				score: state.score + 1,
			},
			reply: `“${word}” works. I go “${replyWord}” — your turn on “${lastAlpha(replyWord).toUpperCase()}”.`,
			handled: true,
		};
	}

	if (state.kind === "twenty_questions") {
		const turns = state.turns + 1;
		const secret = normalize(state.secret);
		if (said.includes(secret) || secret.split(" ").every((w) => w.length > 2 && said.includes(w))) {
			return {
				state: { kind: "idle" },
				reply: `You got it in ${turns}: ${state.secret}. Sharp.`,
				handled: true,
			};
		}
		if (turns >= state.max) {
			return {
				state: { kind: "idle" },
				reply: `Out of questions. It was ${state.secret}.`,
				handled: true,
			};
		}
		const answer = yesNoForSecret(said, state.secret, state.category);
		return {
			state: { ...state, turns },
			reply: `${answer} (${turns}/${state.max})`,
			handled: true,
		};
	}

	if (state.kind === "rhyme") {
		const word = said.split(" ")[0] ?? "";
		if (state.used.includes(word)) return { state, reply: "Already said. Fresh rhyme?", handled: true };
		if (!roughRhyme(word, state.seed) && !roughRhyme(word, state.used[state.used.length - 1]!)) {
			return {
				state,
				reply: `Stretch that rhyme with “${state.seed}” a bit more.`,
				handled: true,
			};
		}
		const counter = inventRhyme(state.seed, [...state.used, word]);
		if (!counter) {
			return {
				state: { kind: "idle" },
				reply: `“${word}” lands. I'm out of rhymes — you take the belt with ${state.score + 1}.`,
				handled: true,
			};
		}
		return {
			state: {
				kind: "rhyme",
				seed: state.seed,
				used: [...state.used, word, counter],
				score: state.score + 1,
			},
			reply: `“${word}” — I'll fire back “${counter}”. Keep going.`,
			handled: true,
		};
	}

	return { state, reply: "", handled: false };
}

function inventChainReply(letter: string, used: string[]): string | null {
	const bank = [
		"amber", "axle", "avenue", "beacon", "bumper", "bridge", "cabin", "compass", "coast", "detour",
		"diesel", "drive", "echo", "exit", "engine", "freeway", "fog", "glovebox", "gravel", "horizon",
		"highway", "ignition", "interstate", "junction", "keyring", "lane", "landmark", "mile", "mirror",
		"night", "north", "overpass", "oil", "pavement", "plaza", "radio", "ramp", "road", "signal",
		"sunset", "tunnel", "turnpike", "underpass", "vehicle", "vista", "wheel", "window", "zebra",
	];
	const hits = bank.filter((w) => w.startsWith(letter) && !used.includes(w));
	return hits.length ? pick(hits) : null;
}

function inventRhyme(seed: string, used: string[]): string | null {
	const map: Record<string, string[]> = {
		oad: ["load", "toad", "code", "mode", "rode"],
		ight: ["night", "light", "bright", "flight", "kite", "bite"],
		ive: ["drive", "five", "alive", "thrive", "hive"],
		ain: ["rain", "lane", "train", "plain", "grain", "chain"],
		ar: ["star", "car", "far", "jar", "guitar"],
		eel: ["wheel", "steel", "feel", "deal", "reel"],
		ong: ["song", "long", "strong", "belong"],
		oast: ["coast", "toast", "roast", "boast"],
		ile: ["mile", "smile", "stile", "aisle", "while"],
	};
	const key = Object.keys(map).find((k) => seed.endsWith(k)) ?? seed.slice(-3);
	const options = (map[key] ?? ["road", "load", "code"]).filter((w) => !used.includes(w) && w !== seed);
	return options.length ? pick(options) : null;
}

function roughRhyme(a: string, b: string): boolean {
	const x = a.replace(/[^a-z]/g, "");
	const y = b.replace(/[^a-z]/g, "");
	if (x.length < 2 || y.length < 2) return false;
	return x.slice(-2) === y.slice(-2) || x.slice(-3) === y.slice(-3);
}

function yesNoForSecret(question: string, secret: string, category: string): string {
	const q = question.toLowerCase();
	const s = secret.toLowerCase();
	if (/\bliving\b|\balive\b|\banimal\b/.test(q)) return /duck|sunflower/.test(s) ? "Yes-ish." : "No.";
	if (/\beatable\b|\bfood\b|\bdrink\b/.test(q)) return /coffee|thermos/.test(s) ? "Related to a drink." : "No.";
	if (/\belectronic\b|\bdigital\b/.test(q)) return /cassette/.test(s) ? "Old-school media — not really." : "No.";
	if (/\binside (a |the )?car\b|\bcabin\b/.test(q)) return /thermos|map|cassette/.test(s) ? "Often, yes." : "Usually no.";
	if (/\boutside\b|\boutdoors\b/.test(q)) return /cone|lighthouse|moon|sunflower/.test(s) ? "Yes." : "Not mainly.";
	if (/\bbig\b|\blarge\b/.test(q)) return /lighthouse|moon/.test(s) ? "Pretty big." : "Not especially.";
	if (/\bcolor\b|\bcolour\b|\borange\b/.test(q)) return /cone/.test(s) ? "Often orange." : "Color varies.";
	if (/\bsky\b|\bspace\b|\bnight\b/.test(q)) return /moon/.test(s) ? "Yes." : "No.";
	if (/\bplant\b|\bflower\b/.test(q)) return /sunflower/.test(s) ? "Yes." : "No.";
	if (/\btoy\b/.test(q)) return /duck/.test(s) ? "Yes." : "No.";
	if (/\bbuilding\b|\btower\b/.test(q)) return /lighthouse/.test(s) ? "Yes." : "No.";
	if (/\bpaper\b|\bmap\b/.test(q)) return /map/.test(s) ? "Yes." : "No.";
	if (/\bcategory\b|\bwhat kind\b/.test(q)) return `It's in the ${category} family.`;
	return "Hmm — ask something more specific.";
}

export function gameLabel(state: GameState): string {
	if (state.kind === "idle") return "idle";
	if (state.kind === "trivia") return `trivia ${state.asked}/5 · ${state.score} correct`;
	if (state.kind === "word_chain") return `word chain · ${state.score} links`;
	if (state.kind === "twenty_questions") return `20Q · ${state.turns}/${state.max}`;
	return `rhyme · ${state.score}`;
}
