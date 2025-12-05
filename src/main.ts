import { PLAYER_1, PLAYER_2, SYSTEM } from "@rcade/plugin-input-classic";
import "./style.css";
import { CELL, GLYPHS } from "./glyphs";

const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 240;

const COLUMNS = 80;
const ROWS = 24; // QBasic used 25 rows

const PIXELS_PER_COLUMN = SCREEN_WIDTH / COLUMNS;
const PIXELS_PER_ROW = SCREEN_HEIGHT / ROWS;

type AppState = "title" | "pre" | "level" | "post";

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
const BLACK = { r: 0, g: 0, b: 0 }; // invalid color

type Alpha = number;
const TRIAL = 0;
const MATURE = 255;

let collectable = 1;
let collectablePosition = { u: 0, v: 0 };

interface Snake {
  front: GridPosition;
  trail: GridPosition[];
  length: number;
  heading: Heading;
  lives: number;
  score: number;
  name: string;
  color: Color;
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
  if (!mature(pos, BLUE)) color = BLACK;
  // FIXME only paint over mature blue or trial colors
  paint(pos, color, TRIAL);
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

function graduate(pos: ScreenPosition, _color: Color) {
  const { x, y } = pos;
  const index = (y * SCREEN_WIDTH + x) * 4;
  bitmap.data[index + 3] = MATURE;
  return true;
}

function blit(
  pos: ScreenPosition | GridPosition,
  glyph: boolean[][],
  color: Color,
  op: PixelOp = paint,
  { all = true }: { all?: boolean } = {}
) {
  if ("u" in pos) {
    const x = pos.u * CELL_WIDTH;
    const y = pos.v * CELL_HEIGHT;
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
    return trial(pos, color);
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
  for (const [i, ch] of [...s.toUpperCase()].entries()) {
    blit({ u: pos.u + i * 2, v: pos.v }, GLYPHS[ch], WHITE);
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
    length: 1,
    heading: RIGHT,
    lives: 5,
    score: 0,
    name,
    color,
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
    snake.length = 1;
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

function add(pos: GridPosition, heading: Heading, distance: number = 1) {
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

function turn(sammy: Snake, dpad: typeof PLAYER_1.DPAD) {
  // TODO feels sticky
  if (dpad.up && sammy.heading !== DOWN) {
    sammy.heading = UP;
  } else if (dpad.down && sammy.heading !== UP) {
    sammy.heading = DOWN;
  } else if (dpad.left && sammy.heading !== RIGHT) {
    sammy.heading = LEFT;
  } else if (dpad.right && sammy.heading !== LEFT) {
    sammy.heading = RIGHT;
  }
}

function tick() {
  if (state === "title") {
    if (SYSTEM.ONE_PLAYER) {
      snakes.length = 0;
      addSnake("Sammy", YELLOW);
      level = 0;
      nextLevel();
    } else if (SYSTEM.TWO_PLAYER) {
      snakes.length = 0;
      addSnake("Sammy", YELLOW);
      addSnake("Jake", MAGENTA);
      level = 0;
      nextLevel();
    }
  } else if (state === "pre") {
    if (PLAYER_1.A || PLAYER_1.B || PLAYER_2.A || PLAYER_2.B) {
      renderLevel();

      collectable = 1;
      placeCollectable();

      state = "level";
    }
  } else if (state === "post") {
    if (PLAYER_1.A || PLAYER_1.B || PLAYER_2.A || PLAYER_2.B) nextLevel();
  } else if (state.startsWith("level")) {
    // Skip level debug cheat.
    if (PLAYER_1.A && PLAYER_1.B && PLAYER_2.A && PLAYER_2.B) {
      nextLevel();
      return;
    }

    turn(snakes[0], PLAYER_1.DPAD);
    if (snakes.length > 1) turn(snakes[1], PLAYER_2.DPAD);

    for (const sammy of snakes) {
      sammy.trail.push(sammy.front);
      sammy.front = add(sammy.front, sammy.heading);
      if (sammy.trail.length > sammy.length) {
        const [vacated] = sammy.trail.splice(0, 1);
        erase(vacated);
      }
    }

    let collected = false;
    for (const sammy of snakes) {
      if (blit(sammy.front, CELL, WHITE, mature, { all: false })) {
        console.log("white");
        // TODO tweak
        sammy.length += collectable * 2;
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
      apply(sammy.front, sammy.color, trial);
    }

    const dead = snakes.filter(
      (sammy) => !apply(sammy.front, sammy.color, equals)
    );
    if (dead.length > 0) {
      for (const snake of dead) snake.lives--;
      if (dead.some(({ lives }) => lives === 0)) {
        lose();
      } else {
        dialog(dead.map(({ name }) => `${name} Dies!`).join("\n"));
        state = "post";
      }
      // FIXME resolve trial colors
    }

    for (const sammy of snakes) {
      apply(sammy.front, sammy.color, graduate);
    }

    header();
  }

  ctx.putImageData(bitmap, 0, 0);
}

cls();
title();

const speed = 50;
const speedScale = 1 - (speed - 50) / 100;
const renderInterval = (speedScale * 1000) / 10;
setInterval(tick, renderInterval);
