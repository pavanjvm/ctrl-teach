(function initCtrlTeachPageActionGate(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CtrlTeachPageActionGate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPageActionGateApi() {
  "use strict";

  function clean(value = "") {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function createActionGate({ now = Date.now, repeatQuietMs = 2500, historyLimit = 64 } = {}) {
    let sequence = 0;
    let active = null;
    const history = [];

    function begin({ owner = "page", observationId = "", actionKey = "", stateKey = "" } = {}) {
      const request = {
        owner: clean(owner),
        observationId: clean(observationId),
        actionKey: clean(actionKey),
        stateKey: clean(stateKey),
      };
      if (!request.actionKey) return { ok: false, reason: "invalid_action" };
      if (active) {
        return {
          ok: false,
          reason: "busy",
          activeOwner: active.owner,
        };
      }
      const duplicateObservation = history.some((item) => (
        request.observationId
        && item.observationId === request.observationId
        && item.actionKey === request.actionKey
      ));
      if (duplicateObservation) return { ok: false, reason: "duplicate_observation" };

      const recentUnchanged = history.find((item) => (
        item.actionKey === request.actionKey
        && item.stateKey === request.stateKey
        && now() - item.finishedAt < repeatQuietMs
      ));
      if (recentUnchanged) return { ok: false, reason: "unchanged_page" };

      const token = `page-action-${++sequence}`;
      active = { ...request, token, startedAt: now() };
      return { ok: true, token };
    }

    function isActive(token) {
      return Boolean(active && active.token === token);
    }

    function finish(token, { stateKey, outcome = "completed" } = {}) {
      if (!isActive(token)) return false;
      const completed = active;
      active = null;
      if (outcome !== "aborted") {
        history.unshift({
          ...completed,
          stateKey: clean(stateKey === undefined ? completed.stateKey : stateKey),
          outcome: clean(outcome),
          finishedAt: now(),
        });
        history.splice(historyLimit);
      }
      return true;
    }

    function abort(token) {
      return finish(token, { outcome: "aborted" });
    }

    function snapshot() {
      return {
        active: active ? { ...active } : null,
        history: history.map((item) => ({ ...item })),
      };
    }

    return { abort, begin, finish, isActive, snapshot };
  }

  function labelTokens(value = "") {
    return clean(value)
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9_-]*/g)
      ?.filter((token) => !["the", "a", "an", "to", "for", "button", "link"].includes(token)) || [];
  }

  function chooseScrollCandidate(candidates = [], { direction = "down", label = "", viewportHeight = 0 } = {}) {
    const tokens = labelTokens(label);
    const wantedDown = direction !== "up";
    const eligible = candidates
      .filter((candidate) => candidate && Number.isFinite(candidate.top) && Number.isFinite(candidate.bottom))
      .filter((candidate) => wantedDown ? candidate.bottom > viewportHeight : candidate.top < 0)
      .map((candidate) => {
        const text = clean(candidate.text).toLowerCase();
        const matches = tokens.filter((token) => text.includes(token)).length;
        const fullMatch = tokens.length > 0 && matches === tokens.length;
        const distance = wantedDown
          ? Math.max(0, candidate.top - viewportHeight)
          : Math.max(0, -candidate.bottom);
        return { candidate, distance, fullMatch, matches };
      });
    const matched = tokens.length ? eligible.filter((item) => item.fullMatch) : eligible;
    matched.sort((first, second) => (
      Number(second.fullMatch) - Number(first.fullMatch)
      || second.matches - first.matches
      || first.distance - second.distance
      || Number(second.candidate.actionable) - Number(first.candidate.actionable)
    ));
    return matched[0]?.candidate || null;
  }

  function absoluteScrollTop({ currentTop = 0, viewportHeight = 0, scrollHeight = 0, direction = "down" } = {}) {
    const step = Math.max(240, Number(viewportHeight) * 0.72);
    const maxTop = Math.max(0, Number(scrollHeight) - Number(viewportHeight));
    const requested = Number(currentTop) + (direction === "up" ? -step : step);
    return Math.max(0, Math.min(maxTop, Math.round(requested)));
  }

  return { absoluteScrollTop, chooseScrollCandidate, createActionGate, labelTokens };
});
