export const DREAD_MAX = 5;

export type RoomId =
	| "foyer"
	| "parlor"
	| "dining"
	| "kitchen"
	| "cellar"
	| "hall"
	| "bedroom"
	| "study";

export type ItemId = "matches" | "candle" | "salt" | "key" | "locket";

export type Ending = "out" | "kept" | null;

export interface Game {
	room: RoomId;
	inventory: ItemId[];
	lit: boolean;
	nameKnown: boolean;
	saltPoured: boolean;
	mirrorSeen: boolean;
	dread: number;
	ending: Ending;
}

export interface Turn {
	game: Game;
	text: string;
	summary: string;
	understood: boolean;
	voice: boolean;
}

export interface Action {
	label: string;
	command: string;
	emphasis?: boolean;
}

export const ROOM_LABEL: Record<RoomId, string> = {
	foyer: "Foyer",
	parlor: "Parlor",
	dining: "Dining",
	kitchen: "Kitchen",
	cellar: "Cellar",
	hall: "Hall",
	bedroom: "Bedroom",
	study: "Study",
};

export const OPENING =
	"You wake on the foyer rug. The front door is shut, and it is the way out. A parlor opens on the left, a dining room on the right, and the stairs go up. Something under the kitchen has started counting.";

const KEPT =
	"The rooms go quiet in the way a held breath is quiet. You sit down on the floor. You live here now.";

const ESCAPE =
	"The key turns and you say the name. The door opens on a cold, ordinary street. You step out. The house is only a house behind you.";

const ORIGIN: Record<ItemId, RoomId> = {
	matches: "parlor",
	candle: "dining",
	salt: "kitchen",
	key: "cellar",
	locket: "bedroom",
};

const ITEM_LABEL: Record<ItemId, string> = {
	matches: "matches",
	candle: "candle",
	salt: "salt",
	key: "key",
	locket: "locket",
};

const WAYS: Record<RoomId, [string, RoomId][]> = {
	foyer: [
		["parlor", "parlor"],
		["left", "parlor"],
		["west", "parlor"],
		["dining room", "dining"],
		["dining", "dining"],
		["right", "dining"],
		["east", "dining"],
		["upstairs", "hall"],
		["stairs", "hall"],
		["hall", "hall"],
		["up", "hall"],
	],
	parlor: [
		["foyer", "foyer"],
		["back", "foyer"],
		["out", "foyer"],
		["east", "foyer"],
		["right", "foyer"],
	],
	dining: [
		["foyer", "foyer"],
		["back", "foyer"],
		["west", "foyer"],
		["left", "foyer"],
		["kitchen", "kitchen"],
		["east", "kitchen"],
		["right", "kitchen"],
	],
	kitchen: [
		["dining room", "dining"],
		["dining", "dining"],
		["back", "dining"],
		["west", "dining"],
		["left", "dining"],
		["cellar", "cellar"],
		["trapdoor", "cellar"],
		["down", "cellar"],
		["ladder", "cellar"],
	],
	cellar: [
		["kitchen", "kitchen"],
		["up", "kitchen"],
		["ladder", "kitchen"],
		["out", "kitchen"],
	],
	hall: [
		["downstairs", "foyer"],
		["foyer", "foyer"],
		["down", "foyer"],
		["stairs", "foyer"],
		["bedroom", "bedroom"],
		["left", "bedroom"],
		["west", "bedroom"],
		["study", "study"],
		["right", "study"],
		["east", "study"],
	],
	bedroom: [
		["hall", "hall"],
		["back", "hall"],
		["out", "hall"],
		["east", "hall"],
	],
	study: [
		["hall", "hall"],
		["back", "hall"],
		["out", "hall"],
		["west", "hall"],
	],
};

const ROOM_WORDS: [string, RoomId][] = [
	["dining room", "dining"],
	["upstairs hall", "hall"],
	["bedroom", "bedroom"],
	["parlor", "parlor"],
	["dining", "dining"],
	["kitchen", "kitchen"],
	["cellar", "cellar"],
	["study", "study"],
	["foyer", "foyer"],
	["hall", "hall"],
	["upstairs", "hall"],
];

const TARGETS: [string, string][] = [
	["box of matches", "matches"],
	["matchbox", "matches"],
	["matches", "matches"],
	["match", "matches"],
	["candlestick", "candle"],
	["candle", "candle"],
	["iron key", "key"],
	["key", "key"],
	["jar of salt", "salt"],
	["salt", "salt"],
	["jar", "salt"],
	["locket", "locket"],
	["necklace", "locket"],
	["journal", "journal"],
	["diary", "journal"],
	["book", "journal"],
	["scrap", "scrap"],
	["note", "scrap"],
	["letter", "scrap"],
	["plate", "scrap"],
	["mirror", "mirror"],
	["fireplace", "fireplace"],
	["mantel", "mantel"],
	["hearth", "fireplace"],
	["clock", "clock"],
	["stairs", "stairs"],
	["staircase", "stairs"],
	["bed", "bed"],
	["window", "window"],
	["trapdoor", "trapdoor"],
	["back door", "boards"],
	["boards", "boards"],
	["front door", "door"],
	["door", "door"],
	["shape", "shape"],
	["shadow", "shape"],
	["figure", "shape"],
	["table", "table"],
];

const GO_VERBS =
	/^(go|walk|enter|head|move|run|climb|sneak|step|venture|return|ascend|descend)\b/;

export function initialGame(): Game {
	return {
		room: "foyer",
		inventory: [],
		lit: false,
		nameKnown: false,
		saltPoured: false,
		mirrorSeen: false,
		dread: 0,
		ending: null,
	};
}

export function itemsHere(game: Game): ItemId[] {
	return (Object.keys(ORIGIN) as ItemId[]).filter((item) => {
		if (game.inventory.includes(item)) return false;
		if (item === "salt" && game.saltPoured) return false;
		return ORIGIN[item] === game.room;
	});
}

export function exits(room: RoomId): RoomId[] {
	const seen: RoomId[] = [];
	for (const [, dest] of WAYS[room]) {
		if (dest !== room && !seen.includes(dest)) seen.push(dest);
	}
	return seen;
}

export function carrying(game: Game): string {
	if (game.inventory.length === 0) return "Carrying nothing";
	const bits = game.inventory.map((item) => {
		if (item === "candle" && game.lit) return "a lit candle";
		if (item === "candle") return "a candle";
		if (item === "matches") return "matches";
		if (item === "salt") return "salt";
		if (item === "key") return "an iron key";
		return "a locket";
	});
	return `Carrying ${bits.join(", ")}`;
}

export function actions(game: Game): Action[] {
	const list: Action[] = [];
	for (const item of itemsHere(game)) {
		if (item === "locket") continue;
		list.push({ label: `Take the ${ITEM_LABEL[item]}`, command: `take ${item}` });
	}
	if (game.room === "dining") list.push({ label: "Read the scrap", command: "read scrap" });
	if (game.room === "study") list.push({ label: "Read the journal", command: "read journal" });
	if (game.room === "parlor") list.push({ label: "Look in the mirror", command: "look at mirror" });
	if (
		(game.room === "bedroom" && itemsHere(game).includes("locket")) ||
		(game.inventory.includes("locket") && !game.nameKnown)
	) {
		list.push({ label: "Read the locket", command: "read locket" });
	}
	if (game.inventory.includes("candle") && game.inventory.includes("matches") && !game.lit) {
		list.push({ label: "Light the candle", command: "light candle", emphasis: true });
	}
	if (game.room === "cellar" && game.inventory.includes("salt") && !game.saltPoured && itemsHere(game).includes("key")) {
		list.push({ label: "Pour the salt", command: "use salt" });
	}
	if (game.room === "foyer") {
		const ready = game.inventory.includes("key") && game.nameKnown;
		list.push({
			label: ready ? "Open the front door" : "Try the front door",
			command: "open door",
			emphasis: ready,
		});
		if (game.nameKnown) list.push({ label: "Speak the name", command: "say marrow", emphasis: true });
	}
	list.push({ label: "Help", command: "help" });
	return list;
}

export function facts(game: Game): string {
	const carried =
		game.inventory.length === 0
			? "nothing"
			: game.inventory
					.map((item) => (item === "candle" && game.lit ? "lit candle" : item))
					.join(", ");
	const ending =
		game.ending === "out"
			? "the player is outside"
			: game.ending === "kept"
				? "the house kept the player"
				: "still inside";
	return [
		`Room: ${ROOM_LABEL[game.room]}`,
		`Carrying: ${carried}`,
		`Candle lit: ${game.lit ? "yes" : "no"}`,
		`Knows the door's name: ${game.nameKnown ? "yes" : "no"}`,
		`Salt line in the cellar: ${game.saltPoured ? "yes" : "no"}`,
		`Dread: ${game.dread} of ${DREAD_MAX}`,
		`Ending: ${ending}`,
	].join("\n");
}

export function acceptNarration(prose: string, source: string): boolean {
	const text = prose.trim();
	if (text.length < 12 || text.length > 800) return false;
	if (/```|as an ai|language model|system prompt|\bi can't\b|\bi cannot\b/i.test(text)) return false;
	if (/\bmarrow\b/i.test(text) && !/\bmarrow\b/i.test(source)) return false;
	const sourceEnds = /\b(step out|only a house behind you|you live here now)\b/i.test(source);
	const proseEnds = /\b(step out|escaped|you are free|you live here now|only a house behind you)\b/i.test(text);
	if (proseEnds && !sourceEnds) return false;
	return true;
}

export function act(game: Game, input: string): Turn {
	if (game.ending) {
		return line(game, "It is already over.", "The game is over.", false);
	}
	const action = parse(normalize(input), game);
	switch (action.kind) {
		case "unknown":
			return {
				game,
				text: "The house does not take that. Try a door, an object, or the front door.",
				summary: "Unrecognized action.",
				understood: false,
				voice: false,
			};
		case "help":
			return line(
				game,
				"Move with the plan, or name a room. Take what is loose. Light the candle when you have matches. Read what is written. When you know the door's name, say it in the foyer. Do not go into the cellar without a flame.",
				"Help.",
				false,
			);
		case "inventory":
			return line(game, carrying(game) + ".", "Inventory.", false);
		case "wait":
			return scare(game, 1, "You wait. The house waits faster than you do.", "The player waits.");
		case "listen":
			return line(game, listen(game), "The player listens.", true);
		case "attack":
			return attack(game);
		case "drop":
			return line(
				game,
				"You hold on to what you have. The house is a poor place to set things down.",
				"The player keeps their things.",
				true,
			);
		case "leave":
			if (game.room === "foyer") return openDoor(game);
			return line(game, "The front door is in the foyer. It is the only way out.", "The exit is the front door.", true);
		case "say":
			return speak(game, action.words);
		case "light":
			return light(game);
		case "salt":
			return pourSalt(game);
		case "open":
			return openDoor(game);
		case "take":
			return take(game, action.target);
		case "go":
			return move(game, action.to);
		case "here":
			return line(game, "You are already there.", "Already in the room.", false);
		case "blocked":
			return line(game, "You cannot reach that from here.", "No exit that way.", false);
		case "look":
			return line(game, describe(game), "The player looks.", true);
		case "examine":
			return examine(game, action.target);
	}
}

function line(game: Game, text: string, summary: string, voice: boolean): Turn {
	return { game, text, summary, understood: true, voice };
}

function scare(game: Game, amount: number, text: string, summary: string): Turn {
	const dread = game.dread + amount;
	if (dread >= DREAD_MAX) {
		return {
			game: { ...game, dread: DREAD_MAX, ending: "kept" },
			text: KEPT,
			summary: "The house keeps the player.",
			understood: true,
			voice: true,
		};
	}
	return line({ ...game, dread }, text, summary, true);
}

function listen(game: Game): string {
	if (game.room === "cellar") return "Breathing, slower than yours, somewhere near the shape.";
	if (game.room === "kitchen") return "Under the trapdoor, something is matching your breath.";
	return "The house ticks, settles, and listens back.";
}

function attack(game: Game): Turn {
	if (game.room === "cellar") {
		return scare(
			game,
			1,
			"You strike at the shape. Your hand meets cold, and the cold notices.",
			"The player strikes the shape.",
		);
	}
	return line(game, "There is nothing here that a blow would improve.", "Nothing to fight.", true);
}

function speak(game: Game, words: string): Turn {
	if (!/\bmarrow\b/.test(words)) {
		return line(game, "You speak. The house does not answer to that.", "The player says the wrong words.", true);
	}
	const next = { ...game, nameKnown: true };
	if (game.room === "foyer" && game.inventory.includes("key")) {
		return {
			game: { ...next, ending: "out" },
			text: ESCAPE,
			summary: "The player says the name at the openable door and leaves.",
			understood: true,
			voice: true,
		};
	}
	if (game.room === "foyer") {
		return line(
			next,
			"You say the name. Air moves through the seam of the door, then the lock holds. It still wants iron.",
			"The player says the name at the door without the key.",
			true,
		);
	}
	return line(
		next,
		"You say the name. The house files it away. The front door is the one that needs to hear it.",
		"The player says the name away from the door.",
		true,
	);
}

function light(game: Game): Turn {
	if (!game.inventory.includes("candle")) {
		return line(game, "You need the candle from the dining room.", "No candle.", false);
	}
	if (!game.inventory.includes("matches")) {
		return line(game, "You have nothing to strike.", "No matches.", false);
	}
	if (game.lit) return line(game, "The candle is already burning.", "Already lit.", false);
	return line(
		{ ...game, lit: true },
		"The match catches. The candle burns a pale pink, and the room steps back a little.",
		"The player lights the candle.",
		true,
	);
}

function pourSalt(game: Game): Turn {
	if (!game.inventory.includes("salt")) return line(game, "You have no salt.", "No salt.", false);
	if (game.room !== "cellar") {
		return line(
			game,
			"Salt on this floor is only salt. The threshold that wants it is under the kitchen.",
			"Salt used in the wrong room.",
			true,
		);
	}
	if (game.saltPoured) return line(game, "The line is already there.", "Salt already poured.", false);
	return line(
		{
			...game,
			saltPoured: true,
			inventory: game.inventory.filter((item) => item !== "salt"),
		},
		"You pour a white line across the dirt. The shape stops at it.",
		"The player pours salt in the cellar.",
		true,
	);
}

function openDoor(game: Game): Turn {
	if (game.room !== "foyer") {
		return line(game, "The front door is in the foyer. It is the only way out.", "The door is elsewhere.", true);
	}
	const key = game.inventory.includes("key");
	if (key && game.nameKnown) {
		return {
			game: { ...game, ending: "out" },
			text: ESCAPE,
			summary: "The player opens the front door and leaves.",
			understood: true,
			voice: true,
		};
	}
	if (key) {
		return line(
			game,
			"The key turns. The door stays shut, waiting for its name.",
			"The door is unlocked and still shut.",
			true,
		);
	}
	if (game.nameKnown) {
		return line(
			game,
			"You have the name. The lock is empty without the iron key.",
			"The door wants the key.",
			true,
		);
	}
	return line(game, "The front door is locked. It takes an iron key.", "The door is locked.", true);
}

function take(game: Game, target: string): Turn {
	if (target === "scrap" || target === "journal") {
		return line(game, "You can read it here. It stays where it is.", "The writing stays put.", true);
	}
	if (target === "mirror") return line(game, "The mirror is part of the wall.", "The mirror stays.", true);
	if (target === "door" || target === "boards") return openDoor(game);
	if (target === "trapdoor") return move(game, "cellar");
	if (!isItem(target)) return examine(game, target);
	return takeItem(game, target);
}

function takeItem(game: Game, item: ItemId): Turn {
	if (game.inventory.includes(item)) return line(game, "You already have that.", "Already carrying it.", false);
	if (!itemsHere(game).includes(item)) return line(game, "That is not here.", "Item not in the room.", false);
	if (item === "locket") return revealLocket(game, true);
	if (item === "key") return takeKey(game);
	const text =
		item === "salt"
			? "You take the salt. It is for a threshold, not for supper."
			: item === "candle"
				? "You take the candle."
				: "You take the matches. Enough for one flame that matters.";
	return line(
		{ ...game, inventory: gain(game, item) },
		text,
		`The player takes the ${item}.`,
		true,
	);
}

function takeKey(game: Game): Turn {
	const safe = game.inventory.includes("salt") || game.saltPoured;
	if (!safe) {
		return scare(
			{ ...game, inventory: gain(game, "key") },
			2,
			"You reach past the shape and take the key. It turns its head to follow you. The candle gutters. The house is much more interested in you now.",
			"The player takes the key and is frightened.",
		);
	}
	const poured = game.saltPoured;
	const next: Game = {
		...game,
		saltPoured: true,
		inventory: gain({ ...game, inventory: game.inventory.filter((item) => item !== "salt") }, "key"),
	};
	const text = poured
		? "You step over the salt. The shape stays put. The iron key comes off the nail, heavier than it should be."
		: "You pour a line of salt and step over it. The shape stops at the line. The iron key comes off the nail, heavier than it should be.";
	return line(next, text, "The player takes the key safely.", true);
}

function revealLocket(game: Game, takeIt: boolean): Turn {
	const next: Game = {
		...game,
		nameKnown: true,
		inventory: takeIt ? gain(game, "locket") : game.inventory,
	};
	if (game.nameKnown && takeIt) {
		return line(next, "You take the locket. You already know what it says.", "The player takes the locket.", true);
	}
	if (game.nameKnown) {
		return line(game, "The locket still says Marrow.", "The player reads the locket again.", true);
	}
	const lead = takeIt ? "You take the locket and open it." : "You open the locket.";
	return line(next, `${lead} Scratched on the inside, one word: Marrow.`, "The player reads the name in the locket.", true);
}

function move(game: Game, to: RoomId): Turn {
	if (game.room === to) return line(game, "You are already there.", "Already in the room.", false);
	if (!exits(game.room).includes(to)) {
		return line(game, "You cannot reach that from here.", "No exit that way.", false);
	}
	if (to === "cellar" && !game.lit) {
		return scare(
			{ ...game, room: "kitchen" },
			2,
			"You step onto the ladder. A cold hand takes your wrist and sets you back in the kitchen. Bring a light.",
			"The dark cellar rejects the player.",
		);
	}
	const next = { ...game, room: to };
	return line(next, describe(next), `The player enters the ${ROOM_LABEL[to]}.`, true);
}

function examine(game: Game, target: string): Turn {
	switch (target) {
		case "scrap":
			if (game.room !== "dining") return missing(game);
			return line(
				game,
				"The scrap under the plate reads: salt for the dark under the kitchen, iron for the lock, a name for the door. The name is not written here.",
				"The player reads the scrap.",
				true,
			);
		case "journal":
			if (game.room !== "study") return missing(game);
			return line(
				game,
				"The last page says: the name is cut into the locket. I will not write it twice.",
				"The player reads the journal.",
				true,
			);
		case "locket":
			if (game.room !== "bedroom" && !game.inventory.includes("locket")) return missing(game);
			return revealLocket(game, false);
		case "mirror":
			if (game.room !== "parlor") return line(game, "There is no mirror here.", "No mirror.", false);
			if (game.mirrorSeen) {
				return line(
					game,
					"You already looked. It is still a moment behind you, and you leave it that way.",
					"The player avoids the mirror.",
					true,
				);
			}
			return scare(
				{ ...game, mirrorSeen: true },
				1,
				"You look into the mirror. Your reflection is a moment behind, and then it raises a hand you did not raise.",
				"The mirror startles the player.",
			);
		case "door":
			if (game.room === "kitchen") return examine(game, "boards");
			if (game.room !== "foyer") {
				return line(game, "The front door is in the foyer.", "The door is elsewhere.", true);
			}
			return openDoor(game);
		case "boards":
			if (game.room !== "kitchen") return missing(game);
			return line(game, "The back door is boarded over. It has already lost.", "The back door is boarded.", true);
		case "trapdoor":
			if (game.room !== "kitchen") return missing(game);
			return line(
				game,
				"A trapdoor. Something below it is breathing on purpose.",
				"The player studies the trapdoor.",
				true,
			);
		case "fireplace":
		case "mantel":
			if (game.room !== "parlor") return missing(game);
			return line(
				game,
				itemsHere(game).includes("matches")
					? "Cold ash in the grate. A box of matches sits on the mantel."
					: "Cold ash in the grate. The mantel is empty.",
				"The player looks at the fireplace.",
				true,
			);
		case "clock":
			if (game.room !== "hall") return missing(game);
			return line(game, "The clock is stopped at three. Both hands. It gave up before you arrived.", "The clock.", true);
		case "bed":
			if (game.room !== "bedroom") return missing(game);
			return line(game, "The bed has been slept in. Not by you, as far as you know.", "The bed.", true);
		case "window":
			if (game.room === "bedroom") {
				return line(game, "The window is nailed shut from this side.", "The nailed window.", true);
			}
			if (game.room === "study") {
				return line(game, "Fog presses on the glass, flat as a palm.", "The study window.", true);
			}
			return missing(game);
		case "stairs":
			if (game.room === "foyer") return line(game, "The stairs go up to the hall.", "The stairs.", true);
			if (game.room === "hall") return line(game, "The stairs go down to the foyer.", "The stairs.", true);
			return missing(game);
		case "table":
			if (game.room !== "dining") return missing(game);
			return line(game, "A long table laid for no one. The scrap is under the plate.", "The table.", true);
		case "shape":
			if (game.room !== "cellar") return line(game, "Be specific. The house is full of things.", "Nothing particular.", true);
			return line(
				game,
				game.saltPoured
					? "It stands at the salt line like a guest told where the carpet ends."
					: "It has the outline of a person and none of the manners. It watches the key, or you. In this light those are the same direction.",
				"The player studies the shape.",
				true,
			);
		case "candle":
		case "matches":
		case "salt":
		case "key":
			return examineItem(game, target);
		default:
			return missing(game);
	}
}

function examineItem(game: Game, item: ItemId): Turn {
	const held = game.inventory.includes(item);
	const here = itemsHere(game).includes(item);
	if (!held && !here) return missing(game);
	if (item === "candle") {
		return line(
			game,
			game.lit ? "The candle burns that pale pink. It will do for the cellar." : "A candle. It needs a match.",
			"The candle.",
			true,
		);
	}
	if (item === "matches") return line(game, "A small box. Enough for one important flame.", "The matches.", true);
	if (item === "salt") return line(game, "Coarse salt. It is for a line on the ground.", "The salt.", true);
	return line(game, "Iron, warm, too heavy. It belongs to the front door.", "The key.", true);
}

function missing(game: Game): Turn {
	return line(game, "That is not here.", "Nothing there.", false);
}

const BACK: Record<RoomId, RoomId | "door"> = {
	foyer: "door",
	parlor: "foyer",
	dining: "foyer",
	kitchen: "dining",
	cellar: "kitchen",
	hall: "foyer",
	bedroom: "hall",
	study: "hall",
};

function describe(game: Game): string {
	switch (game.room) {
		case "foyer":
			return `${doorBlurb(game)} The parlor is to the left, the dining room to the right, and the stairs go up.`;
		case "parlor": {
			const matches = itemsHere(game).includes("matches") ? " A box of matches sits on the mantel." : "";
			return `A cold fireplace and a tall mirror.${matches} The foyer is behind you.`;
		}
		case "dining": {
			const candle = itemsHere(game).includes("candle")
				? "A candle stands in the middle of the table."
				: "The table is bare where the candle was.";
			return `${candle} A scrap of paper is under the plate. The kitchen is to the right, the foyer to the left.`;
		}
		case "kitchen": {
			const salt = itemsHere(game).includes("salt") ? "A jar of salt is on the counter." : "The counter is bare.";
			return `${salt} A trapdoor leads down into an occupied dark. The back door is boarded. The dining room is to the left.`;
		}
		case "cellar": {
			const key = itemsHere(game).includes("key")
				? "An iron key hangs on a nail at the far side."
				: "The nail at the far side is empty.";
			const shape = game.saltPoured
				? "The shape stands at your salt line and does not cross."
				: "A person-shaped dark stands between you and the nail.";
			return `The candle holds a small circle. ${key} ${shape} The ladder goes up to the kitchen.`;
		}
		case "hall":
			return "A clock stopped at three. The bedroom is to the left, the study to the right, and the stairs go down to the foyer.";
		case "bedroom": {
			const locket = itemsHere(game).includes("locket") ? "A locket lies on the pillow." : "The pillow is bare.";
			return `${locket} The bed has been slept in. The window is nailed shut. The hall is to the right.`;
		}
		case "study":
			return "A journal lies open on the desk. Fog presses on the window. The hall is to the left.";
	}
}

function doorBlurb(game: Game): string {
	const key = game.inventory.includes("key");
	if (key && game.nameKnown) return "You have the key and the name. The front door will open.";
	if (key) return "The iron key fits the front door, and still the door waits for a name.";
	if (game.nameKnown) return "You know the name for the front door. The lock is empty without the iron key.";
	return "The front door is shut. It is the way out, and it is locked.";
}

function gain(game: Game, item: ItemId): ItemId[] {
	return game.inventory.includes(item) ? game.inventory : [...game.inventory, item];
}

function isItem(target: string): target is ItemId {
	return target === "matches" || target === "candle" || target === "salt" || target === "key" || target === "locket";
}

type Parsed =
	| { kind: "unknown" }
	| { kind: "help" }
	| { kind: "inventory" }
	| { kind: "wait" }
	| { kind: "listen" }
	| { kind: "attack" }
	| { kind: "drop" }
	| { kind: "leave" }
	| { kind: "say"; words: string }
	| { kind: "light" }
	| { kind: "salt" }
	| { kind: "open" }
	| { kind: "take"; target: string }
	| { kind: "go"; to: RoomId }
	| { kind: "here" }
	| { kind: "blocked" }
	| { kind: "look" }
	| { kind: "examine"; target: string };

function parse(command: string, game: Game): Parsed {
	if (!command) return { kind: "unknown" };
	if (/^(help|hint|hints|what now|what can i do|\?)$/.test(command)) return { kind: "help" };
	if (/^(inventory|inv|i|items|carrying)$/.test(command)) return { kind: "inventory" };
	if (/^(wait|rest|stay|z)$/.test(command)) return { kind: "wait" };
	if (/^(listen|hear)$/.test(command)) return { kind: "listen" };
	if (/^(attack|hit|kill|fight|stab|punch|kick)\b/.test(command)) return { kind: "attack" };
	if (/^(drop|put down|throw away)\b/.test(command)) return { kind: "drop" };
	if (/^(escape|leave the house|exit the house|get out|get out of the house)$/.test(command)) {
		return { kind: "leave" };
	}

	if (command === "marrow") return { kind: "say", words: "marrow" };
	const said = command.match(/^(say|speak|whisper|shout|tell|announce)\s+(.+)$/);
	if (said) return { kind: "say", words: said[2] };
	const named = command.match(/^(i am|im|my name is|call me)\s+(.+)$/);
	if (named) return { kind: "say", words: named[2] };

	if (/^(light|ignite|burn|strike)\b/.test(command)) {
		const target = findTarget(command);
		if (target && target !== "candle" && target !== "matches" && target !== "fireplace") {
			return { kind: "unknown" };
		}
		return { kind: "light" };
	}

	if (/^(use|pour|sprinkle)\b/.test(command)) {
		const target = findTarget(command);
		if (target === "salt") return { kind: "salt" };
		if (target === "candle" || target === "matches") return { kind: "light" };
		if (target === "key" || target === "door") return { kind: "open" };
		if (target) return { kind: "examine", target };
		return { kind: "unknown" };
	}

	if (/^(open|unlock|unlatch)\b/.test(command) || command === "open it") {
		const target = findTarget(command);
		if (target === "locket" || target === "journal" || target === "scrap") {
			return { kind: "examine", target };
		}
		if (target === "trapdoor") return goParsed(game, "cellar");
		if (target === "boards") return { kind: "examine", target: "boards" };
		if ((command === "open" || command === "open it") && game.room === "kitchen") {
			return goParsed(game, "cellar");
		}
		if (target === "door" || command === "open" || command === "unlock" || command === "open it") {
			return { kind: "open" };
		}
		return { kind: "unknown" };
	}

	if (/^(take|get|grab|pick up|pick|steal|pocket)\b/.test(command)) {
		const target = findTarget(command);
		if (!target) return { kind: "unknown" };
		return { kind: "take", target };
	}

	if (GO_VERBS.test(command)) {
		const rest = command.replace(/^\S+\s*/, "");
		if (rest === "out of the house" || rest === "outside") return { kind: "leave" };
		if (rest === "out" || rest === "away" || rest === "out of here" || rest === "back") {
			const back = BACK[game.room];
			if (back === "door") return rest === "back" ? { kind: "here" } : { kind: "open" };
			return { kind: "go", to: back };
		}
		return destinationParsed(game, rest);
	}

	if (/^(leave|exit|out|back)$/.test(command)) {
		const back = BACK[game.room];
		if (back === "door") return command === "back" ? { kind: "here" } : { kind: "open" };
		return { kind: "go", to: back };
	}

	if (/^(look around\b|look$|l$|where am i$|where$)/.test(command)) return { kind: "look" };

	if (/^(look at|look in|look into|examine|inspect|read|check)\b/.test(command)) {
		const target = findTarget(command);
		if (!target) return { kind: "unknown" };
		return { kind: "examine", target };
	}

	return destinationOrTarget(game, command);
}

function destinationOrTarget(game: Game, command: string): Parsed {
	const dest = destination(game.room, command);
	const target = findTarget(command);
	if (dest === "here") return { kind: "here" };
	if (dest && dest !== "blocked" && !target) return { kind: "go", to: dest };
	if (dest === "blocked" && !target) return { kind: "blocked" };
	if (target && (!dest || dest === "blocked")) return { kind: "examine", target };
	if (dest && dest !== "blocked") return { kind: "go", to: dest };
	if (dest === "blocked") return { kind: "blocked" };
	return { kind: "unknown" };
}

function destinationParsed(game: Game, text: string): Parsed {
	const dest = destination(game.room, text);
	if (dest === "here") return { kind: "here" };
	if (dest === "blocked") return { kind: "blocked" };
	if (!dest) return { kind: "unknown" };
	return { kind: "go", to: dest };
}

function goParsed(game: Game, to: RoomId): Parsed {
	if (exits(game.room).includes(to) || game.room === to) return { kind: "go", to };
	return { kind: "blocked" };
}

function destination(room: RoomId, text: string): RoomId | "blocked" | "here" | null {
	const ways = [...WAYS[room]].sort((a, b) => b[0].length - a[0].length);
	for (const [word, dest] of ways) {
		if (mentions(text, word)) return dest;
	}
	const rooms = [...ROOM_WORDS].sort((a, b) => b[0].length - a[0].length);
	for (const [word, dest] of rooms) {
		if (mentions(text, word)) return dest === room ? "here" : "blocked";
	}
	return null;
}

function findTarget(text: string): string | null {
	const ranked = [...TARGETS].sort((a, b) => b[0].length - a[0].length);
	for (const [alias, id] of ranked) {
		if (mentions(text, alias)) return id;
	}
	return null;
}

function mentions(text: string, word: string): boolean {
	return ` ${text} `.includes(` ${word} `);
}

function normalize(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^(please|could you|would you)\s+/, "")
		.replace(/^(i want to|i try to|i will|ill)\s+/, "")
		.replace(/^i (?!am\b)/, "");
}
