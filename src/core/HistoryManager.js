const HISTORY_KEY = "coachDavid.timer.history";

export class HistoryManager {
  all() {
    return readHistory();
  }

  add(entry) {
    const history = readHistory();
    history.unshift({
      id: `history-${Date.now()}`,
      date: new Date().toISOString(),
      ...entry
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  }

  clear() {
    localStorage.removeItem(HISTORY_KEY);
  }
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
