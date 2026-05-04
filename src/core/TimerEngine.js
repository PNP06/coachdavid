const FINISHED_INDEX_OFFSET = 1;

export class TimerEngine {
  constructor({ phases = [], state = null, now = () => Date.now() } = {}) {
    this.now = now;
    this.listeners = new Map();
    this.load(phases);

    if (state) {
      this.restore(state);
    }
  }

  on(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  load(phases = [], meta = {}) {
    this.phases = phases.map((phase, index) => normalizePhase(phase, index));
    this.meta = { ...meta };
    this.status = "idle";
    this.currentIndex = 0;
    this.currentPhaseStartedAt = null;
    this.currentPhaseElapsedBeforeStartMs = 0;
    this.sessionStartedAt = null;
    this.pausedAt = null;
    this.pausedDurationMs = 0;
    this.finishedAt = null;
    this._emit("tick", this.getSnapshot(false));
  }

  start(phases, meta = this.meta) {
    if (Array.isArray(phases)) {
      this.load(phases, meta);
    }

    if (!this.phases.length) {
      return this.getSnapshot(false);
    }

    const timestamp = this.now();
    this.status = "running";
    this.currentIndex = Math.min(this.currentIndex, this.phases.length - 1);
    this.currentPhaseStartedAt = timestamp;
    this.sessionStartedAt = this.sessionStartedAt ?? timestamp;
    this.pausedAt = null;
    this.finishedAt = null;
    this._emit("start", this.getSnapshot(false));
    return this.tick();
  }

  pause() {
    if (this.status !== "running") {
      return this.getSnapshot();
    }

    const timestamp = this.now();
    this.currentPhaseElapsedBeforeStartMs += timestamp - this.currentPhaseStartedAt;
    this.currentPhaseStartedAt = null;
    this.pausedAt = timestamp;
    this.status = "paused";
    const snapshot = this.getSnapshot(false);
    this._emit("pause", snapshot);
    this._emit("tick", snapshot);
    return snapshot;
  }

  resume() {
    if (this.status !== "paused") {
      return this.getSnapshot();
    }

    const timestamp = this.now();
    if (this.pausedAt !== null) {
      this.pausedDurationMs += timestamp - this.pausedAt;
    }

    this.currentPhaseStartedAt = timestamp;
    this.pausedAt = null;
    this.status = "running";
    const snapshot = this.getSnapshot(false);
    this._emit("resume", snapshot);
    this._emit("tick", snapshot);
    return snapshot;
  }

  togglePause() {
    return this.status === "running" ? this.pause() : this.resume();
  }

  reset() {
    const phases = this.phases;
    const meta = this.meta;
    this.load(phases, meta);
    const snapshot = this.getSnapshot(false);
    this._emit("reset", snapshot);
    return snapshot;
  }

  terminate() {
    return this._finish(false);
  }

  completeManual() {
    return this.next({ manual: true });
  }

  next(details = {}) {
    if (!this.phases.length || this.status === "finished") {
      return this.getSnapshot(false);
    }

    const previous = this.phases[this.currentIndex] ?? null;
    if (this.currentIndex >= this.phases.length - 1) {
      return this._finish(false, { previous, ...details });
    }

    this.currentIndex += 1;
    this.currentPhaseElapsedBeforeStartMs = 0;
    this.currentPhaseStartedAt = this.status === "running" ? this.now() : null;
    const snapshot = this.getSnapshot(false);
    this._emit("phaseChange", {
      previous,
      current: this.phases[this.currentIndex],
      automatic: false,
      snapshot,
      ...details
    });
    this._emit("tick", snapshot);
    return snapshot;
  }

  previous() {
    if (!this.phases.length || this.currentIndex <= 0 || this.status === "finished") {
      return this.getSnapshot(false);
    }

    const previous = this.phases[this.currentIndex] ?? null;
    this.currentIndex -= 1;
    this.currentPhaseElapsedBeforeStartMs = 0;
    this.currentPhaseStartedAt = this.status === "running" ? this.now() : null;
    const snapshot = this.getSnapshot(false);
    this._emit("phaseChange", {
      previous,
      current: this.phases[this.currentIndex],
      automatic: false,
      backwards: true,
      snapshot
    });
    this._emit("tick", snapshot);
    return snapshot;
  }

  addTime(seconds) {
    const phase = this.phases[this.currentIndex];
    if (!phase || phase.durationSec === null) {
      return this.getSnapshot();
    }

    const snapshot = this.getSnapshot(false);
    const remainingMs = snapshot.phaseRemainingMs ?? 0;
    const elapsedMs = snapshot.phaseElapsedMs;
    const nextRemainingMs = Math.max(0, remainingMs + seconds * 1000);
    phase.durationSec = Math.max(0, (elapsedMs + nextRemainingMs) / 1000);

    const updatedSnapshot = this.tick();
    this._emit("timeAdjust", { seconds, snapshot: updatedSnapshot });
    return updatedSnapshot;
  }

  tick() {
    this._advance();
    const snapshot = this.getSnapshot(false);
    this._emit("tick", snapshot);
    return snapshot;
  }

  getSnapshot(advance = true) {
    if (advance) {
      this._advance();
    }

    return this._buildSnapshot();
  }

  serialize() {
    return {
      phases: this.phases,
      meta: this.meta,
      status: this.status,
      currentIndex: this.currentIndex,
      currentPhaseStartedAt: this.currentPhaseStartedAt,
      currentPhaseElapsedBeforeStartMs: this.currentPhaseElapsedBeforeStartMs,
      sessionStartedAt: this.sessionStartedAt,
      pausedAt: this.pausedAt,
      pausedDurationMs: this.pausedDurationMs,
      finishedAt: this.finishedAt
    };
  }

  restore(state) {
    this.phases = Array.isArray(state.phases)
      ? state.phases.map((phase, index) => normalizePhase(phase, index))
      : [];
    this.meta = { ...(state.meta ?? {}) };
    this.status = state.status ?? "idle";
    this.currentIndex = Math.max(0, Number(state.currentIndex) || 0);
    this.currentPhaseStartedAt = state.currentPhaseStartedAt ?? null;
    this.currentPhaseElapsedBeforeStartMs = Number(state.currentPhaseElapsedBeforeStartMs) || 0;
    this.sessionStartedAt = state.sessionStartedAt ?? null;
    this.pausedAt = state.pausedAt ?? null;
    this.pausedDurationMs = Number(state.pausedDurationMs) || 0;
    this.finishedAt = state.finishedAt ?? null;

    if (this.status === "running" && this.currentPhaseStartedAt === null) {
      this.currentPhaseStartedAt = this.now();
    }

    if (this.status !== "finished") {
      this.currentIndex = Math.min(this.currentIndex, Math.max(0, this.phases.length - 1));
    }

    const snapshot = this.tick();
    this._emit("restore", snapshot);
    return snapshot;
  }

  _advance() {
    if (this.status !== "running" || !this.phases.length) {
      return;
    }

    let guard = 0;
    while (guard < this.phases.length + FINISHED_INDEX_OFFSET) {
      guard += 1;
      const phase = this.phases[this.currentIndex];
      if (!phase) {
        this._finish(true);
        return;
      }

      const durationMs = getPhaseDurationMs(phase);
      if (durationMs === null) {
        return;
      }

      const timestamp = this.now();
      const elapsedMs = this.currentPhaseElapsedBeforeStartMs + (timestamp - this.currentPhaseStartedAt);
      if (elapsedMs < durationMs) {
        return;
      }

      const overflowMs = Math.max(0, elapsedMs - durationMs);
      const previous = phase;

      if (this.currentIndex >= this.phases.length - 1) {
        this._finish(true, { previous });
        return;
      }

      this.currentIndex += 1;
      this.currentPhaseStartedAt = timestamp;
      this.currentPhaseElapsedBeforeStartMs = getPhaseDurationMs(this.phases[this.currentIndex]) === null ? 0 : overflowMs;
      const snapshot = this.getSnapshot(false);
      this._emit("phaseChange", {
        previous,
        current: this.phases[this.currentIndex],
        automatic: true,
        snapshot
      });
    }
  }

  _finish(automatic = true, details = {}) {
    if (this.status === "finished") {
      return this.getSnapshot(false);
    }

    const timestamp = this.now();
    this.status = "finished";
    this.currentIndex = this.phases.length;
    this.currentPhaseStartedAt = null;
    this.currentPhaseElapsedBeforeStartMs = 0;
    this.finishedAt = timestamp;
    if (this.pausedAt !== null) {
      this.pausedDurationMs += timestamp - this.pausedAt;
      this.pausedAt = null;
    }

    const snapshot = this.getSnapshot(false);
    this._emit("finish", { automatic, snapshot, ...details });
    this._emit("tick", snapshot);
    return snapshot;
  }

  _buildSnapshot() {
    const timestamp = this.now();
    const current = this.status === "finished" ? null : this.phases[this.currentIndex] ?? null;
    const phaseDurationMs = current ? getPhaseDurationMs(current) : null;
    const phaseElapsedMs = current
      ? getCurrentPhaseElapsedMs(this, timestamp)
      : 0;
    const phaseRemainingMs = phaseDurationMs === null
      ? null
      : Math.max(0, phaseDurationMs - phaseElapsedMs);
    const totalFiniteMs = this.phases.reduce((total, phase) => total + (getPhaseDurationMs(phase) ?? 0), 0);
    const completedFiniteMs = this.status === "finished"
      ? totalFiniteMs
      : this.phases.slice(0, this.currentIndex).reduce((total, phase) => total + (getPhaseDurationMs(phase) ?? 0), 0)
        + (phaseDurationMs === null ? 0 : Math.min(phaseElapsedMs, phaseDurationMs));
    const totalRemainingMs = this.status === "finished"
      ? 0
      : (phaseRemainingMs ?? 0)
        + this.phases.slice(this.currentIndex + 1).reduce((total, phase) => total + (getPhaseDurationMs(phase) ?? 0), 0);
    const progress = totalFiniteMs > 0
      ? Math.min(1, completedFiniteMs / totalFiniteMs)
      : this.phases.length > 0
        ? Math.min(1, this.currentIndex / this.phases.length)
        : 0;
    const pausedMs = this.pausedDurationMs
      + (this.status === "paused" && this.pausedAt !== null ? timestamp - this.pausedAt : 0);
    const actualDurationMs = this.sessionStartedAt === null
      ? 0
      : Math.max(0, (this.finishedAt ?? timestamp) - this.sessionStartedAt - pausedMs);

    return {
      status: this.status,
      meta: this.meta,
      phases: this.phases,
      currentIndex: this.currentIndex,
      totalPhases: this.phases.length,
      current,
      previous: this.currentIndex > 0 ? this.phases[this.currentIndex - 1] : null,
      next: this.status === "finished" ? null : this.phases[this.currentIndex + 1] ?? null,
      phaseDurationMs,
      phaseElapsedMs,
      phaseRemainingMs,
      totalRemainingMs,
      progress,
      actualDurationMs,
      isActive: this.status === "running" || this.status === "paused",
      isRunning: this.status === "running",
      isPaused: this.status === "paused",
      isFinished: this.status === "finished",
      isManualPhase: current ? phaseDurationMs === null : false
    };
  }

  _emit(type, payload) {
    this.listeners.get(type)?.forEach((listener) => listener(payload));
  }
}

function normalizePhase(phase, index) {
  return {
    id: phase.id ?? `phase-${index + 1}`,
    label: phase.label ?? `Bloc ${index + 1}`,
    type: phase.type ?? "work",
    durationSec: phase.durationSec === null ? null : Math.max(0, Number(phase.durationSec) || 0),
    instruction: phase.instruction ?? "",
    rpe: phase.rpe ?? "",
    reps: phase.reps ?? "",
    series: phase.series ?? null,
    totalSeries: phase.totalSeries ?? null,
    round: phase.round ?? null,
    totalRounds: phase.totalRounds ?? null,
    manualLabel: phase.manualLabel ?? "Terminé",
    isRest: Boolean(phase.isRest || phase.type === "rest"),
    isRecovery: Boolean(phase.isRecovery || phase.type === "rest" || phase.type === "cooldown")
  };
}

function getPhaseDurationMs(phase) {
  if (!phase || phase.durationSec === null) {
    return null;
  }

  return Math.max(0, phase.durationSec * 1000);
}

function getCurrentPhaseElapsedMs(engine, timestamp) {
  if (engine.status === "running" && engine.currentPhaseStartedAt !== null) {
    return Math.max(0, engine.currentPhaseElapsedBeforeStartMs + timestamp - engine.currentPhaseStartedAt);
  }

  return Math.max(0, engine.currentPhaseElapsedBeforeStartMs);
}
