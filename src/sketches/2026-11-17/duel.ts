export const MARKS = 3;

export const INSULT_PERSONA = `You are Captain Brine, a comic pirate. Insult the sailor in front of you. Playful only: hats, boots, swords, footwork, coats, courage, parrots, maps, or timing. No slurs, no sex, no real violence. One sentence, under 18 words, spoken to them. Use you or your. No labels and no quotation marks.`;

export const JUDGE_PERSONA = "Reply with one word: HIT or MISS.";

export const SUBJECTS = [
	"hat",
	"boots",
	"sword",
	"footwork",
	"coat",
	"courage",
	"parrot",
	"map",
	"moustache",
	"timing",
	"balance",
	"voice",
] as const;

export const FOUL = "We mock hats and footwork here. Try another.";

const INSULTS = [
	"Your hat is negotiating a separate surrender.",
	"That sword is a letter opener that got ambitious.",
	"I have met barnacles with a finer sense of balance.",
	"Your boots are already walking toward the apology.",
	"You parry the way a clerk swats a fly, and miss.",
	"My parrot asked for a better class of opponent.",
	"The tide comes in with more commitment than your footwork.",
	"Your coat has seen more courage than you have.",
	"You advance as if the floor might send a bill.",
	"I have heard sharper threats from a damp biscuit.",
	"Your stance is a rumour your knees refuse to repeat.",
	"A lighthouse would squint to find your timing.",
	"You hold that blade the way a man hides a mop.",
	"Even your moustache is trying to leave the duel.",
	"Your map is upside down, and so is the rest of you.",
	"I would fight your shadow, but it keeps apologising.",
	"That feather has filed for a transfer to a braver hat.",
	"You smell of low tide and lower confidence.",
	"Your voice arrives a full verse after the insult.",
	"I have duelled deckchairs with more spine.",
];

const HIT_LINES = [
	"That one landed. I felt it in the hat.",
	"A point to you. Distasteful.",
	"I shall pretend the deck moved.",
	"Oh, a sharp one. Rude of you.",
	"Taken. I will not enjoy repeating it.",
	"You may have that point. Do not get used to it.",
];

const MISS_LINES = [
	"The gulls have said worse, and they were funnier.",
	"Swing again. That one missed the air.",
	"You brought a murmur to a shouting match.",
	"I remain unpunctured.",
	"A fine breeze. No blade in it.",
	"Come back with a sentence that has bones.",
];

const BANNED = new Set([
	"nigger",
	"nigga",
	"niggers",
	"niggas",
	"faggot",
	"faggots",
	"fag",
	"retard",
	"retards",
	"retarded",
	"tranny",
	"trannies",
	"kike",
	"kikes",
	"chink",
	"chinks",
	"spic",
	"spics",
	"gook",
	"gooks",
	"wetback",
	"wetbacks",
	"towelhead",
	"nazi",
	"nazis",
	"rape",
	"rapist",
	"kill",
	"killing",
	"murder",
	"lynch",
	"kys",
]);

const BANNED_PREFIX = ["nigg", "faggot", "retard"];

const PHRASES = ["kill yourself", "kys"];

const STOP = new Set(
	"a an the of to and or but in on for with my i me he she it his her their our is are was were be been this that as at from by so if not no do did just than then too very like have has had will would can could about into over after before already way more than them they your".split(
		" ",
	),
);

const AIM = new Set(["you", "your", "yours", "you're", "youre", "ye", "thee", "thou", "yourself"]);

export type Side = "you" | "brine";
export type Verdict = "hit" | "miss" | "foul";
export type Source = "model" | "referee" | "foul";

export const TURN_OPENERS = [
	"How appropriate",
	"At least",
	"Says the",
	"And yet",
	"Big talk",
	"Funny",
	"Odd",
] as const;

export interface Path {
	id: "length" | "land" | "fresh";
	met: boolean;
	detail: string;
}

export interface Note {
	verdict: Verdict;
	why: string;
	paths: Path[];
}

export interface Call {
	verdict: Verdict;
	reaction: string;
	source: Source;
	why: string;
	paths: Path[];
}

export function createDeck(rng: () => number): string[] {
	const deck = [...INSULTS];
	for (let index = deck.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(rng() * (index + 1));
		const current = deck[index];
		const other = deck[swap];
		if (current === undefined || other === undefined) continue;
		deck[index] = other;
		deck[swap] = current;
	}
	return deck;
}

const INSULT_EXAMPLE = "Your coat has seen more courage than you have.";

export function insultPrompt(subject: string, avoid: string[]): string {
	const ban = avoid.length > 0 ? ` Do not use these words: ${avoid.join(", ")}.` : "";
	return `Example: ${INSULT_EXAMPLE}
Write a different insult about the sailor's ${subject}.${ban}`;
}

export function judgePrompt(insult: string, reply: string): string {
	return `Insult: ${fence(insult)}
Comeback: ${fence(reply)}
Verdict:`;
}

export function winnerLine(winner: Side): string {
	return winner === "you"
		? "Three touches. Brine tips what is left of his hat."
		: "Three the other way. He bows, which is worse.";
}

export function isBlocked(text: string): boolean {
	const normalized = normalize(text);
	if (!normalized) return false;
	const padded = ` ${normalized} `;
	for (const phrase of PHRASES) {
		if (padded.includes(` ${phrase} `)) return true;
	}
	for (const token of normalized.split(" ")) {
		if (!token) continue;
		if (BANNED.has(token)) return true;
		for (const prefix of BANNED_PREFIX) {
			if (token.startsWith(prefix)) return true;
		}
	}
	return false;
}

export function hookLine(insult: string): string {
	const found = content(words(insult))
		.filter((word) => word.length >= 4)
		.slice(0, 4);
	if (found.length === 0) return "one of his words";
	if (found.length === 1) return found[0] ?? "one of his words";
	return `${found.slice(0, -1).join(", ")}, or ${found[found.length - 1]}`;
}

export function judgeNote(insult: string, reply: string): Note {
	if (isBlocked(reply)) return { verdict: "foul", why: FOUL, paths: [] };
	const replyWords = words(reply);
	const insultWords = words(insult);
	const insultContent = content(insultWords);
	const replyContent = content(replyWords);
	const hooks = hookLine(insult);
	const caughtWord = caught(insultContent, replyContent);
	const aimed = replyWords.some((word) => AIM.has(word));
	const turn = TURN_OPENERS.find((opener) =>
		new RegExp(`^${opener.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(reply.trim()),
	);
	const shared = insultContent.filter((word) => replyContent.includes(word));
	const parrot =
		insultContent.length > 0 &&
		shared.length / insultContent.length >= 0.75 &&
		replyWords.length <= insultWords.length + 1;
	const lengthMet = replyWords.length >= 4;
	const landMet = Boolean(turn) || aimed || Boolean(caughtWord);
	const freshMet = !parrot;
	const lengthDetail = lengthMet
		? `${replyWords.length} words, past the minimum of 4.`
		: `Only ${replyWords.length} ${replyWords.length === 1 ? "word" : "words"}. Add words until it reaches 4.`;
	const landDetail = turn
		? `Opens with ${turn}.`
		: aimed && caughtWord
			? `Says you or your, and reuses ${caughtWord}.`
			: aimed
				? "Says you or your."
				: caughtWord
					? `Reuses ${caughtWord}.`
					: `No you or your, and none of ${hooks}. Add one of those.`;
	const freshDetail = freshMet
		? "Not a copy of his line."
		: `Too close to his line. Rewrite it, and keep ${hooks} or you.`;
	const paths: Path[] = [
		{ id: "length", met: lengthMet, detail: lengthDetail },
		{ id: "land", met: landMet, detail: landDetail },
		{ id: "fresh", met: freshMet, detail: freshDetail },
	];
	const hit = lengthMet && landMet && freshMet;
	const misses = paths.filter((path) => !path.met).map((path) => path.detail);
	const why = hit ? `${landDetail} That's a touch.` : misses.join(" ");
	return { verdict: hit ? "hit" : "miss", why, paths };
}

export function localVerdict(insult: string, reply: string): Verdict {
	return judgeNote(insult, reply).verdict;
}

export function cleanInsult(raw: string): string | null {
	const text = raw
		.replace(/<\|[^|>]*\|>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const stripped = text
		.replace(/^(captain brine|brine|insult|assistant)\s*[:\-–—]\s*/i, "")
		.replace(/^["“”]+|["“”]+$/g, "")
		.trim();
	if (/^(hit|miss)\b/i.test(stripped)) return null;
	const sentence = firstSentence(stripped);
	if (!sentence || isBlocked(sentence) || echoed(sentence)) return null;
	if (!/\byou(?:rself|r|'re|re)?\b/i.test(sentence)) return null;
	if (/\b(as an ai|language model|system prompt)\b/i.test(sentence)) return null;
	if (tooClose(sentence, [INSULT_EXAMPLE])) return null;
	const count = words(sentence).length;
	if (count < 4 || count > 28) return null;
	if (sentence.length > 180 || !/[.!?]$/.test(sentence)) return null;
	const counted = words(sentence);
	const repeats = new Map<string, number>();
	for (const word of counted) repeats.set(word, (repeats.get(word) ?? 0) + 1);
	const most = Math.max(0, ...repeats.values());
	if (counted.length > 0 && most / counted.length > 0.45) return null;
	const letters = sentence.match(/[A-Za-z]/g)?.length ?? 0;
	if (letters < 8) return null;
	return sentence;
}

export function parseModelCall(raw: string): { verdict: "hit" | "miss" | null; reaction: string } {
	const text = raw.replace(/<\|[^|>]*\|>/g, " ").trim();
	const lines = text
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean);
	const lead = lines.find((line) => /^(hit|miss)\b/i.test(line)) ?? lines[0] ?? "";
	const match = lead.match(/^(hit|miss)\b\s*[:\-–—]?\s*(.*)$/i);
	if (!match) return { verdict: null, reaction: "" };
	const verdict = match[1]?.toLowerCase() === "hit" ? "hit" : "miss";
	let reaction = firstSentence((match[2] ?? "").trim());
	reaction = reaction.replace(/^(hit|miss)\b\s*[:\-–—]?\s*/i, "").trim();
	if (
		!reaction ||
		isBlocked(reaction) ||
		echoed(reaction) ||
		words(reaction).length < 2 ||
		reaction.length > 160
	) {
		return { verdict, reaction: "" };
	}
	return { verdict, reaction };
}

export function settle(
	insult: string,
	reply: string,
	modelRaw: string | null,
	rng: () => number,
): Call {
	const note = judgeNote(insult, reply);
	if (note.verdict === "foul")
		return { verdict: "foul", reaction: FOUL, source: "foul", why: note.why, paths: [] };
	const parsed = modelRaw ? parseModelCall(modelRaw) : { verdict: null, reaction: "" };
	const verdict = note.verdict === "hit" ? "hit" : "miss";
	const agreed = parsed.verdict === verdict && parsed.reaction;
	const reaction = agreed ? parsed.reaction : scriptedReaction(verdict, rng);
	return {
		verdict,
		reaction,
		source: agreed ? "model" : "referee",
		why: note.why,
		paths: note.paths,
	};
}

export function applyMarks(
	you: number,
	brine: number,
	verdict: "hit" | "miss",
): { you: number; brine: number; winner: Side | null } {
	const nextYou = verdict === "miss" ? you - 1 : you;
	const nextBrine = verdict === "hit" ? brine - 1 : brine;
	const winner = nextYou <= 0 ? "brine" : nextBrine <= 0 ? "you" : null;
	return { you: nextYou, brine: nextBrine, winner };
}

export function scriptedReaction(
	verdict: "hit" | "miss",
	rng: () => number,
	avoid?: string,
): string {
	const pool = verdict === "hit" ? HIT_LINES : MISS_LINES;
	const choices = avoid ? pool.filter((line) => line !== avoid) : pool;
	const usable = choices.length > 0 ? choices : pool;
	const index = Math.floor(rng() * usable.length);
	return usable[index] ?? usable[0] ?? "";
}

export function tooClose(candidate: string, previous: string[]): boolean {
	const mine = new Set(content(words(candidate)));
	if (mine.size === 0) return false;
	for (const line of previous) {
		const other = content(words(line));
		if (other.length === 0) continue;
		let shared = 0;
		for (const word of other) if (mine.has(word)) shared += 1;
		if (shared / other.length >= 0.5) return true;
	}
	return false;
}

export function avoidWords(lines: string[]): string[] {
	const found = new Set<string>();
	for (const line of lines.slice(-3)) {
		for (const word of content(words(line))) found.add(word);
	}
	return [...found].slice(0, 8);
}

export function liveSpeech(raw: string, kind: "insult" | "call"): string {
	let text = raw
		.replace(/<\|[^|>]*\|>/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (kind === "call") text = text.replace(/^\s*(hit|miss)\b\s*[:\-–—]?\s*/i, "");
	text = text.replace(/^(captain brine|brine|insult|assistant)\s*[:\-–—]\s*/i, "");
	return text;
}

function echoed(text: string): boolean {
	return /\b(colon|instruction|example|label|comeback|system prompt)\b/i.test(text);
}

function fence(text: string): string {
	return text.replace(/["“”]/g, "'").replace(/\s+/g, " ").trim().slice(0, 180);
}

function firstSentence(text: string): string {
	const trimmed = text.trim();
	const match = trimmed.match(/^(.+?[.!?])["“”']*(?:\s|$)/);
	return (match?.[1] ?? trimmed).replace(/^["“”']+|["“”']+$/g, "").trim();
}

function words(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z'\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
}

function content(tokens: string[]): string[] {
	return tokens.filter((word) => word.length >= 3 && !STOP.has(word) && !AIM.has(word));
}

function caught(left: string[], right: string[]): string | null {
	for (const a of left) {
		for (const b of right) {
			if (a === b) return a;
			if (a.length >= 5 && b.length >= 5 && a.slice(0, 4) === b.slice(0, 4)) return a;
		}
	}
	return null;
}

function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/[@4]/g, "a")
		.replace(/0/g, "o")
		.replace(/[1!|]/g, "i")
		.replace(/3/g, "e")
		.replace(/\$/g, "s")
		.replace(/[^a-z\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}
