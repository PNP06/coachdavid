import { HistoryManager } from "../core/HistoryManager.js";
import { PresetManager } from "../core/PresetManager.js";
import { SoundManager } from "../core/SoundManager.js";
import { TimerEngine } from "../core/TimerEngine.js";
import { WakeLockManager } from "../core/WakeLockManager.js";
import { MODE_BUILDERS, MODE_ORDER } from "../modes/index.js";
import { StrengthRestTimer } from "../modes/StrengthRestTimer.js";
import { clampNumber, escapeHtml, formatDuration, readNumber } from "../utils/time.js";
import { TimerDisplay } from "./TimerDisplay.js";

const QUICK_RESTS = [60, 90, 120, 180];

export class FreeTimer {
  constructor(root) {
    this.root = root;
    this.engine = new TimerEngine();
    this.sound = new SoundManager();
    this.presets = new PresetManager();
    this.history = new HistoryManager();
    this.wakeLock = new WakeLockManager();
    this.timerDisplay = new TimerDisplay();
    this.mode = "simple";
    this.activeMode = null;
    this.activeTitle = "";
    this.selectedRestSeconds = 90;
    this.showHistory = false;
    this.amrapRounds = 0;
    this.completion = null;
    this.lastCountdownKey = "";
    this.lastInterruptedSave = 0;
    this.configs = Object.fromEntries(
      MODE_ORDER.map((mode) => [
        mode,
        this.presets.recent(mode) ?? MODE_BUILDERS[mode].defaults()
      ])
    );

    this.bindEvents();
    this.bindEngine();
    this.render();
    this.startTicker();
  }

  bindEvents() {
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("input", (event) => this.handleInput(event));
    this.root.addEventListener("submit", (event) => event.preventDefault());
    document.addEventListener("visibilitychange", () => {
      this.engine.tick();
      this.updateDisplay();
    });
    window.addEventListener("beforeunload", () => {
      this.persistInterrupted(this.engine.getSnapshot());
    });
  }

  bindEngine() {
    this.engine.on("phaseChange", ({ previous }) => {
      this.lastCountdownKey = "";
      if (previous?.isRest) {
        this.sound.playRestEnd();
      } else {
        this.sound.playPhaseChange();
      }
    });

    this.engine.on("finish", ({ snapshot, previous }) => {
      if (previous?.isRest) {
        this.sound.playRestEnd();
        window.setTimeout(() => this.sound.playFinish(), 460);
      } else {
        this.sound.playFinish();
      }
      this.wakeLock.release();
      this.presets.clearInterrupted();
      this.completion = this.createCompletion(snapshot);
      this.render();
    });

    this.engine.on("tick", (snapshot) => {
      this.playCountdownCue(snapshot);
      this.persistInterrupted(snapshot);
      this.updateDisplay(snapshot);
    });
  }

  startTicker() {
    window.setInterval(() => this.engine.tick(), 250);
  }

  render() {
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="app-header">
          <div>
            <p class="eyebrow">Coach David</p>
            <h1>Minuteur libre</h1>
          </div>
          <div class="audio-strip">
            <span data-audio-status>${escapeHtml(this.sound.statusLabel())}</span>
            <label class="switch">
              <input type="checkbox" data-audio-muted ${this.sound.muted ? "checked" : ""} />
              <span>Silence</span>
            </label>
            <label class="volume-control">
              <span>Volume</span>
              <input type="range" min="0" max="1" step="0.05" value="${this.sound.volume}" data-audio-volume />
            </label>
            <label class="switch">
              <input type="checkbox" data-vibration ${this.sound.vibrationEnabled ? "checked" : ""} />
              <span>Vibration</span>
            </label>
            <button type="button" data-action="audio-test">Test son</button>
            <span class="wake-status" data-wakelock-status>${escapeHtml(this.wakeLock.lastMessage)}</span>
          </div>
        </header>

        ${this.renderResumeBanner()}

        <section class="quick-mode-bar" aria-label="Accès rapides">
          ${MODE_ORDER.map((mode) => `
            <button type="button" data-action="set-mode" data-mode="${mode}" class="${this.mode === mode && !this.showHistory ? "is-active" : ""}">
              ${escapeHtml(MODE_BUILDERS[mode].label)}
            </button>
          `).join("")}
          <button type="button" data-action="show-history" class="${this.showHistory ? "is-active" : ""}">Séances enregistrées</button>
        </section>

        <div class="main-layout">
          <section class="session-area">
            <div id="timer-display-root"></div>
            ${this.renderQuickRest()}
            ${this.renderCompletion()}
          </section>

          <aside class="config-area">
            ${this.showHistory ? this.renderHistoryPanel() : this.renderConfigPanel()}
          </aside>
        </div>
      </div>
    `;

    this.timerDisplay.mount(this.root.querySelector("#timer-display-root"));
    this.updateDisplay();
  }

  renderResumeBanner() {
    const interrupted = this.presets.interrupted();
    const snapshot = this.engine.getSnapshot(false);
    if (!interrupted || snapshot.isActive) {
      return "";
    }

    return `
      <section class="resume-banner">
        <strong>Timer interrompu</strong>
        <span>${escapeHtml(interrupted.title || interrupted.activeTitle || "Séance en cours")}</span>
        <button type="button" data-action="resume-interrupted">Reprendre</button>
        <button type="button" data-action="discard-interrupted">Effacer</button>
      </section>
    `;
  }

  renderQuickRest() {
    return `
      <section class="quick-rest-panel">
        <div>
          <h2>Repos muscu rapide</h2>
          <p>${this.selectedRestSeconds}s sélectionnées</p>
        </div>
        <div class="quick-rest-buttons">
          ${QUICK_RESTS.map((seconds) => `
            <button type="button" data-action="quick-rest" data-seconds="${seconds}" class="${this.selectedRestSeconds === seconds ? "is-active" : ""}">
              ${seconds < 120 ? `${seconds} s` : `${seconds / 60} min`}
            </button>
          `).join("")}
        </div>
        <button type="button" class="restart-rest" data-action="restart-rest">Relancer le repos</button>
      </section>
    `;
  }

  renderConfigPanel() {
    const last = this.presets.last();
    return `
      <section class="panel-section">
        <div class="panel-heading">
          <h2>Créer vite</h2>
          ${last ? `<button type="button" data-action="start-last">Relancer dernier</button>` : ""}
        </div>
        <div class="preset-grid">
          ${this.presets.all().map((preset) => `
            <button type="button" data-action="apply-preset" data-preset-id="${preset.id}">
              ${escapeHtml(preset.label)}
            </button>
          `).join("")}
        </div>
      </section>

      <section class="panel-section">
        <div class="mode-tabs">
          ${MODE_ORDER.map((mode) => `
            <button type="button" data-action="set-mode" data-mode="${mode}" class="${this.mode === mode ? "is-active" : ""}">
              ${escapeHtml(MODE_BUILDERS[mode].label)}
            </button>
          `).join("")}
        </div>
        ${this.renderModeForm()}
      </section>
    `;
  }

  renderModeForm() {
    const config = this.configs[this.mode] ?? MODE_BUILDERS[this.mode].defaults();
    return `
      <form class="timer-form" data-mode-form="${this.mode}">
        ${renderFormForMode(this.mode, config)}
        <div class="form-actions">
          <button type="button" class="start-button" data-action="start-current">Démarrer</button>
          <button type="button" data-action="save-preset">Enregistrer preset</button>
        </div>
      </form>
    `;
  }

  renderHistoryPanel() {
    const history = this.history.all();
    return `
      <section class="panel-section history-panel">
        <div class="panel-heading">
          <h2>Séances enregistrées</h2>
          <button type="button" data-action="set-mode" data-mode="${this.mode}">Retour timer</button>
        </div>
        ${history.length ? `
          <div class="history-list">
            ${history.map((entry) => `
              <article class="history-item">
                <strong>${escapeHtml(entry.name || "Activité libre")}</strong>
                <span>${escapeHtml(formatHistoryDate(entry.date))} · ${escapeHtml(entry.type || "autre")} · ${formatDuration(entry.durationMs || 0)}</span>
                <span>RPE ${escapeHtml(entry.rpe || "-")}${entry.rounds !== undefined ? ` · ${entry.rounds} tours` : ""}</span>
                ${entry.comment ? `<p>${escapeHtml(entry.comment)}</p>` : ""}
              </article>
            `).join("")}
          </div>
        ` : `<p class="empty-state">Aucune séance enregistrée.</p>`}
      </section>
    `;
  }

  renderCompletion() {
    if (!this.completion) {
      return "";
    }

    return `
      <section class="completion-panel">
        <h2>Enregistrer comme séance réalisée</h2>
        <form data-completion-form>
          <label>
            <span>Activité</span>
            <input name="name" value="${escapeHtml(this.completion.name)}" />
          </label>
          <label>
            <span>Type</span>
            <select name="type">
              ${["cardio", "muscu", "natation", "mobilité", "récupération", "autre"].map((type) => `
                <option value="${type}" ${this.completion.type === type ? "selected" : ""}>${type}</option>
              `).join("")}
            </select>
          </label>
          <label>
            <span>Durée réelle</span>
            <input value="${formatDuration(this.completion.durationMs)}" readonly />
          </label>
          <label>
            <span>RPE ressenti</span>
            <input name="rpe" type="number" min="1" max="10" value="${escapeHtml(this.completion.rpe)}" />
          </label>
          ${this.completion.mode === "amrap" ? `
            <label>
              <span>Tours réalisés</span>
              <input name="rounds" type="number" min="0" value="${this.amrapRounds}" />
            </label>
          ` : ""}
          <label class="full-row">
            <span>Commentaire</span>
            <textarea name="comment" rows="2"></textarea>
          </label>
          <div class="form-actions">
            <button type="button" data-action="save-history">Enregistrer</button>
            <button type="button" data-action="dismiss-completion">Ignorer</button>
          </div>
        </form>
      </section>
    `;
  }

  async handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === "set-mode") {
      this.saveCurrentFormConfig();
      this.mode = button.dataset.mode;
      this.showHistory = false;
      this.render();
      return;
    }

    if (action === "show-history") {
      this.saveCurrentFormConfig();
      this.showHistory = true;
      this.render();
      return;
    }

    if (action === "apply-preset") {
      this.applyPreset(button.dataset.presetId);
      return;
    }

    if (action === "start-current") {
      await this.startMode(this.mode);
      return;
    }

    if (action === "start-last") {
      await this.startLast();
      return;
    }

    if (action === "save-preset") {
      this.savePreset();
      return;
    }

    if (action === "quick-rest") {
      this.selectedRestSeconds = Number(button.dataset.seconds) || 90;
      await this.startQuickRest(this.selectedRestSeconds);
      return;
    }

    if (action === "restart-rest") {
      await this.startQuickRest(this.selectedRestSeconds);
      return;
    }

    if (action === "add-circuit-block") {
      this.addCircuitBlock(button.dataset.blockType);
      return;
    }

    if (action === "remove-circuit-block") {
      this.removeCircuitBlock(Number(button.dataset.index));
      return;
    }

    if (action === "toggle-pause") {
      await this.sound.unlock();
      this.engine.togglePause();
      if (this.engine.getSnapshot(false).isRunning) {
        await this.wakeLock.request();
      } else {
        await this.wakeLock.release();
      }
      this.updateAudioStatus();
      return;
    }

    if (action === "reset-timer") {
      this.engine.reset();
      this.presets.clearInterrupted();
      await this.wakeLock.release();
      this.completion = null;
      this.updateDisplay();
      return;
    }

    if (action === "finish-timer") {
      this.engine.terminate();
      return;
    }

    if (action === "next-phase") {
      await this.sound.unlock();
      this.engine.next();
      return;
    }

    if (action === "previous-phase") {
      await this.sound.unlock();
      this.engine.previous();
      return;
    }

    if (action === "add-time") {
      this.engine.addTime(Number(button.dataset.seconds) || 0);
      return;
    }

    if (action === "manual-complete") {
      await this.sound.unlock();
      this.engine.completeManual();
      return;
    }

    if (action === "amrap-plus") {
      this.amrapRounds += 1;
      this.updateDisplay();
      return;
    }

    if (action === "amrap-minus") {
      this.amrapRounds = Math.max(0, this.amrapRounds - 1);
      this.updateDisplay();
      return;
    }

    if (action === "audio-test") {
      await this.sound.test();
      this.updateAudioStatus();
      return;
    }

    if (action === "resume-interrupted") {
      await this.resumeInterrupted();
      return;
    }

    if (action === "discard-interrupted") {
      this.presets.clearInterrupted();
      this.render();
      return;
    }

    if (action === "save-history") {
      this.saveHistory();
      return;
    }

    if (action === "dismiss-completion") {
      this.completion = null;
      this.render();
      return;
    }

    if (action === "fullscreen-toggle") {
      this.toggleFullscreen();
    }
  }

  handleInput(event) {
    if (event.target.matches("[data-audio-muted]")) {
      this.sound.setMuted(event.target.checked);
      this.updateAudioStatus();
    }

    if (event.target.matches("[data-audio-volume]")) {
      this.sound.setVolume(event.target.value);
      this.updateAudioStatus();
    }

    if (event.target.matches("[data-vibration]")) {
      this.sound.setVibration(event.target.checked);
    }
  }

  async startMode(mode) {
    this.saveCurrentFormConfig();
    const builder = MODE_BUILDERS[mode];
    const config = this.configs[mode];
    const phases = builder.build(config);
    if (!phases.length) {
      window.alert("Durée invalide.");
      return;
    }

    await this.sound.unlock();
    this.completion = null;
    this.activeMode = mode;
    this.activeTitle = builder.describe(config);
    this.amrapRounds = 0;
    this.engine.start(phases, { mode, title: this.activeTitle, config });
    this.presets.saveLast(mode, config);
    await this.wakeLock.request();
    this.render();
  }

  async startQuickRest(durationSec) {
    await this.sound.unlock();
    this.completion = null;
    this.showHistory = false;
    this.activeMode = "quickRest";
    this.activeTitle = `${durationSec}s repos`;
    this.engine.start(StrengthRestTimer.quickRest(durationSec), {
      mode: "quickRest",
      title: this.activeTitle,
      config: { durationSec }
    });
    this.presets.saveLast("quickRest", { durationSec });
    await this.wakeLock.request();
    this.render();
  }

  async startLast() {
    const last = this.presets.last();
    if (!last) {
      return;
    }

    if (last.mode === "quickRest") {
      this.selectedRestSeconds = last.config.durationSec || 90;
      await this.startQuickRest(this.selectedRestSeconds);
      return;
    }

    this.mode = last.mode;
    this.configs[last.mode] = last.config;
    await this.startMode(last.mode);
  }

  applyPreset(id) {
    const preset = this.presets.find(id);
    if (!preset) {
      return;
    }

    if (preset.mode === "quickRest") {
      this.selectedRestSeconds = preset.config.durationSec || 90;
      this.startQuickRest(this.selectedRestSeconds);
      return;
    }

    this.saveCurrentFormConfig();
    this.mode = preset.mode;
    this.configs[preset.mode] = structuredCloneSafe(preset.config);
    this.showHistory = false;
    this.render();
  }

  savePreset() {
    this.saveCurrentFormConfig();
    const label = window.prompt("Nom du preset");
    if (!label?.trim()) {
      return;
    }

    this.presets.saveCustom(label.trim(), this.mode, this.configs[this.mode]);
    this.render();
  }

  addCircuitBlock(type = "time") {
    this.saveCurrentFormConfig();
    this.configs.circuit.blocks.push({
      name: type === "rest" ? "Repos" : type === "reps" ? "Exercice reps" : "Travail",
      type,
      durationSec: type === "rest" ? 20 : 40,
      reps: type === "reps" ? "10" : "",
      instruction: "",
      rpe: ""
    });
    this.render();
  }

  removeCircuitBlock(index) {
    this.saveCurrentFormConfig();
    if (this.configs.circuit.blocks.length <= 1) {
      return;
    }

    this.configs.circuit.blocks.splice(index, 1);
    this.render();
  }

  saveCurrentFormConfig() {
    const form = this.root.querySelector("[data-mode-form]");
    if (!form) {
      return;
    }

    this.configs[this.mode] = this.collectConfig(this.mode, form);
  }

  collectConfig(mode, form = this.root.querySelector("[data-mode-form]")) {
    const formData = new FormData(form);

    if (mode === "simple") {
      return {
        name: String(formData.get("name") || ""),
        minutes: clampNumber(readNumber(formData, "minutes", 0), 0, 999),
        seconds: clampNumber(readNumber(formData, "seconds", 0), 0, 59),
        rpe: String(formData.get("rpe") || "")
      };
    }

    if (mode === "interval" || mode === "tabata") {
      return {
        workSeconds: clampNumber(readNumber(formData, "workSeconds", 30), 1, 999),
        restSeconds: clampNumber(readNumber(formData, "restSeconds", 90), 0, 999),
        series: clampNumber(readNumber(formData, "series", 8), 1, 99),
        warmupMinutes: clampNumber(readNumber(formData, "warmupMinutes", 0), 0, 999),
        warmupSeconds: clampNumber(readNumber(formData, "warmupSeconds", 0), 0, 59),
        cooldownMinutes: clampNumber(readNumber(formData, "cooldownMinutes", 0), 0, 999),
        cooldownSeconds: clampNumber(readNumber(formData, "cooldownSeconds", 0), 0, 59),
        instruction: String(formData.get("instruction") || ""),
        rpe: String(formData.get("rpe") || "")
      };
    }

    if (mode === "circuit") {
      return {
        rounds: clampNumber(readNumber(formData, "rounds", 4), 1, 99),
        blocks: Array.from(form.querySelectorAll("[data-circuit-block]")).map((row) => ({
          name: row.querySelector("[name='blockName']")?.value || "",
          type: row.querySelector("[name='blockType']")?.value || "time",
          durationSec: clampNumber(row.querySelector("[name='blockDuration']")?.value, 1, 999),
          reps: row.querySelector("[name='blockReps']")?.value || "",
          instruction: row.querySelector("[name='blockInstruction']")?.value || "",
          rpe: row.querySelector("[name='blockRpe']")?.value || ""
        }))
      };
    }

    if (mode === "emom") {
      return {
        totalMinutes: clampNumber(readNumber(formData, "totalMinutes", 10), 0, 999),
        totalSeconds: clampNumber(readNumber(formData, "totalSeconds", 0), 0, 59),
        roundSeconds: clampNumber(readNumber(formData, "roundSeconds", 60), 1, 999),
        instruction: String(formData.get("instruction") || "")
      };
    }

    if (mode === "amrap") {
      return {
        totalMinutes: clampNumber(readNumber(formData, "totalMinutes", 12), 0, 999),
        totalSeconds: clampNumber(readNumber(formData, "totalSeconds", 0), 0, 59),
        exercises: String(formData.get("exercises") || "")
      };
    }

    return {
      exercise: String(formData.get("exercise") || ""),
      sets: clampNumber(readNumber(formData, "sets", 4), 1, 99),
      restSeconds: clampNumber(readNumber(formData, "restSeconds", 90), 1, 999)
    };
  }

  async resumeInterrupted() {
    const interrupted = this.presets.interrupted();
    if (!interrupted?.engine) {
      return;
    }

    this.activeMode = interrupted.activeMode ?? interrupted.engine.meta?.mode ?? null;
    this.activeTitle = interrupted.activeTitle ?? interrupted.engine.meta?.title ?? "";
    this.mode = interrupted.mode ?? (this.activeMode in MODE_BUILDERS ? this.activeMode : this.mode);
    this.amrapRounds = interrupted.amrapRounds ?? 0;
    this.engine.restore(interrupted.engine);
    if (this.engine.getSnapshot(false).isRunning) {
      await this.sound.unlock();
      await this.wakeLock.request();
    }
    this.render();
  }

  saveHistory() {
    const form = this.root.querySelector("[data-completion-form]");
    if (!form || !this.completion) {
      return;
    }

    const formData = new FormData(form);
    this.history.add({
      name: String(formData.get("name") || this.completion.name),
      type: String(formData.get("type") || this.completion.type),
      durationMs: this.completion.durationMs,
      rpe: String(formData.get("rpe") || ""),
      comment: String(formData.get("comment") || ""),
      mode: this.completion.mode,
      rounds: this.completion.mode === "amrap" ? Number(formData.get("rounds") || this.amrapRounds) : undefined
    });
    this.completion = null;
    this.showHistory = true;
    this.render();
  }

  createCompletion(snapshot) {
    const mode = this.activeMode ?? snapshot.meta.mode ?? "simple";
    return {
      mode,
      name: snapshot.meta.title || this.activeTitle || "Activité libre",
      durationMs: snapshot.actualDurationMs,
      rpe: snapshot.meta.config?.rpe || "",
      type: defaultTypeForMode(mode)
    };
  }

  playCountdownCue(snapshot) {
    if (!snapshot.isRunning || snapshot.phaseRemainingMs === null || snapshot.phaseRemainingMs > 3100) {
      return;
    }

    const remainingSecond = Math.ceil(snapshot.phaseRemainingMs / 1000);
    if (remainingSecond < 1 || remainingSecond > 3) {
      return;
    }

    const key = `${snapshot.currentIndex}-${remainingSecond}`;
    if (key !== this.lastCountdownKey) {
      this.lastCountdownKey = key;
      this.sound.playCountdown();
    }
  }

  persistInterrupted(snapshot) {
    if (!snapshot.isActive) {
      return;
    }

    const now = Date.now();
    if (now - this.lastInterruptedSave < 1000) {
      return;
    }

    this.lastInterruptedSave = now;
    this.presets.saveInterrupted({
      engine: this.engine.serialize(),
      activeMode: this.activeMode,
      activeTitle: this.activeTitle,
      mode: this.mode,
      amrapRounds: this.amrapRounds,
      title: this.activeTitle
    });
  }

  updateDisplay(snapshot = this.engine.getSnapshot(false)) {
    this.timerDisplay.update(snapshot, {
      activeMode: this.activeMode,
      activeTitle: this.activeTitle,
      amrapRounds: this.amrapRounds
    });
    this.updateAudioStatus();
  }

  updateAudioStatus() {
    const status = this.root.querySelector("[data-audio-status]");
    if (status) {
      status.textContent = this.sound.statusLabel();
    }
    const wakeStatus = this.root.querySelector("[data-wakelock-status]");
    if (wakeStatus) {
      wakeStatus.textContent = this.wakeLock.lastMessage;
    }
  }

  async toggleFullscreen() {
    const display = this.root.querySelector("[data-timer-display]");
    if (!display) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await display.requestFullscreen?.();
    await this.wakeLock.request();
    this.updateAudioStatus();
  }
}

function renderFormForMode(mode, config) {
  if (mode === "simple") {
    return `
      <div class="form-grid">
        ${field("Nom", `<input name="name" value="${escapeHtml(config.name || "")}" placeholder="vélo, nage, mobilité" />`)}
        ${field("RPE cible", `<input name="rpe" type="number" min="1" max="10" value="${escapeHtml(config.rpe || "")}" />`)}
        ${field("Minutes", `<input name="minutes" type="number" min="0" value="${config.minutes ?? 20}" />`)}
        ${field("Secondes", `<input name="seconds" type="number" min="0" max="59" value="${config.seconds ?? 0}" />`)}
      </div>
    `;
  }

  if (mode === "interval" || mode === "tabata") {
    return `
      <div class="form-grid">
        ${field("Effort", `<input name="workSeconds" type="number" min="1" value="${config.workSeconds ?? 30}" /><small>s</small>`)}
        ${field("Repos", `<input name="restSeconds" type="number" min="0" value="${config.restSeconds ?? 90}" /><small>s</small>`)}
        ${field("Séries", `<input name="series" type="number" min="1" value="${config.series ?? 8}" />`)}
        ${field("RPE cible", `<input name="rpe" type="number" min="1" max="10" value="${escapeHtml(config.rpe || "")}" />`)}
        ${field("Échauffement min", `<input name="warmupMinutes" type="number" min="0" value="${config.warmupMinutes ?? 0}" />`)}
        ${field("Échauffement s", `<input name="warmupSeconds" type="number" min="0" max="59" value="${config.warmupSeconds ?? 0}" />`)}
        ${field("Retour calme min", `<input name="cooldownMinutes" type="number" min="0" value="${config.cooldownMinutes ?? 0}" />`)}
        ${field("Retour calme s", `<input name="cooldownSeconds" type="number" min="0" max="59" value="${config.cooldownSeconds ?? 0}" />`)}
        ${field("Consigne", `<input name="instruction" value="${escapeHtml(config.instruction || "")}" />`, "full-row")}
      </div>
    `;
  }

  if (mode === "circuit") {
    const blocks = config.blocks?.length ? config.blocks : [];
    return `
      <div class="form-grid">
        ${field("Tours", `<input name="rounds" type="number" min="1" value="${config.rounds ?? 4}" />`)}
      </div>
      <div class="circuit-list">
        ${blocks.map((block, index) => renderCircuitBlock(block, index)).join("")}
      </div>
      <div class="circuit-actions">
        <button type="button" data-action="add-circuit-block" data-block-type="time">+ Temps</button>
        <button type="button" data-action="add-circuit-block" data-block-type="reps">+ Reps</button>
        <button type="button" data-action="add-circuit-block" data-block-type="rest">+ Repos</button>
      </div>
    `;
  }

  if (mode === "emom") {
    return `
      <div class="form-grid">
        ${field("Durée min", `<input name="totalMinutes" type="number" min="0" value="${config.totalMinutes ?? 10}" />`)}
        ${field("Durée s", `<input name="totalSeconds" type="number" min="0" max="59" value="${config.totalSeconds ?? 0}" />`)}
        ${field("Round", `<input name="roundSeconds" type="number" min="1" value="${config.roundSeconds ?? 60}" /><small>s</small>`)}
        ${field("Consigne", `<input name="instruction" value="${escapeHtml(config.instruction || "")}" />`, "full-row")}
      </div>
    `;
  }

  if (mode === "amrap") {
    return `
      <div class="form-grid">
        ${field("Durée min", `<input name="totalMinutes" type="number" min="0" value="${config.totalMinutes ?? 12}" />`)}
        ${field("Durée s", `<input name="totalSeconds" type="number" min="0" max="59" value="${config.totalSeconds ?? 0}" />`)}
        ${field("Exercices / reps", `<textarea name="exercises" rows="5">${escapeHtml(config.exercises || "")}</textarea>`, "full-row")}
      </div>
    `;
  }

  return `
    <div class="form-grid">
      ${field("Exercice", `<input name="exercise" value="${escapeHtml(config.exercise || "")}" />`, "full-row")}
      ${field("Séries prévues", `<input name="sets" type="number" min="1" value="${config.sets ?? 4}" />`)}
      ${field("Repos", `<input name="restSeconds" type="number" min="1" value="${config.restSeconds ?? 90}" /><small>s</small>`)}
    </div>
  `;
}

function renderCircuitBlock(block, index) {
  return `
    <article class="circuit-block" data-circuit-block>
      <div class="circuit-block-header">
        <strong>Bloc ${index + 1}</strong>
        <button type="button" data-action="remove-circuit-block" data-index="${index}">Retirer</button>
      </div>
      <div class="form-grid">
        ${field("Nom", `<input name="blockName" value="${escapeHtml(block.name || "")}" />`)}
        ${field("Type", `
          <select name="blockType">
            ${["time", "reps", "rest"].map((type) => `<option value="${type}" ${block.type === type ? "selected" : ""}>${typeLabel(type)}</option>`).join("")}
          </select>
        `)}
        ${field("Durée", `<input name="blockDuration" type="number" min="1" value="${block.durationSec ?? 40}" /><small>s</small>`)}
        ${field("Reps", `<input name="blockReps" value="${escapeHtml(block.reps || "")}" />`)}
        ${field("Consigne", `<input name="blockInstruction" value="${escapeHtml(block.instruction || "")}" />`)}
        ${field("RPE", `<input name="blockRpe" type="number" min="1" max="10" value="${escapeHtml(block.rpe || "")}" />`)}
      </div>
    </article>
  `;
}

function field(label, control, className = "") {
  return `
    <label class="field ${className}">
      <span>${label}</span>
      <div class="field-control">${control}</div>
    </label>
  `;
}

function typeLabel(type) {
  if (type === "reps") {
    return "Reps";
  }

  if (type === "rest") {
    return "Repos";
  }

  return "Temps";
}

function defaultTypeForMode(mode) {
  if (mode === "strength" || mode === "quickRest") {
    return "muscu";
  }

  if (mode === "simple") {
    return "cardio";
  }

  return "autre";
}

function formatHistoryDate(value) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}
