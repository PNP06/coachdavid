import { AmrapTimer } from "./AmrapTimer.js";
import { CircuitTimer } from "./CircuitTimer.js";
import { EmomTimer } from "./EmomTimer.js";
import { IntervalTimer } from "./IntervalTimer.js";
import { SimpleTimer } from "./SimpleTimer.js";
import { StrengthRestTimer } from "./StrengthRestTimer.js";
import { TabataTimer } from "./TabataTimer.js";

export const MODE_BUILDERS = {
  simple: SimpleTimer,
  interval: IntervalTimer,
  circuit: CircuitTimer,
  emom: EmomTimer,
  amrap: AmrapTimer,
  tabata: TabataTimer,
  strength: StrengthRestTimer
};

export const MODE_ORDER = [
  "simple",
  "interval",
  "circuit",
  "emom",
  "amrap",
  "tabata",
  "strength"
];
