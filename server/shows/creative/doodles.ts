// Scarabocchi già pronti per i bot di Scarabocchi Animati: 2 fotogrammi ciascuno, legati a un tema di CREATIVE_PROMPTS
// (così gli altri possono davvero indovinare il titolo). Colori e spessori sono indici di CREATIVE.COLORS / WIDTHS.

import { CREATIVE, type Drawing, type Stroke } from '../../../shared/creative';

const BLACK = 0, RED = 1, BLUE = 2, TEAL = 3, ORANGE = 4;
const THIN = 0, MID = 1, THICK = 2;

const fit = (v: number) => Math.max(0, Math.min(CREATIVE.CANVAS, Math.round(v)));

function line(c: number, w: number, ...xy: number[]): Stroke {
  return { c, w, p: xy.map(fit) };
}

function ellipse(c: number, w: number, cx: number, cy: number, rx: number, ry = rx, n = 28): Stroke {
  const p: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    p.push(fit(cx + rx * Math.cos(a)), fit(cy + ry * Math.sin(a)));
  }
  return { c, w, p };
}

/** Onda orizzontale da x0 a x1 (fase diversa = il mare si muove tra i fotogrammi). */
function wave(c: number, w: number, x0: number, x1: number, y: number, amp: number, phase: number): Stroke {
  const p: number[] = [];
  for (let x = x0; x <= x1; x += 25) p.push(fit(x), fit(y + amp * Math.sin(x / 60 + phase)));
  return { c, w, p };
}

function pizza(dx: number, dy: number): Stroke[] {
  return [
    line(ORANGE, THICK, 330 + dx, 330 + dy, 720 + dx, 380 + dy, 500 + dx, 760 + dy, 330 + dx, 330 + dy),
    line(RED, THICK, 320 + dx, 320 + dy, 730 + dx, 370 + dy),
    ellipse(RED, MID, 470 + dx, 430 + dy, 35),
    ellipse(RED, MID, 560 + dx, 540 + dy, 30),
    line(BLACK, THIN, 90 + dx, 420 + dy, 250 + dx, 420 + dy),
    line(BLACK, THIN, 60 + dx, 520 + dy, 270 + dx, 520 + dy),
    line(BLACK, THIN, 110 + dx, 620 + dy, 290 + dx, 620 + dy)
  ];
}

function cloud(angry: boolean): Stroke[] {
  const s = [ellipse(BLUE, MID, 360, 400, 130, 100), ellipse(BLUE, MID, 520, 330, 150, 130), ellipse(BLUE, MID, 670, 410, 130, 100)];
  s.push(line(BLACK, MID, 420, 360, 500, 400), line(BLACK, MID, 640, 360, 560, 400));
  s.push(ellipse(BLACK, MID, 470, 430, 12), ellipse(BLACK, MID, 590, 430, 12));
  s.push(line(BLACK, MID, 470, 500, 530, 480, 590, 500));
  if (angry) s.push(line(ORANGE, THICK, 520, 540, 470, 680, 550, 670, 490, 860));
  return s;
}

function robot(tearY: number): Stroke[] {
  return [
    line(BLACK, MID, 330, 250, 670, 250, 670, 600, 330, 600, 330, 250),
    line(BLACK, MID, 500, 250, 500, 160),
    ellipse(RED, MID, 500, 145, 18),
    ellipse(BLACK, MID, 420, 380, 35),
    ellipse(BLACK, MID, 580, 380, 35),
    line(BLACK, MID, 420, 530, 460, 500, 540, 500, 580, 530),
    line(BLUE, MID, 420, 420, 410, tearY - 30, 400, tearY, 420, tearY + 20, 440, tearY, 430, tearY - 30, 420, 420)
  ];
}

function snowman(phase: number): Stroke[] {
  const rays: Stroke[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + phase / 4;
    rays.push(line(ORANGE, THIN, 820 + 80 * Math.cos(a), 170 + 80 * Math.sin(a), 820 + 115 * Math.cos(a), 170 + 115 * Math.sin(a)));
  }
  return [
    ellipse(BLACK, MID, 420, 600, 150),
    ellipse(BLACK, MID, 420, 360, 95),
    ellipse(BLACK, MID, 390, 340, 8),
    ellipse(BLACK, MID, 450, 340, 8),
    line(ORANGE, MID, 420, 370, 500, 385, 420, 395),
    ellipse(ORANGE, MID, 820, 170, 60),
    ...rays,
    wave(BLUE, MID, 40, 960, 840, 22, phase),
    wave(BLUE, MID, 40, 960, 910, 18, phase + 1.5)
  ];
}

function ghost(dx: number): Stroke[] {
  const body: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (i / 16) * Math.PI;
    body.push(500 + dx + 190 * Math.cos(a), 420 + 190 * Math.sin(a));
  }
  body.push(690 + dx, 760);
  for (let i = 0; i <= 6; i++) body.push(690 + dx - (i * 380) / 6, i % 2 ? 700 : 760);
  body.push(310 + dx, 420);
  return [
    line(BLACK, MID, ...body),
    ellipse(BLACK, MID, 440 + dx, 430, 40, 55),
    ellipse(BLACK, MID, 560 + dx, 430, 40, 55),
    ellipse(BLACK, MID, 500 + dx, 570, 30, 40),
    line(RED, MID, 800, 200, 800, 330),
    ellipse(RED, MID, 800, 380, 10),
    line(RED, MID, 860, 200, 860, 330),
    ellipse(RED, MID, 860, 380, 10)
  ];
}

function cactus(armsUp: boolean): Stroke[] {
  const leftArm = armsUp ? [400, 520, 290, 520, 290, 360] : [400, 520, 290, 520, 290, 660];
  const rightArm = armsUp ? [600, 480, 710, 480, 710, 320] : [600, 480, 710, 480, 710, 620];
  return [
    line(TEAL, THICK, 400, 860, 400, 330, 450, 270, 550, 270, 600, 330, 600, 860),
    line(TEAL, THICK, ...leftArm),
    line(TEAL, THICK, ...rightArm),
    ellipse(BLACK, MID, 460, 380, 10),
    ellipse(BLACK, MID, 540, 380, 10),
    line(BLACK, MID, 460, 440, 500, 470, 540, 440),
    line(ORANGE, MID, 250, 880, 750, 880),
    line(RED, MID, 820, 310, 765, 250, 770, 215, 800, 205, 820, 235, 840, 205, 870, 215, 875, 250, 820, 310)
  ];
}

export const BOT_DOODLES: Readonly<Record<string, Drawing>> = {
  'Una pizza che vola': [pizza(0, 40), pizza(40, 0)],
  'La nuvola arrabbiata': [cloud(false), cloud(true)],
  'Un robot che piange': [robot(560), robot(720)],
  'Il pupazzo di neve al mare': [snowman(0), snowman(Math.PI)],
  'Un fantasma che ha paura del buio': [ghost(-20), ghost(20)],
  'Il cactus che vuole un abbraccio': [cactus(false), cactus(true)]
};
