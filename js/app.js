import { createBoard3d } from "./board3d.js";
import { createEngine } from "./engine-bridge.js";
import {
  DIFFICULTY_MS,
  START_KFEN,
  destSq,
  fromSq,
  parseKfen,
} from "./kuba.js";

const el = {
  status: document.getElementById("status"),
  coach: document.getElementById("coach"),
  scoreYou: document.getElementById("score-you"),
  scoreFoe: document.getElementById("score-foe"),
  toast: document.getElementById("toast"),
  difficulty: document.getElementById("difficulty"),
  side: document.getElementById("side"),
  movetime: document.getElementById("movetime"),
  kfen: document.getElementById("kfen"),
  engineInfo: document.getElementById("engine-info"),
  playPanel: document.getElementById("play-panel"),
  learnPanel: document.getElementById("learn-panel"),
  puzzlePanel: document.getElementById("puzzle-panel"),
  learnStep: document.getElementById("learn-step"),
  puzzleStatus: document.getElementById("puzzle-status"),
  puzzleProgress: document.getElementById("puzzle-progress"),
  canvas: document.getElementById("board-canvas"),
  btnLearnBack: document.getElementById("btn-learn-back"),
  btnLearnNext: document.getElementById("btn-learn-next"),
};

const LEARN_STEPS = [
  {
    text: "Kuba is a marble game on a 7×7 board. You have white marbles; the reds are neutral prizes.",
    select: -1,
  },
  {
    text: "On your turn, push a straight line of touching marbles one square. Tap a white marble with a legal push.",
    select: "first-legal",
  },
  {
    text: "Glowing dots show where that push goes. A dot past the edge means a marble falls off the board.",
    select: "keep",
  },
  {
    text: "Knocking a red off scores a point. First to 7 reds wins. You can also win by removing the opponent’s last marble.",
    select: -1,
  },
  {
    text: "You’re ready. Open Play and try a game — Kahu takes the other side at Medium speed.",
    select: -1,
  },
];

const state = {
  mode: "play",
  ready: false,
  busy: false,
  kfen: START_KFEN,
  legal: [],
  winner: 0,
  stm: 0,
  history: [START_KFEN],
  moveList: [],
  lastMove: "",
  pendingMove: null,
  flipped: false,
  humanIsWhite: true,
  hintMove: "",
  hintOnly: false,
  learnIndex: 0,
  puzzles: [],
  puzzleIndex: 0,
  puzzleStep: 0,
  puzzlePhase: "user",
};

const engine = createEngine({ assetV: "2" });

const board = createBoard3d(el.canvas, {
  onPick(hit) {
    if (!state.ready || state.busy || board.animating) return;
    if (state.mode === "learn") {
      handleLearnPick(hit);
      return;
    }
    if (state.winner && state.mode === "play") return;

    if (!hit) {
      clearSelection();
      return;
    }
    if (hit.type === "move") {
      playMove(hit.move);
      return;
    }
    if (hit.type === "sq") onSquare(hit.sq);
  },
});

let toastTimer = 0;
function toast(msg) {
  el.toast.hidden = !msg;
  el.toast.textContent = msg || "";
  clearTimeout(toastTimer);
  if (msg) {
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, 2800);
  }
}

function setCoach(text) {
  if (state.mode === "play") el.coach.textContent = text;
}

function movetimeMs() {
  const d = el.difficulty.value;
  if (DIFFICULTY_MS[d]) {
    el.movetime.value = String(DIFFICULTY_MS[d]);
    return DIFFICULTY_MS[d];
  }
  return Number(el.movetime.value) || 1000;
}

function humanToMove() {
  if (state.mode === "puzzles") return state.puzzlePhase === "user";
  if (state.mode === "learn") return false;
  return state.stm === (state.humanIsWhite ? 0 : 1);
}

function clearSelection() {
  state.hintMove = "";
  board.setSelection(-1, state.legal, "");
}

function syncScores() {
  const pos = parseKfen(state.kfen);
  if (state.humanIsWhite) {
    el.scoreYou.textContent = String(pos.capW);
    el.scoreFoe.textContent = String(pos.capB);
  } else {
    el.scoreYou.textContent = String(pos.capB);
    el.scoreFoe.textContent = String(pos.capW);
  }
}

function syncStatus() {
  if (!state.ready) {
    el.status.textContent = "Loading engine…";
    return;
  }
  if (state.mode === "learn") {
    el.status.textContent = "Learn the rules";
    syncScores();
    return;
  }
  if (state.winner === 1) {
    el.status.textContent = state.humanIsWhite ? "You win!" : "Kahu wins";
  } else if (state.winner === 2) {
    el.status.textContent = state.humanIsWhite ? "Kahu wins" : "You win!";
  } else if (state.busy && !humanToMove()) {
    el.status.textContent = "Kahu is thinking…";
  } else {
    const turn = state.stm === 0 ? "White" : "Black";
    el.status.textContent = humanToMove() ? `Your turn (${turn})` : `${turn} to move`;
  }
  syncScores();
  if (el.kfen) el.kfen.value = state.kfen;
}

function paintBoard(selected = -1) {
  board.setPosition(state.kfen, {
    legal: state.legal,
    selected,
    lastMove: state.lastMove,
    hintMove: state.hintMove,
  });
  syncStatus();
}

function onSquare(sq) {
  if (!humanToMove() || state.winner) return;

  if (board.selected >= 0) {
    const hit = state.legal.find((m) => fromSq(m) === board.selected && destSq(m) === sq);
    if (hit) {
      playMove(hit);
      return;
    }
  }

  const pos = parseKfen(state.kfen);
  const want = state.stm === 0 ? "W" : "B";
  if (pos.cells[sq] === want && state.legal.some((m) => fromSq(m) === sq)) {
    state.hintMove = "";
    board.setSelection(sq, state.legal, "");
    setCoach("Nice — now tap a glowing spot to push that line.");
  } else {
    clearSelection();
    setCoach("Tap one of your marbles that can push (it will highlight).");
  }
}

function playMove(move) {
  if (!state.ready || state.busy) return;
  if (state.mode === "puzzles") {
    const puzzle = state.puzzles[state.puzzleIndex];
    if (!puzzle) return;
    if (state.puzzlePhase === "user") {
      const accepted = puzzle.moves[state.puzzleStep] || [];
      if (!accepted.includes(move)) {
        toast("Not the idea — try another push, or Hint.");
        return;
      }
    } else if (state.puzzlePhase !== "reply") {
      return;
    }
  }
  state.busy = true;
  state.pendingMove = move;
  state.hintMove = "";
  board.setSelection(-1, state.legal, "");
  engine.move(move);
}

function applyPos(msg, fromMove) {
  if (msg.token !== undefined && msg.token !== engine.currentToken()) return;

  const prevKfen = state.kfen;
  const played = fromMove ? state.pendingMove : null;

  state.kfen = msg.kfen;
  state.legal = msg.legal || [];
  state.winner = msg.winner;
  state.stm = msg.stm;
  state.busy = false;

  const finish = () => {
    paintBoard(-1);
    if (state.mode === "puzzles") {
      afterPuzzlePos(!!played);
      return;
    }
    if (state.mode === "learn") {
      refreshLearnHighlight();
      return;
    }
    if (state.winner) {
      const youWon = state.winner === (state.humanIsWhite ? 1 : 2);
      setCoach(youWon
        ? "Seven reds — or the last marble. Well played."
        : "Tough game. Hit New game to try again.");
      toast(el.status.textContent);
      return;
    }
    if (humanToMove()) {
      setCoach("Your turn — tap a marble, then a glowing push.");
    } else {
      setCoach("Kahu is choosing a push…");
      maybeEngineTurn();
    }
  };

  if (played) {
    state.history.push(msg.kfen);
    state.moveList.push(played);
    state.lastMove = played;
    state.pendingMove = null;
    board.setPosition(prevKfen, { legal: [], selected: -1, lastMove: "", hintMove: "" });
    board.animatePush(played, msg.kfen, finish);
  } else {
    state.pendingMove = null;
    finish();
  }
}

function maybeEngineTurn() {
  if (!state.ready || state.winner || state.busy || state.mode !== "play") return;
  if (humanToMove()) return;
  state.busy = true;
  syncStatus();
  engine.search(movetimeMs());
}

function newGame() {
  engine.stop();
  state.humanIsWhite = el.side.value === "white";
  state.flipped = !state.humanIsWhite;
  board.setFlipped(state.flipped);
  state.history = [START_KFEN];
  state.moveList = [];
  state.lastMove = "";
  state.pendingMove = null;
  state.hintMove = "";
  state.hintOnly = false;
  state.busy = false;
  setCoach(state.humanIsWhite
    ? "You are White. Tap a marble, then a glowing spot."
    : "You are Black. Kahu moves first as White.");
  engine.set(START_KFEN);
}

function undo() {
  if (state.history.length <= 1 || state.busy || board.animating) return;
  engine.stop();
  let steps = state.mode === "play" && state.moveList.length >= 2 ? 2 : 1;
  for (let i = 0; i < steps && state.history.length > 1; i++) {
    state.history.pop();
    state.moveList.pop();
  }
  state.lastMove = state.moveList[state.moveList.length - 1] || "";
  state.pendingMove = null;
  state.hintMove = "";
  engine.set(state.history[state.history.length - 1]);
}

function requestHint() {
  if (!state.ready || state.busy || state.winner || !humanToMove()) return;
  state.busy = true;
  state.hintOnly = true;
  setCoach("Looking for a helpful push…");
  syncStatus();
  engine.search(Math.max(400, movetimeMs()));
}

function handleLearnPick(hit) {
  if (!hit || hit.type !== "sq") return;
  const step = LEARN_STEPS[state.learnIndex];
  if (!step || step.select !== "first-legal") return;
  const want = state.stm === 0 ? "W" : "B";
  const pos = parseKfen(state.kfen);
  if (pos.cells[hit.sq] === want && state.legal.some((m) => fromSq(m) === hit.sq)) {
    board.setSelection(hit.sq, state.legal, "");
    el.learnStep.textContent = "Glowing dots = legal pushes. Tap Next when you’re ready.";
  }
}

function refreshLearnHighlight() {
  const step = LEARN_STEPS[state.learnIndex];
  if (!step) return;
  if (step.select === "first-legal") {
    const sq = state.legal.length ? fromSq(state.legal[0]) : -1;
    board.setSelection(sq, state.legal, "");
  } else if (step.select !== "keep") {
    board.setSelection(-1, state.legal, "");
  }
}

function showLearnStep() {
  const step = LEARN_STEPS[state.learnIndex];
  el.learnStep.textContent = step ? step.text : "";
  el.btnLearnBack.disabled = state.learnIndex <= 0;
  el.btnLearnNext.textContent =
    state.learnIndex >= LEARN_STEPS.length - 1 ? "Go play" : "Next";
  refreshLearnHighlight();
  syncStatus();
}

function parsePuzzles(text) {
  const list = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;
    const kfen = parts.slice(0, 4).join(" ");
    const moves = [];
    for (let i = 4; i < parts.length; i++) moves.push([parts[i]]);
    list.push({ kfen, moves });
  }
  return list;
}

function openPuzzle(index) {
  if (!state.puzzles.length) return;
  state.puzzleIndex = ((index % state.puzzles.length) + state.puzzles.length) % state.puzzles.length;
  const puzzle = state.puzzles[state.puzzleIndex];
  state.puzzleStep = 0;
  state.puzzlePhase = "user";
  state.lastMove = "";
  state.hintMove = "";
  state.pendingMove = null;
  state.history = [puzzle.kfen];
  state.moveList = [];
  el.puzzleStatus.textContent = `Puzzle ${state.puzzleIndex + 1} — find the push.`;
  el.puzzleProgress.textContent = `${state.puzzleIndex + 1} / ${state.puzzles.length}`;
  engine.set(puzzle.kfen);
}

function afterPuzzlePos(fromMove) {
  const puzzle = state.puzzles[state.puzzleIndex];
  if (!puzzle || !fromMove) return;

  if (state.puzzlePhase === "reply") {
    state.puzzleStep += 1;
    if (state.puzzleStep >= puzzle.moves.length) {
      state.puzzlePhase = "done";
      el.puzzleStatus.textContent = "Solved — nice read.";
      toast("Puzzle solved");
    } else {
      state.puzzlePhase = "user";
      el.puzzleStatus.textContent = "Your turn again.";
    }
    return;
  }

  if (state.puzzlePhase === "user") {
    state.puzzleStep += 1;
    if (state.puzzleStep >= puzzle.moves.length) {
      state.puzzlePhase = "done";
      el.puzzleStatus.textContent = "Solved — nice read.";
      toast("Puzzle solved");
      return;
    }
    const reply = puzzle.moves[state.puzzleStep][0];
    state.puzzlePhase = "reply";
    el.puzzleStatus.textContent = "Good — reply coming…";
    setTimeout(() => {
      if (state.mode !== "puzzles" || state.puzzlePhase !== "reply") return;
      playMove(reply);
    }, 400);
  }
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.mode === mode ? "true" : "false");
  });
  el.playPanel.hidden = mode !== "play";
  el.learnPanel.hidden = mode !== "learn";
  el.puzzlePanel.hidden = mode !== "puzzles";

  engine.stop();
  state.hintOnly = false;
  if (mode === "learn") {
    state.learnIndex = 0;
    engine.set(START_KFEN);
    showLearnStep();
  } else if (mode === "puzzles") {
    if (state.puzzles.length) openPuzzle(state.puzzleIndex || 0);
    else el.puzzleStatus.textContent = "No puzzles loaded.";
  } else {
    newGame();
  }
  syncStatus();
}

engine.on((msg) => {
  if (msg.type === "error") {
    el.status.textContent = msg.error;
    state.busy = false;
    state.hintOnly = false;
    return;
  }
  if (msg.type === "ready") {
    state.ready = true;
    applyPos(msg, false);
    if (state.mode === "play") maybeEngineTurn();
    toast("Engine ready");
    return;
  }
  if (msg.type === "info") {
    if (el.engineInfo) {
      el.engineInfo.textContent = `depth ${msg.depth} · ${msg.nodes} nodes`;
    }
    if (state.hintOnly && msg.pv) {
      state.hintMove = msg.pv.split(/\s+/)[0] || "";
    }
    return;
  }
  if (msg.type === "pos") {
    if (msg.token !== undefined && msg.token !== engine.currentToken()) return;
    const played = !!state.pendingMove && msg.ok !== false;
    if (msg.ok === false) {
      state.pendingMove = null;
      state.busy = false;
      toast("Illegal push");
    }
    applyPos(msg, played);
    return;
  }
  if (msg.type === "search") {
    if (msg.gen !== undefined && msg.gen !== engine.currentSearchGen()) {
      state.busy = false;
      return;
    }
    const m = /bestmove\s+(\S+)/.exec(msg.raw || "");
    state.busy = false;
    if (state.hintOnly) {
      state.hintOnly = false;
      const hint = (m && m[1] !== "000" ? m[1] : state.hintMove) || "";
      state.hintMove = hint;
      if (hint) {
        board.setSelection(fromSq(hint), state.legal, hint);
        setCoach(`Hint: try pushing from ${hint.slice(0, 2)} toward ${hint[2]}.`);
      } else {
        setCoach("No hint this time — try selecting a marble.");
      }
      syncStatus();
      return;
    }
    if (m && m[1] && m[1] !== "000") playMove(m[1]);
    else applyPos(msg, false);
  }
});

document.querySelectorAll(".mode").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

document.getElementById("btn-new").onclick = () => newGame();
document.getElementById("btn-undo").onclick = () => undo();
document.getElementById("btn-flip").onclick = () => {
  state.flipped = !state.flipped;
  board.setFlipped(state.flipped);
};
document.getElementById("btn-hint").onclick = () => requestHint();
document.getElementById("btn-set").onclick = () => {
  const k = el.kfen.value.trim();
  if (!k) return;
  state.history = [k];
  state.moveList = [];
  state.lastMove = "";
  engine.set(k);
};
el.difficulty.onchange = () => movetimeMs();
el.side.onchange = () => newGame();

el.btnLearnNext.onclick = () => {
  if (state.learnIndex >= LEARN_STEPS.length - 1) {
    setMode("play");
    return;
  }
  state.learnIndex += 1;
  showLearnStep();
};
el.btnLearnBack.onclick = () => {
  state.learnIndex = Math.max(0, state.learnIndex - 1);
  showLearnStep();
};
document.getElementById("btn-learn-play").onclick = () => setMode("play");

document.getElementById("btn-puzzle-next").onclick = () => openPuzzle(state.puzzleIndex + 1);
document.getElementById("btn-puzzle-retry").onclick = () => openPuzzle(state.puzzleIndex);
document.getElementById("btn-puzzle-hint").onclick = () => {
  const puzzle = state.puzzles[state.puzzleIndex];
  if (!puzzle || state.puzzlePhase !== "user") return;
  const hint = (puzzle.moves[state.puzzleStep] || [])[0];
  if (!hint) return;
  state.hintMove = hint;
  board.setSelection(fromSq(hint), state.legal, hint);
  el.puzzleStatus.textContent = `Hint: look at ${hint.slice(0, 2)}.`;
};
document.getElementById("btn-puzzle-solution").onclick = () => {
  const puzzle = state.puzzles[state.puzzleIndex];
  if (!puzzle) return;
  el.puzzleStatus.textContent = "Solution: " + puzzle.moves.map((m) => m[0]).join(" · ");
};

movetimeMs();
board.setPosition(START_KFEN, { legal: [], selected: -1 });
syncStatus();
engine.init();

fetch("puzzles.txt")
  .then((r) => r.text())
  .then((t) => {
    state.puzzles = parsePuzzles(t);
    el.puzzleProgress.textContent = state.puzzles.length
      ? `0 / ${state.puzzles.length}`
      : "No puzzles";
  })
  .catch(() => {
    el.puzzleStatus.textContent = "Could not load puzzles.txt";
  });
