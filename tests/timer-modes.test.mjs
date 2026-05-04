import assert from "node:assert/strict";
import test from "node:test";
import { CircuitTimer } from "../src/modes/CircuitTimer.js";
import { IntervalTimer } from "../src/modes/IntervalTimer.js";
import { SimpleTimer } from "../src/modes/SimpleTimer.js";
import { StrengthRestTimer } from "../src/modes/StrengthRestTimer.js";
import { TabataTimer } from "../src/modes/TabataTimer.js";

test("quick strength rest starts a standalone 90 second rest", () => {
  const phases = StrengthRestTimer.quickRest(90);

  assert.equal(phases.length, 1);
  assert.equal(phases[0].type, "rest");
  assert.equal(phases[0].durationSec, 90);
  assert.equal(phases[0].isRest, true);
});

test("strength set counter alternates manual sets and timed rests", () => {
  const phases = StrengthRestTimer.build({
    exercise: "Tractions / dips / pompes",
    sets: 4,
    restSeconds: 90
  });

  assert.equal(phases.length, 7);
  assert.equal(phases.filter((phase) => phase.durationSec === null).length, 4);
  assert.equal(phases.filter((phase) => phase.isRest).length, 3);
  assert.equal(phases[0].manualLabel, "Série terminée");
  assert.equal(phases[2].series, 2);
});

test("simple mode creates a 30 minute standalone timer", () => {
  const phases = SimpleTimer.build({ name: "Vélo", minutes: 30, seconds: 0, rpe: "5" });

  assert.equal(phases.length, 1);
  assert.equal(phases[0].durationSec, 1800);
  assert.equal(phases[0].label, "Vélo");
});

test("interval mode creates eight 30/90 blocks", () => {
  const phases = IntervalTimer.build({
    workSeconds: 30,
    restSeconds: 90,
    series: 8,
    warmupMinutes: 0,
    warmupSeconds: 0,
    cooldownMinutes: 0,
    cooldownSeconds: 0
  });

  assert.equal(phases.length, 16);
  assert.equal(phases[0].durationSec, 30);
  assert.equal(phases[1].durationSec, 90);
  assert.equal(phases[14].series, 8);
});

test("circuit mode supports timed work and rest blocks over rounds", () => {
  const phases = CircuitTimer.build({
    rounds: 10,
    blocks: [
      { name: "Travail", type: "time", durationSec: 40 },
      { name: "Repos", type: "rest", durationSec: 20 }
    ]
  });

  assert.equal(phases.length, 20);
  assert.equal(phases[0].round, 1);
  assert.equal(phases[1].isRest, true);
  assert.equal(phases[18].round, 10);
});

test("tabata defaults total four minutes", () => {
  const phases = TabataTimer.build(TabataTimer.defaults());
  const totalSeconds = phases.reduce((total, phase) => total + phase.durationSec, 0);

  assert.equal(phases.length, 16);
  assert.equal(totalSeconds, 240);
});
