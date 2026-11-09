import { ROOT_ID, useUndoStore } from "./src/sketches/2026-11-09/store.ts";

const s = () => useUndoStore.getState();
const fail = (message: string) => {
	console.error("FAIL", message);
	process.exit(1);
};
const text = () => s().nodes[s().currentId].doc.cards[0]?.text;
const rootKids = () => s().nodes[ROOT_ID].childIds;

s().setText("note-1", "Alpha");
const alpha = s().currentId;
s().setText("note-1", "Alpha more");
const later = s().currentId;
if (s().nodes[alpha].childIds.includes(later) === false) fail("later should hang off alpha");
s().undo();
s().undo();
if (s().currentId !== ROOT_ID) fail("back to root");

s().setText("note-1", "Alpha");
if (s().currentId !== alpha) fail("same text should reuse alpha");
if (rootKids().length !== 1) fail("root should have one child, has " + rootKids().length);
if (s().nodes[alpha].childIds.includes(later) === false) fail("later branch was dropped");

s().undo();
s().setText("note-1", "Beta");
if (rootKids().length !== 2) fail("different text should branch");
const beta = s().currentId;

s().checkout(ROOT_ID);
s().removeCard("note-2");
const removed = s().currentId;
s().undo();
s().removeCard("note-2");
if (s().currentId !== removed) fail("repeat remove should reuse the node");
if (s().nodes[ROOT_ID].childIds.filter((id) => s().nodes[id].kind === "remove").length !== 1) {
	fail("duplicate remove");
}

s().checkout(ROOT_ID);
s().moveCard(0, 1);
const moved = s().currentId;
s().undo();
s().moveCard(0, 1);
if (s().currentId !== moved) fail("repeat reorder should reuse the node");

s().checkout(beta);
if (text() !== "Beta") fail("beta survived");
console.log("ok", Object.keys(s().nodes).length, "nodes");
