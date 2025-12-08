import { PLAYER_1, PLAYER_2, SYSTEM } from "@rcade/plugin-input-classic";
import {
  PLAYER_1 as SPINNER_1,
  PLAYER_2 as SPINNER_2,
} from "@rcade/plugin-input-spinners";
import "./style.css";
import { CELL, GLYPH_BLOCK, GLYPHS } from "./glyphs";

const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 240;

const COLUMNS = 80;
const ROWS = 24; // QBasic used 25 rows

const PIXELS_PER_COLUMN = SCREEN_WIDTH / COLUMNS;
const PIXELS_PER_ROW = SCREEN_HEIGHT / ROWS;

const QUANTIZATION = 3;
const VELOCITY = 1 / QUANTIZATION;

type AppState = "title" | "prepre" | "pre" | "level" | "post";

let state: AppState = "title";

interface ScreenPosition {
  x: number;
  y: number;
}

interface GridPosition {
  u: number;
  v: number;
}

const U_MAX = COLUMNS - 1;
const V_MAX = ROWS * 2 - 1;
const CELL_WIDTH = PIXELS_PER_COLUMN;
const CELL_HEIGHT = PIXELS_PER_ROW / 2;

type Heading = number;
const RIGHT = 0;
const DOWN = Math.PI / 2;
const LEFT = Math.PI;
const UP = (Math.PI * 3) / 2;

type Color = { r: number; g: number; b: number };
const BLUE = { r: 0, g: 0, b: 255 };
const WHITE = { r: 255, g: 255, b: 255 };
const YELLOW = { r: 255, g: 255, b: 0 };
const MAGENTA = { r: 255, g: 0, b: 255 };
const SALMON = { r: 255, g: 85, b: 85 };

type Alpha = number;
const TRIAL = 0;
const MATURE = 255;
const YOUNG = MATURE - 2 * QUANTIZATION;

let collectable = 1;
let collectablePosition = { u: 0, v: 0 };

interface Snake {
  front: GridPosition;
  trail: (GridPosition | null)[];
  length: number;
  heading: Heading;
  lives: number;
  score: number;
  quanta: number | null;
  name: string;
  color: Color;
  // TODO hack
  lastSpinner: number | null;
}

const snakes: Snake[] = [];

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <canvas id=canvas width=${SCREEN_WIDTH} height=${SCREEN_HEIGHT}></canvas>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const ctx = canvas.getContext("2d")!;

const bitmap = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

function cls() {
  for (let i = 0; i < bitmap.data.length; i++) {
    bitmap.data[i] = i % 4 < 2 ? 0 : 255; // blue
  }
}

type PixelOp = (pos: ScreenPosition, color: Color) => boolean;

function paint({ x, y }: ScreenPosition, color: Color, alpha: Alpha = MATURE) {
  const index = (y * SCREEN_WIDTH + x) * 4;
  if (index + 3 >= bitmap.data.length) return false;
  bitmap.data[index] = color.r;
  bitmap.data[index + 1] = color.g;
  bitmap.data[index + 2] = color.b;
  bitmap.data[index + 3] = alpha;
  return true;
}

function trial(pos: ScreenPosition, color: Color) {
  const collision = !mature(pos, BLUE);

  // TODO clean up
  const { x, y } = pos;
  const index = (y * SCREEN_WIDTH + x) * 4;
  if (!collision || bitmap.data[index + 3] === TRIAL) {
    paint(pos, color, TRIAL);
  }

  return true;
}

function equals(pos: ScreenPosition, color: Color, alpha: Alpha = TRIAL) {
  const { x, y } = pos;
  const index = (y * SCREEN_WIDTH + x) * 4;
  return (
    bitmap.data[index] === color.r &&
    bitmap.data[index + 1] === color.g &&
    bitmap.data[index + 2] === color.b &&
    bitmap.data[index + 3] === alpha
  );
}

function mature(pos: ScreenPosition, color: Color) {
  return equals(pos, color, MATURE);
}

// TODO dedupe w/ equals
function safe(pos: ScreenPosition, color: Color) {
  const { x, y } = pos;
  const index = (y * SCREEN_WIDTH + x) * 4;
  return (
    bitmap.data[index] === color.r &&
    bitmap.data[index + 1] === color.g &&
    bitmap.data[index + 2] === color.b &&
    bitmap.data[index + 3] < MATURE
  );
}

function graduate(pos: ScreenPosition, _color: Color) {
  const { x, y } = pos;
  const index = (y * SCREEN_WIDTH + x) * 4;
  bitmap.data[index + 3] = YOUNG;
  return true;
}

function age(pos: GridPosition) {
  const x0 = Math.round(pos.u * CELL_WIDTH);
  const y0 = Math.round(pos.v * CELL_HEIGHT);

  // FIXME dimensions should be clamped
  for (let x = x0 - 10; x < x0 + 10; x++) {
    for (let y = y0 - 10; y < y0 + 10; y++) {
      const index = (y * SCREEN_WIDTH + x) * 4;
      if (bitmap.data[index + 3] >= YOUNG && bitmap.data[index + 3] < MATURE) {
        bitmap.data[index + 3]++;
      }
    }
  }
}

function blit(
  pos: ScreenPosition | GridPosition,
  glyph: boolean[][],
  color: Color,
  op: PixelOp = paint,
  { all = true }: { all?: boolean } = {}
) {
  if ("u" in pos) {
    const x = Math.round(pos.u * CELL_WIDTH);
    const y = Math.round(pos.v * CELL_HEIGHT);
    pos = { x, y };
  }

  let ret = all;
  for (const [dy, row] of glyph.entries()) {
    for (const [dx, fill] of row.entries()) {
      if (fill) {
        const one = op({ x: pos.x + dx, y: pos.y + dy }, color);
        ret = all ? ret && one : ret || one;
      }
    }
  }
  return ret;
}

function apply(
  pos: ScreenPosition | GridPosition,
  color: Color,
  op: PixelOp = paint
) {
  if ("x" in pos) {
    return op(pos, color);
  } else {
    return blit(pos, CELL, color, op);
  }
}

function erase(pos: GridPosition) {
  blit(pos, CELL, BLUE);
}

function hrule(v: number, u1: number, u2: number) {
  for (let u = u1; u <= u2; u++) apply({ u, v }, SALMON);
}

function vrule(u: number, v1: number, v2: number) {
  for (let v = v1; v <= v2; v++) apply({ u, v }, SALMON);
}

function text(pos: GridPosition, s: string) {
  for (const [i, ch] of [...s].entries()) {
    const blitPos = { u: pos.u + i * 2, v: pos.v };
    blit(blitPos, GLYPH_BLOCK, BLUE);
    blit(blitPos, GLYPHS[ch], WHITE);
  }
}

function center(row: number, s: string) {
  text({ u: COLUMNS / 2 - s.length, v: row * 2 }, s);
}

function header() {
  for (let u = 0; u <= U_MAX; u++) {
    erase({ u, v: 0 });
    erase({ u, v: 1 });
  }

  if (snakes.length === 0) return;

  const p1 = snakes[0];
  const p2 = snakes.length > 1 ? snakes[1] : null;

  // TODO pad
  const left = `${p1.score} Lives: ${p1.lives} <-${p1.name.toUpperCase()}`;
  text({ u: 0, v: 0 }, left);

  if (p2) {
    const right = `${p2.name.toUpperCase()}-> Lives: ${p2.lives} ${p2.score}`;
    const u = U_MAX - right.length * 2 + 1;
    text({ u, v: 0 }, right);
  }
}

function title(msg: string = "Nibbles!") {
  cls();
  center(0, msg);
  center(11, "Press P1 or P2");
  level = 0;
  state = "title";
}

function lose() {
  title("G A M E   O V E R");
}

function win() {
  title("You win!");
}

function addSnake(name: string, color: Color) {
  snakes.push({
    front: { u: 0, v: 0 },
    trail: [],
    length: QUANTIZATION,
    heading: RIGHT,
    lives: 5,
    score: 0,
    quanta: QUANTIZATION,
    name,
    color,
    lastSpinner: null,
  });
}

type Spawn = [number, number, Heading];

interface Level {
  spawns: [Spawn, Spawn];
  walls: () => void;
}

const LEVELS: Record<string, Level> = {
  1: {
    spawns: [
      [30, 25, LEFT],
      [50, 25, RIGHT],
    ],
    walls: () => {},
  },
  2: {
    spawns: [
      [20, 43, LEFT],
      [60, 7, RIGHT],
    ],
    walls: () => hrule(25, 20, 60),
  },
  3: {
    spawns: [
      [30, 25, DOWN],
      [50, 25, UP],
    ],
    walls: () => {
      vrule(20, 10, 40);
      vrule(60, 10, 40);
    },
  },
  4: {
    spawns: [
      [20, 43, RIGHT],
      [60, 7, LEFT],
    ],
    walls: () => {
      vrule(20, 4, 30);
      vrule(60, 23, 49);
      hrule(38, 2, 40);
      hrule(15, 41, 79);
    },
  },
  5: {
    spawns: [
      [30, 25, DOWN],
      [50, 25, UP],
    ],
    walls: () => {
      vrule(21, 13, 39);
      vrule(59, 13, 39);
      hrule(11, 23, 57);
      hrule(41, 23, 57);
    },
  },
  6: {
    spawns: [
      [15, 43, UP],
      [65, 7, DOWN],
    ],
    walls: () => {
      for (let v = 4; v <= 49; v++) {
        if (v > 30 || v < 23) {
          apply({ u: 10, v }, SALMON);
          apply({ u: 20, v }, SALMON);
          apply({ u: 30, v }, SALMON);
          apply({ u: 40, v }, SALMON);
          apply({ u: 50, v }, SALMON);
          apply({ u: 60, v }, SALMON);
          apply({ u: 70, v }, SALMON);
        }
      }
    },
  },
  7: {
    spawns: [
      [15, 43, UP],
      [65, 7, DOWN],
    ],
    walls: () => {
      for (let v = 4; v <= 49; v += 2) {
        apply({ u: 40, v }, SALMON);
      }
    },
  },
  8: {
    spawns: [
      [15, 43, UP],
      [65, 7, DOWN],
    ],
    walls: () => {
      for (let v = 4; v <= 40; v++) {
        apply({ u: 10, v }, SALMON);
        apply({ u: 20, v: 53 - v }, SALMON);
        apply({ u: 30, v }, SALMON);
        apply({ u: 40, v: 53 - v }, SALMON);
        apply({ u: 50, v }, SALMON);
        apply({ u: 60, v: 53 - v }, SALMON);
        apply({ u: 70, v }, SALMON);
      }
    },
  },
  9: {
    spawns: [
      [5, 15, DOWN],
      [75, 40, UP],
    ],
    walls: () => {
      for (let v = 6; v <= 47; v++) {
        apply({ u: v, v }, SALMON);
        apply({ u: v + 28, v }, SALMON);
      }
    },
  },
  10: {
    spawns: [
      [15, 43, UP],
      [65, 7, DOWN],
    ],
    walls: () => {
      for (let v = 4; v <= 49; v += 2) {
        apply({ u: 10, v }, SALMON);
        apply({ u: 20, v: v + 1 }, SALMON);
        apply({ u: 30, v }, SALMON);
        apply({ u: 40, v: v + 1 }, SALMON);
        apply({ u: 50, v }, SALMON);
        apply({ u: 60, v: v + 1 }, SALMON);
        apply({ u: 70, v }, SALMON);
      }
    },
  },
};

function renderLevel() {
  cls();

  // Borders
  hrule(2, 0, U_MAX);
  hrule(V_MAX, 0, U_MAX);
  vrule(0, 2, V_MAX);
  vrule(U_MAX, 2, V_MAX);

  const { spawns, walls } = LEVELS[level];

  walls();

  for (const [i, snake] of snakes.entries()) {
    const [u, v, heading] = spawns[i];
    snake.front = { u, v };
    snake.trail = [];
    snake.heading = heading;
    snake.length = QUANTIZATION;
  }
}

let level = 0;
function nextLevel() {
  level++;
  if (!(level in LEVELS)) {
    win();
    return false;
  }

  renderLevel();

  dialog(`Level ${level}\nPress A`);
  state = "pre";
  return true;
}

function dialog(msg: string) {
  for (const [i, line] of msg.split("\n").entries()) {
    center(11 + i, line);
  }
}

function add(pos: GridPosition, heading: Heading, distance: number = VELOCITY) {
  let { u, v } = pos;
  u += distance * Math.cos(heading);
  v += distance * Math.sin(heading);
  return { u, v };
}

function placeCollectable() {
  while (true) {
    const u = Math.floor(Math.random() * (U_MAX + 1));
    const v = Math.floor(Math.random() * (V_MAX + 1));

    if (blit({ u, v }, GLYPHS[collectable], BLUE, mature)) {
      collectablePosition = { u, v };
      blit({ u, v }, GLYPHS[collectable], WHITE);
      break;
    }
  }
}

function turn(
  sammy: Snake,
  dpad: typeof PLAYER_1.DPAD,
  spinner: typeof SPINNER_1.SPINNER
) {
  if (sammy.lastSpinner == null) {
    sammy.lastSpinner = spinner.angle;
  } else if (spinner.angle != sammy.lastSpinner) {
    sammy.heading += spinner.angle - sammy.lastSpinner;
    sammy.lastSpinner = spinner.angle;
    sammy.quanta = null;
  }

  // TODO even stickier
  if (sammy.quanta) return;
  // TODO feels sticky
  if (dpad.up && sammy.heading !== DOWN) {
    sammy.heading = UP;
    // TODO clean up
    sammy.quanta = 0;
  } else if (dpad.down && sammy.heading !== UP) {
    sammy.heading = DOWN;
    sammy.quanta = 0;
  } else if (dpad.left && sammy.heading !== RIGHT) {
    sammy.heading = LEFT;
    sammy.quanta = 0;
  } else if (dpad.right && sammy.heading !== LEFT) {
    sammy.heading = RIGHT;
    sammy.quanta = 0;
  }
}

function tick() {
  if (state === "title") {
    if (SYSTEM.ONE_PLAYER) {
      snakes.length = 0;
      addSnake("Sammy", YELLOW);
      nextLevel();
    } else if (SYSTEM.TWO_PLAYER) {
      snakes.length = 0;
      addSnake("Sammy", YELLOW);
      addSnake("Jake", MAGENTA);
      nextLevel();
    }
  } else if (state === "prepre") {
    // Hack to debounce.
    if (!(PLAYER_1.A || PLAYER_1.B || PLAYER_2.A || PLAYER_2.B)) state = "pre";
  } else if (state === "pre") {
    if (PLAYER_1.A || PLAYER_1.B || PLAYER_2.A || PLAYER_2.B) {
      renderLevel();

      collectable = 1;
      placeCollectable();

      state = "level";
    }
  } else if (state === "post") {
    if (PLAYER_1.A || PLAYER_1.B || PLAYER_2.A || PLAYER_2.B) nextLevel();
  } else if (state === "level") {
    // Skip level debug cheat.
    if (PLAYER_1.A && PLAYER_1.B && PLAYER_2.A && PLAYER_2.B) {
      if (nextLevel()) state = "prepre";
      return;
    }

    for (const sammy of snakes) {
      // FIXME this will overage if two snake fronts are too close
      age(sammy.front);
      // FIXME quantum ticks should be scheduled globally not per snake
      if (sammy.quanta != null) sammy.quanta--;
    }

    turn(snakes[0], PLAYER_1.DPAD, SPINNER_1.SPINNER);
    if (snakes.length > 1) turn(snakes[1], PLAYER_2.DPAD, SPINNER_2.SPINNER);

    for (const sammy of snakes) {
      if (sammy.quanta) {
        sammy.trail.push(null);
      } else {
        sammy.trail.push(sammy.front);
        // TODO tidy
        sammy.front = add(
          sammy.front,
          sammy.heading,
          sammy.quanta == null ? VELOCITY : VELOCITY * QUANTIZATION
        );
        while (sammy.trail.length > sammy.length) {
          const [vacated] = sammy.trail.splice(0, 1);
          if (vacated) erase(vacated);
        }
      }
    }

    let collected = false;
    for (const sammy of snakes) {
      if (blit(sammy.front, CELL, WHITE, mature, { all: false })) {
        // TODO tweak
        sammy.length += collectable * 4 * QUANTIZATION;
        sammy.score += collectable * 10;
        collected = true;
      }
    }
    if (collected) {
      blit(collectablePosition, GLYPHS[collectable.toString()], BLUE);
      if (collectable === 9) {
        if (!nextLevel()) return;
      } else {
        collectable++;
        placeCollectable();
      }
    }

    // Extend snakes after truncating trail to allow snake front to occupy
    // vacated tail.
    for (const sammy of snakes) {
      if (sammy.quanta) continue;
      apply(sammy.front, sammy.color, trial);
    }

    // FIXME should collision detect in between quanta
    const dead = snakes.filter(
      (sammy) => !sammy.quanta && !apply(sammy.front, sammy.color, safe)
    );
    if (dead.length > 0) {
      for (const snake of dead) snake.lives--;
      if (dead.some(({ lives }) => lives === 0)) {
        lose();
      } else {
        dialog(dead.map(({ name }) => `${name} Dies!`).join("\n"));
        state = "pre";
      }
      // FIXME resolve trial colors
    }

    for (const sammy of snakes) {
      if (sammy.quanta) continue;
      apply(sammy.front, sammy.color, graduate);
      if (sammy.quanta === 0) sammy.quanta = QUANTIZATION;
    }

    header();
  }

  ctx.putImageData(bitmap, 0, 0);
}

cls();
title();

const speed = 50;
const speedScale = 1 - (speed - 50) / 100;
const renderInterval = (speedScale * 1000) / 30;
setInterval(tick, renderInterval);
