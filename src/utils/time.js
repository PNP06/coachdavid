export function secondsFromParts(minutes = 0, seconds = 0) {
  const safeMinutes = Number.isFinite(Number(minutes)) ? Number(minutes) : 0;
  const safeSeconds = Number.isFinite(Number(seconds)) ? Number(seconds) : 0;
  return Math.max(0, Math.round(safeMinutes * 60 + safeSeconds));
}

export function clampNumber(value, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return min;
  }
  return Math.min(max, Math.max(min, numericValue));
}

export function formatDuration(ms, { showHours = true, manualLabel = "MANUEL" } = {}) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return manualLabel;
  }

  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (showHours && hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function splitSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  return {
    minutes: Math.floor(safeSeconds / 60),
    seconds: safeSeconds % 60
  };
}

export function createId(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function readNumber(formData, name, fallback = 0) {
  const value = Number(formData.get(name));
  return Number.isFinite(value) ? value : fallback;
}
