// Payphone jobs. Each one names a real 19 November event.

export type MissionId = "speech" | "edsel" | "apollo" | "tape" | "wii";

export type MissionDef = {
	id: MissionId;
	title: string;
	event: string;
	year: number;
	/** Shown on the payphone. Names the real event and the date. */
	history: string;
	task: string;
	pay: number;
	done: string;
};

export const MISSIONS: MissionDef[] = [
	{
		id: "speech",
		title: "The address",
		event: "Gettysburg Address",
		year: 1863,
		history: "Abraham Lincoln delivered the Gettysburg Address on 19 November 1863.",
		task: "Stand at the podium in the park.",
		pay: 272,
		done: "Two minutes at the podium. 1863.",
	},
	{
		id: "edsel",
		title: "The lemon",
		event: "End of the Edsel",
		year: 1959,
		history: "Ford announced the end of the Edsel on 19 November 1959.",
		task: "Drive the three chrome lemons into the crusher.",
		pay: 590,
		done: "The lot is clear. 1959.",
	},
	{
		id: "apollo",
		title: "Ocean of Storms",
		event: "Apollo 12 landing",
		year: 1969,
		history: "Apollo 12 landed on the Moon on 19 November 1969.",
		task: "Carry the lander from the hangar and plant it on the beach.",
		pay: 1200,
		done: "The lander is down. Apollo 12, 1969.",
	},
	{
		id: "tape",
		title: "The real voices",
		event: "Milli Vanilli Grammy revoked",
		year: 1990,
		history: "Milli Vanilli were stripped of their Grammy on 19 November 1990.",
		task: "Take the tape from the studio to the stage on the docks.",
		pay: 900,
		done: "The tape takes the stage. 1990.",
	},
	{
		id: "wii",
		title: "Wrist strap",
		event: "Nintendo Wii launch",
		year: 2006,
		history: "The Nintendo Wii launched in North America on 19 November 2006.",
		task: "Collect three boxes from the shop and deliver them to the launch line.",
		pay: 600,
		done: "The line has its boxes. 2006.",
	},
];

export function missionById(id: MissionId): MissionDef {
	const found = MISSIONS.find((mission) => mission.id === id);
	if (!found) throw new Error(`unknown mission ${id}`);
	return found;
}
