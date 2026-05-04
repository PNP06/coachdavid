import assert from "node:assert/strict";
import test from "node:test";
import { TimerEngine } from "../src/core/TimerEngine.js";

test("advances by wall-clock time without one-second drift", () => {
  let now = 1_000;
  const engine = new TimerEngine({ now: () => now });
  const changes = [];
  engine.on("phaseChange", ({ current }) => changes.push(current.label));

  engine.start([
    { label: "Effort", durationSec: 30 },
    { label: "Repos", durationSec: 90, isRest: true },
    { label: "Retour", durationSec: 10 }
  ]);

  now += 121_000;
  const snapshot = engine.tick();

  assert.equal(snapshot.current.label, "Retour");
  assert.equal(Math.ceil(snapshot.phaseRemainingMs / 1000), 9);
  assert.deepEqual(changes, ["Repos", "Retour"]);
});

test("pause and resume exclude paused time", () => {
  let now = 10_000;
  const engine = new TimerEngine({ now: () => now });

  engine.start([{ label: "Simple", durationSec: 60 }]);
  now += 15_000;
  engine.pause();
  now += 30_000;

  assert.equal(Math.ceil(engine.getSnapshot().phaseRemainingMs / 1000), 45);

  engine.resume();
  now += 10_000;

  assert.equal(Math.ceil(engine.getSnapshot().phaseRemainingMs / 1000), 35);
  assert.equal(Math.round(engine.getSnapshot().actualDurationMs / 1000), 25);
});

test("manual reps phase waits for explicit completion", () => {
  let now = 50_000;
  const engine = new TimerEngine({ now: () => now });

  engine.start([
    { label: "Série 1", durationSec: null, manualLabel: "Série terminée" },
    { label: "Repos", durationSec: 90, isRest: true }
  ]);

  now += 300_000;
  assert.equal(engine.tick().current.label, "Série 1");

  engine.completeManual();
  assert.equal(engine.getSnapshot().current.label, "Repos");
});

test("time adjustment changes current remaining time", () => {
  let now = 100_000;
  const engine = new TimerEngine({ now: () => now });

  engine.start([{ label: "Repos", durationSec: 90, isRest: true }]);
  now += 20_000;
  engine.addTime(10);

  assert.equal(Math.ceil(engine.getSnapshot().phaseRemainingMs / 1000), 80);

  engine.addTime(-20);
  assert.equal(Math.ceil(engine.getSnapshot().phaseRemainingMs / 1000), 60);
});
