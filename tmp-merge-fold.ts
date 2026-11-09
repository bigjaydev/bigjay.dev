import { ROOT_ID, useUndoStore } from "./src/sketches/2026-11-09/store.ts";

const s = () => useUndoStore.getState();
const fail = (message: string) => {
	console.error("FAIL", message);
	process.exit(1);
};
const note2 = () => s().nodes[s().currentId].doc.cards.find((card) => card.id === "note-2")?.text ?? "";
const base = note2();

s().setText("note-2", base + "!");
s().setText("note-2", base + "!!");
const burst = s().currentId;
if (s().nodes[ROOT_ID].childIds.length !== 1) fail("burst should be one node");
if (note2() !== base + "!!") fail("burst text");

s().undo();
s().setText("note-2", base + "!");
const partial = s().currentId;
if (partial === burst) fail("partial is not the full burst yet");
s().setText("note-2", base + "!!");
if (s().currentId !== burst) fail("folded duplicate should join the first burst");
if (s().nodes[partial]) fail("partial node should be removed");
if (s().nodes[ROOT_ID].childIds.length !== 1) fail("one sibling left");
if (note2() !== base + "!!") fail("merged text");
console.log("ok");
