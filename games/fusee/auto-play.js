export const INACTIVITY_DELAY_MS = 4000;

// Une seule action par délai. Un changement d'étape ou une interaction annule
// l'ancienne action ; les animations et la pause fournissent une action nulle.
export function createInactivityController(getAction, {
  delayMs = INACTIVITY_DELAY_MS,
  schedule = setTimeout,
  unschedule = clearTimeout
} = {}) {
  let timer = null, pending = null, pendingDelay = null;
  const same = (a, b) => a && b && a.owner === b.owner && a.key === b.key;
  function cancel() {
    if (timer !== null) unschedule(timer);
    timer = null;
    pending = null;
    pendingDelay = null;
  }
  function refresh() {
    const action = getAction();
    const value = Number(typeof delayMs === 'function' ? delayMs() : delayMs);
    const delay = Number.isFinite(value) && value > 0 ? value : INACTIVITY_DELAY_MS;
    if (same(action, pending) && pendingDelay === delay) return;
    cancel();
    if (!action) return;
    pending = action;
    pendingDelay = delay;
    timer = schedule(() => {
      const expected = pending, current = getAction();
      timer = null;
      pending = null;
      pendingDelay = null;
      try {
        if (same(expected, current)) current.run();
      } finally {
        refresh();
      }
    }, delay);
  }
  return { refresh, cancel, touch() { cancel(); refresh(); } };
}

function resourceNeeds(game) {
  return Object.keys(game.config.targets).map(key => {
    const target = game.config.targets[key];
    const carried = game.players.reduce((sum, player) => sum + player.bag[key], 0);
    const missing = Math.max(0, target - game.stock[key] - carried);
    return { key, target, carried, missing };
  });
}

export function chooseAutomaticResource(game) {
  const usable = resourceNeeds(game).filter(r => r.target > 0
    && game.config.activities?.[r.key]?.snapshot?.config_json?.tool_id);
  // Tenir compte des sacs pour éviter de gagner inutilement la même ressource.
  usable.sort((a, b) => b.missing / b.target - a.missing / a.target
    || b.missing - a.missing
    || (a.carried + game.stock[a.key]) - (b.carried + game.stock[b.key]));
  return usable[0]?.key ?? null;
}

export function chooseAutomaticMove(game) {
  const options = game.options();
  if (!options.length) return null;
  const needs = resourceNeeds(game);
  const usefulLoad = needs.reduce((sum, r) => sum + Math.min(r.carried, Math.max(0, r.target - game.stock[r.key])), 0);
  const needsQuestions = needs.some(r => r.missing > 0);
  const nodes = game.board.nodes;
  const goals = Object.values(nodes).filter(node => !game.blocked[node.id]
    && (node.type === 'center' && usefulLoad > 0 || node.type === 'planet' && needsQuestions));
  function distanceToGoal(id) {
    const queue = [[id, 0]], seen = new Set([id]);
    for (let i = 0; i < queue.length; i++) {
      const [current, distance] = queue[i];
      if (goals.some(goal => goal.id === current)) return distance;
      for (const next of nodes[current].neighbors) {
        if (seen.has(next) || game.blocked[next]) continue;
        seen.add(next);
        queue.push([next, distance + 1]);
      }
    }
    return Infinity;
  }
  function score(path) {
    const end = nodes[path.at(-1)];
    const deposit = path.includes('c') && usefulLoad > 0;
    // Décharger d'abord, puis chercher une question ; éviter un événement
    // lorsque le dé permet d'atteindre directement une destination utile.
    let value = deposit ? 100 + Math.min(usefulLoad, 50) : 0;
    if (end.type === 'planet' && needsQuestions) {
      if (end.merchant) {
        const best = Math.max(...needs.map(r => r.target > 0 ? r.missing / r.target : 0));
        value += 34 + 12 * best;
      } else {
        const need = needs.find(r => r.key === end.resource);
        value += need?.target > 0 ? 26 + 18 * (need.missing / need.target) : 4;
      }
    }
    if (end.type === 'asteroid') value -= 5;
    value += 10 / (1 + distanceToGoal(end.id));
    if (deposit) value += 1 / (1 + path.indexOf('c'));
    return value;
  }
  let best = options[0], bestScore = -Infinity;
  function explore(id, steps, seen, path) {
    if (!steps) {
      const value = score(path);
      if (value > bestScore) { bestScore = value; best = path[0]; }
      return;
    }
    for (const next of nodes[id].neighbors) {
      if (seen.includes(next) || game.blocked[next]) continue;
      explore(next, steps - 1, [...seen, next], [...path, next]);
    }
  }
  for (const next of options) explore(next, game.remaining - 1, [...game.visited, next], [next]);
  return best;
}
