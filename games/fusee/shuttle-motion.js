// L’asset pointe vers la droite (0°). Les coordonnées écran ont leur axe Y vers le bas.
export function getShuttleHeading(from, to, previousRotation = 0) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 0.01) return null;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const flip = dx < 0 ? -1 : 1;
  const baseRotation = angle - (flip === -1 ? 180 : 0);
  const delta = ((baseRotation - previousRotation + 180) % 360 + 360) % 360 - 180;
  return { angle, flip, rotation:previousRotation + delta };
}

export function createShuttleMotion(element) {
  const image = element.querySelector('img');
  let current = null, target = null, rotation = 0, flip = 1;
  let queue = [], animations = [], idleWaiters = [], running = false, paused = false, generation = 0, destroyed = false;
  const translate = point => `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
  const orient = (angle, mirror, scale = '') => `rotate(${angle}deg) scaleX(${mirror})${scale}`;
  const finishIdle = () => { if (!running && !queue.length) idleWaiters.splice(0).forEach(resolve => resolve()); };
  const setPosition = point => { element.style.transform = translate(point); };
  const setHeading = heading => {
    rotation = heading.rotation; flip = heading.flip;
    image.style.transform = orient(rotation, flip);
    image.dataset.angle = String(heading.angle);
    image.dataset.rotation = String(rotation);
    image.dataset.flip = String(flip);
  };
  function cancel() {
    generation++;
    animations.forEach(animation => animation.cancel());
    animations = []; queue = []; running = false;
  }
  async function run() {
    if (running || paused || destroyed || !queue.length) { finishIdle(); return; }
    running = true;
    const version = generation, destination = queue.shift(), from = current;
    const heading = getShuttleHeading(from, destination, rotation);
    const priorRotation = rotation, priorFlip = flip;
    if (heading) setHeading(heading);
    // La navigation reste animée même si les animations décoratives sont réduites.
    if (typeof element.animate === 'function') {
      // Lors d’une symétrie, on pivote directement dans le nouveau repère pour
      // éviter un demi-tour inutile qui mettrait momentanément le cockpit à l’envers.
      element.dataset.motion = 'turning';
      const startRotation = priorFlip === flip ? priorRotation : rotation;
      const turn = image.animate([
        { transform:orient(startRotation, flip, ' scale(0.96, 1.04)') },
        { transform:orient(rotation, flip) }
      ], { duration:240, easing:'ease-in-out' });
      animations = [turn];
      await turn.finished.catch(() => {});
      if (version !== generation || destroyed) return;
      element.dataset.motion = 'moving';
      const travel = element.animate([
        { transform:translate(from) }, { transform:translate(destination) }
      ], { duration:700, easing:'ease-in-out', fill:'both' });
      const thrust = image.animate([
        { transform:orient(rotation, flip) },
        { transform:orient(rotation, flip, ' scale(1.07, 0.95)'), offset:0.3 },
        { transform:orient(rotation, flip) }
      ], { duration:700, easing:'ease-in-out' });
      animations = [travel, thrust];
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      if (version !== generation || destroyed) return;
    }
    current = destination;
    setPosition(current);
    animations.forEach(animation => animation.cancel());
    animations = []; running = false;
    element.dataset.motion = 'idle';
    if (queue.length) run(); else finishIdle();
  }
  return {
    moveTo(point, { instant = false } = {}) {
      if (destroyed) return;
      if (instant || !current) {
        cancel();
        current = target = { ...point };
        setPosition(current);
        element.dataset.motion = 'idle';
        finishIdle();
        return;
      }
      if (target && Math.hypot(point.x - target.x, point.y - target.y) < 0.01) return;
      target = { ...point }; queue.push(target); run();
    },
    whenIdle() { return !running && !queue.length ? Promise.resolve() : new Promise(resolve => idleWaiters.push(resolve)); },
    setPaused(value) {
      paused = value;
      animations.forEach(animation => paused ? animation.pause() : animation.play());
      if (!paused) run();
    },
    destroy() { destroyed = true; cancel(); finishIdle(); }
  };
}
