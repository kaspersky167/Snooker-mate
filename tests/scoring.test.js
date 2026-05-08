import assert from "node:assert/strict";
import { applyEvent, createMatch, currentFrame, endCurrentFrame, endMatch, frameWins, redoEvent, undoEvent } from "../src/scoring.js";

const players = [
  { id: "a", name: "Alice" },
  { id: "b", name: "Bob" },
  { id: "c", name: "Cara" }
];

let match = createMatch({ players: players.slice(0, 2), mode: "standard", bestOf: 3, raceTo: 2, starterIndex: 0 });
match = applyEvent(match, { type: "pot", playerId: "a", points: 1, ball: "red" });
match = applyEvent(match, { type: "pot", playerId: "a", points: 7, ball: "black" });
assert.equal(currentFrame(match).playerStats.a.points, 8);
assert.equal(currentFrame(match).playerStats.a.currentBreak, 8);
assert.equal(currentFrame(match).playerStats.a.highestBreak, 8);

match = applyEvent(match, { type: "foul", playerId: "a", awardedToId: "b", points: 4, miss: true });
assert.equal(currentFrame(match).playerStats.b.points, 4);
assert.equal(currentFrame(match).playerStats.a.currentBreak, 0);
assert.equal(currentFrame(match).currentPlayerIndex, 1);

match = undoEvent(match);
assert.equal(currentFrame(match).playerStats.b.points, 0);
match = redoEvent(match);
assert.equal(currentFrame(match).playerStats.b.points, 4);

match = endCurrentFrame(match, "a");
assert.equal(frameWins(match).a, 1);

match = endMatch(match, "a");
assert.equal(match.winnerId, "a");
assert.ok(match.endedAt);

let century = createMatch({ players, mode: "century", bestOf: 1, raceTo: 1, starterIndex: 0 });
for (let i = 0; i < 10; i += 1) {
  century = applyEvent(century, { type: "pot", playerId: "c", points: 10, ball: "super-red" });
}
assert.equal(currentFrame(century).playerStats.c.points, 100);
assert.equal(currentFrame(century).winnerId, "c");

console.log("scoring tests passed");
