/** Thin Promise / event wrapper around the existing Kahu worker. */

export function createEngine({
  workerUrl = "worker.js",
  script = "kahu.js",
  nnue = "C16_C12_blind.nnue",
  assetV = "1",
} = {}) {
  const worker = new Worker(workerUrl + "?v=" + assetV);
  const listeners = new Set();
  let token = 0;
  let searchGen = 0;

  function emit(msg) {
    for (const fn of listeners) fn(msg);
  }

  worker.onmessage = (ev) => emit(ev.data);

  function on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function nextToken() {
    token += 1;
    return token;
  }

  function init() {
    worker.postMessage({
      cmd: "init",
      script: script + "?v=" + assetV,
      base: "./",
      nnue: nnue + "?v=" + assetV,
      v: assetV,
    });
  }

  function set(kfen) {
    const t = nextToken();
    worker.postMessage({ cmd: "set", kfen, token: t });
    return t;
  }

  function reset() {
    const t = nextToken();
    worker.postMessage({ cmd: "reset", token: t });
    return t;
  }

  function move(moveStr) {
    const t = nextToken();
    worker.postMessage({ cmd: "move", move: moveStr, token: t });
    return t;
  }

  function search(ms) {
    searchGen += 1;
    const gen = searchGen;
    worker.postMessage({ cmd: "search", ms, gen });
    return gen;
  }

  function stop() {
    searchGen += 1;
    worker.postMessage({ cmd: "stop" });
    return searchGen;
  }

  function currentToken() {
    return token;
  }

  function currentSearchGen() {
    return searchGen;
  }

  return {
    on,
    init,
    set,
    reset,
    move,
    search,
    stop,
    currentToken,
    currentSearchGen,
    worker,
  };
}
