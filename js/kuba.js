/** Shared Kuba / KFEN helpers (no engine). */

export const START_KFEN = "WW3BB/WW1R1BB/2RRR2/1RRRRR1/2RRR2/BB1R1WW/BB3WW w 0 0";
export const FILES = "abcdefg";

export function parseKfen(kfen) {
  const parts = (kfen || "").trim().split(/\s+/);
  const cells = Array(49).fill(".");
  let i = 0;
  for (const ch of parts[0] || "") {
    if (ch === "/") continue;
    if (ch >= "1" && ch <= "9") i += Number(ch);
    else if (i < 49) cells[i++] = ch;
  }
  return {
    cells,
    stm: parts[1] === "b" ? 1 : 0,
    capW: Number(parts[2] || 0),
    capB: Number(parts[3] || 0),
  };
}

export function sqOf(file, rank) {
  return (7 - rank) * 7 + (file - 1);
}

export function fromSq(move) {
  return sqOf(move.charCodeAt(0) - 96, Number(move[1]));
}

export function destSq(move) {
  const file = move.charCodeAt(0) - 96;
  const rank = Number(move[1]);
  const dir = move[2];
  let f = file;
  let r = rank;
  if (dir === "N") r += 1;
  else if (dir === "S") r -= 1;
  else if (dir === "E") f += 1;
  else if (dir === "W") f -= 1;
  if (f < 1 || f > 7 || r < 1 || r > 7) return -1;
  return sqOf(f, r);
}

/** Destination in board space, or a point just off the edge for off-board pushes. */
export function destPoint(move) {
  const file = move.charCodeAt(0) - 96;
  const rank = Number(move[1]);
  const dir = move[2];
  let f = file;
  let r = rank;
  if (dir === "N") r += 1;
  else if (dir === "S") r -= 1;
  else if (dir === "E") f += 1;
  else if (dir === "W") f -= 1;
  return { f, r, off: f < 1 || f > 7 || r < 1 || r > 7 };
}

export function sqToFileRank(sq) {
  const r = Math.floor(sq / 7);
  const c = sq % 7;
  return { file: c + 1, rank: 7 - r };
}

export const DIFFICULTY_MS = {
  easy: 300,
  medium: 1000,
  hard: 3000,
};
