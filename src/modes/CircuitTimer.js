export class CircuitTimer {
  static id = "circuit";
  static label = "Circuit";

  static defaults() {
    return {
      rounds: 4,
      blocks: [
        {
          name: "Pompes",
          type: "time",
          durationSec: 40,
          reps: "",
          instruction: "Gainage fort",
          rpe: ""
        },
        {
          name: "Squats",
          type: "time",
          durationSec: 40,
          reps: "",
          instruction: "Amplitude propre",
          rpe: ""
        },
        {
          name: "Repos",
          type: "rest",
          durationSec: 60,
          reps: "",
          instruction: "Respirer",
          rpe: ""
        }
      ]
    };
  }

  static build(config) {
    const rounds = Math.max(1, Math.round(Number(config.rounds) || 1));
    const blocks = Array.isArray(config.blocks) ? config.blocks : [];
    const phases = [];

    for (let round = 1; round <= rounds; round += 1) {
      blocks.forEach((block, blockIndex) => {
        const type = block.type || "time";
        const isManual = type === "reps";
        const isRest = type === "rest";
        phases.push({
          label: block.name?.trim() || (isRest ? "Repos" : `Bloc ${blockIndex + 1}`),
          type: isRest ? "rest" : type,
          durationSec: isManual ? null : Math.max(1, Math.round(Number(block.durationSec) || 1)),
          reps: isManual ? block.reps || "" : "",
          instruction: block.instruction || "",
          rpe: block.rpe || "",
          round,
          totalRounds: rounds,
          isRest,
          manualLabel: isManual ? "Exercice terminé" : "Terminé"
        });
      });
    }

    return phases;
  }

  static describe(config) {
    return `Circuit × ${config.rounds || 1}`;
  }
}
