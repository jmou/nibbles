import { PLAYER_1, PLAYER_2, SYSTEM } from "@rcade/plugin-input-classic";
import "./style.css";

const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 240;

const COLUMNS = 80;
const ROWS = 24;

const PIXELS_PER_COLUMN = SCREEN_WIDTH / COLUMNS;
const PIXELS_PER_ROW = SCREEN_HEIGHT / ROWS;

type AppState = "title" | "post" | "level1";

let state: AppState = "title";

interface ScreenPosition {
  x: number;
  y: number;
}

interface TextPosition {
  row: number;
  col: number;
}

interface GamePosition {
  u: number;
  v: number;
}

const U_MAX = COLUMNS - 1;
const V_MAX = ROWS * 2 - 1;
const U_WIDTH = PIXELS_PER_COLUMN;
const V_HEIGHT = PIXELS_PER_ROW / 2;

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

interface Sammy {
  front: GamePosition;
  trail: GamePosition[];
  length: number;
  heading: Heading;
  color: Color;
}

const snakes: Sammy[] = [];

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

function paint(pos: ScreenPosition, color: Color, alpha: Alpha = MATURE) {
  const { x, y } = pos;
  const { r, g, b } = color;
  const index = (y * SCREEN_WIDTH + x) * 4;
  if (index + 3 >= bitmap.data.length) return false;
  bitmap.data[index] = r;
  bitmap.data[index + 1] = g;
  bitmap.data[index + 2] = b;
  bitmap.data[index + 3] = alpha;
  return true;
}

function trial(pos: ScreenPosition, color: Color) {
  if (!equals(pos, BLUE, MATURE)) color = BLACK;
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

function graduate(pos: ScreenPosition, _color: Color) {
  const { x, y } = pos;
  const index = (y * SCREEN_WIDTH + x) * 4;
  bitmap.data[index + 3] = MATURE;
  return true;
}

function fillRect(
  x: number,
  y: number,
  width: number,
  height: number,
  color: Color,
  fn: (pos: ScreenPosition, color: Color) => boolean = paint
) {
  let all = true;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const px = Math.floor(x + dx);
      const py = Math.floor(y + dy);
      if (px >= 0 && px < SCREEN_WIDTH && py >= 0 && py < SCREEN_HEIGHT) {
        const one = fn({ x: px, y: py }, color);
        all &&= one;
      }
    }
  }
  return all;
}

function apply(
  pos: ScreenPosition | GamePosition,
  color: Color,
  fn: (pos: ScreenPosition, color: Color) => boolean = paint
) {
  if ("x" in pos) {
    return trial(pos, color);
  } else {
    return fillRect(
      pos.u * U_WIDTH,
      pos.v * V_HEIGHT,
      U_WIDTH,
      V_HEIGHT,
      color,
      fn
    );
  }
}

function erase(pos: ScreenPosition | GamePosition) {
  if ("x" in pos) {
    trial(pos, BLUE);
  } else {
    fillRect(pos.u * U_WIDTH, pos.v * V_HEIGHT, U_WIDTH, V_HEIGHT, BLUE);
  }
}

function hrule(v: number, u1: number, u2: number) {
  for (let u = u1; u <= u2; u++) apply({ u, v }, SALMON);
}

function vrule(u: number, v1: number, v2: number) {
  for (let v = v1; v <= v2; v++) apply({ u, v }, SALMON);
}

function text(row: number, col: number, s: string) {
  // TODO bitmap font
  const x = Math.floor(col * PIXELS_PER_COLUMN);
  const y = Math.floor(row * PIXELS_PER_ROW);
  fillRect(x, y, s.length * 3, 5, WHITE);
}

function spawn(front: GamePosition, heading: Heading, color: Color) {
  snakes.push({ front, trail: [], length: 1, heading, color });
}

function title() {
  cls();
  apply({ u: 0, v: 0 }, SALMON);
  text(5, 5, "N I B B L E S");
}

function reinitSnakes(
  u0: number,
  v0: number,
  heading0: Heading,
  u1: number,
  v1: number,
  heading1: Heading
) {
  snakes[0].front = { u: u0, v: v0 };
  snakes[0].heading = heading0;
  if (snakes.length > 1) {
    snakes[1].front = { u: u1, v: v1 };
    snakes[1].heading = heading1;
  }
}

function start(level: 1) {
  state = `level${level}`;
  cls();

  if (level === 1) {
    reinitSnakes(50, 25, LEFT, 30, 25, RIGHT);
  }

  // Borders
  hrule(0, 0, U_MAX);
  hrule(V_MAX, 0, U_MAX);
  vrule(0, 0, V_MAX);
  vrule(U_MAX, 0, V_MAX);
}

function end() {
  state = "post";
}

function add(pos: GamePosition, heading: Heading, distance: number = 1) {
  let { u, v } = pos;
  u += distance * Math.cos(heading);
  v += distance * Math.sin(heading);
  return { u, v };
}

function turn(sammy: Sammy, dpad: typeof PLAYER_1.DPAD) {
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
      spawn({ u: 20, v: 5 }, RIGHT, YELLOW);
      start(1);
    } else if (SYSTEM.TWO_PLAYER) {
      spawn({ u: 20, v: 5 }, RIGHT, YELLOW);
      spawn({ u: 60, v: 25 }, LEFT, MAGENTA);
      start(1);
    }
  } else if (state === "level1") {
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

    // Extend snakes after truncating trail to allow snake front to occupy
    // vacated tail.
    for (const sammy of snakes) {
      apply(sammy.front, sammy.color, trial);
    }

    const dead = snakes.filter(
      (sammy) => !apply(sammy.front, sammy.color, equals)
    );
    if (dead.length > 0) {
      for (const [u, sammy] of dead.entries()) {
        apply({ u, v: 0 }, sammy.color);
      }
      end();
      // FIXME resolve trial colors
    }

    for (const sammy of snakes) {
      apply(sammy.front, sammy.color, graduate);
    }
  }

  ctx.putImageData(bitmap, 0, 0);
}

title();

const speed = 50;
const speedScale = 1 - (speed - 50) / 100;
const renderInterval = (speedScale * 1000) / 10;
setInterval(tick, renderInterval);
