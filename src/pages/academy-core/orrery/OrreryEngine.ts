/**
 * Academy Core V3.5 — the orrery's motion engine.
 *
 * One small imperative controller that owns the continuous motion so React
 * never re-renders for it: a single requestAnimationFrame loop that writes
 * `transform` (and, per frame, the four tether path strings, the bearing
 * needle and three parallax layers) straight onto elements the page hands it.
 * Nothing here reads layout; the stage size arrives through `resize`.
 *
 * It is deliberately thin. All the geometry lives in `orrery-motion.ts`
 * (pure, tested); the destination / navigation logic lives in
 * `useCoreNavigator`. The page tells the engine WHAT the visitor is doing
 * through `setTargets`, and the engine eases toward it:
 *
 *   · `calm`      orbit speed multiplier (the angular velocity itself is eased,
 *                 so a book stabilises under a cursor instead of stopping dead);
 *   · `emphasis`  the hovered / focused / pinned book — grows a little and
 *                 takes the top of the stack, in place (a book never runs away
 *                 from the pointer that is on it);
 *   · `front`     a book that has no pointer on it (keyboard focus, the
 *                 crystal's pinned preview) is brought toward the viewer to a
 *                 resting place beside the crystal.
 *
 * The loop runs only while the stage is on screen and the tab is visible, and
 * not at all under reduced motion (the books are placed once, at REST_THETA).
 */
import {
  BOOK_BASE_W,
  BOOK_BASE_W_COMPOSED,
  BOOK_ORDER,
  BOOK_RATIO,
  CALM,
  CORE_CENTER,
  DESKTOP_ORBIT,
  EMPHASIS_SCALE,
  SELECTED_EMPHASIS_SCALE,
  ORBIT_OMEGA,
  SpinModel,
  STAGE,
  SUPPORT_SCALE,
  approach,
  approachAngle,
  bearingDeg,
  blendPose,
  bookAngle,
  frontPose,
  lerp,
  orbitPose,
  smoothstep,
  stackingFor,
  tetherPath,
  type BookId,
  type BookPose,
} from "./orrery-motion";
import { composedCore, composedFit, composedPose, composedStage } from "./composed-fit";

export interface EngineElements {
  books: Record<BookId, HTMLElement | null>;
  tethers: Record<BookId, SVGPathElement | null>;
  needle: HTMLElement | null;
  /** Elements that drift opposite the pointer by `data-depth` (0…1). */
  parallax: HTMLElement[];
  /** Elements whose CSS animations the Core speeds up / slows down with the room in focus. */
  tempo?: HTMLElement[];
  /** Receives `data-spin` (the spin phase) when it changes: for inspection and tests. */
  host?: HTMLElement | null;
}

export interface EngineTargets {
  emphasis: BookId | null;
  front: BookId | null;
  calm: number;
  activating: BookId | null;
}

export type EngineMode = "orbit" | "composed";

export interface EngineOptions {
  mode: EngineMode;
  animate: boolean;
  /** Called once if the loop's median frame stays slower than 25 ms (40 fps) for a sustained stretch. */
  onDegrade?: () => void;
}

interface BookState {
  emphasis: number;
  front: number;
  side: -1 | 1;
  lastTransform: string;
  lastZ: number;
  lastShade: string;
  lastSide: string;
}

const TAU_FRONT = 0.34;
const TAU_EMPHASIS = 0.2;
const TAU_TEMPO = 0.5;
/**
 * The frame-rate monitor: frames to ignore after the loop starts; the rolling
 * window (s); the budget (s/frame) the window's median frame must stay under;
 * how long (s) it may stay over before the scene degrades; and the most one
 * frame adds to the window's length (s), so one long pause (GC, a debugger)
 * cannot stand in for seconds of frames.
 */
const WARMUP_FRAMES = 90;
const WINDOW_S = 2;
const SLOW_FRAME_S = 0.025;
const SLOW_HOLD_S = 1;
const FRAME_CAP_S = 0.1;
/** Ring capacity: a 2 s window at 240 Hz, with room to spare. */
const WINDOW_FRAMES = 512;
const TAU_NEEDLE = 0.22;
const TETHER_START_R = 168;
const TETHER_START_R_COMPOSED = 124;
/** The compact phone Core is 290 units across instead of 330: its threads start closer in. */
const TETHER_START_R_COMPOSED_COMPACT = 110;
const MAX_DT = 0.05;

export class OrreryEngine {
  private els: EngineElements;
  private mode: EngineMode;
  private animate: boolean;
  private u = 1;
  private spin: SpinModel;
  private tempo = 1;
  private tempoTarget = 1;
  private tempoApplied = 1;
  private warm = 0;
  /** Rolling window of recent frame times (s, capped): its length and how many are over budget. */
  private win = new Float64Array(WINDOW_FRAMES);
  private winHead = 0;
  private winLen = 0;
  private winTotal = 0;
  private winSlow = 0;
  /** How long (s) the window's median has stayed over budget. */
  private slowFor = 0;
  private degraded = false;
  private onDegrade?: () => void;
  private targets: EngineTargets = { emphasis: null, front: null, calm: CALM.free, activating: null };
  private states: Record<BookId, BookState>;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private visible = true;
  private running = false;
  private needle = -90;
  private px = 0;
  private py = 0;
  private pxTarget = 0;
  private pyTarget = 0;
  private lastNeedle = "";
  private frame = 0;
  private lastSpin = "";
  private parallaxLast = new WeakMap<HTMLElement, string>();

  /** Phone composition fit, 0 (tall) .. 1 (compact); set from the stage box in resize(). */
  private fit = 0;

  constructor(els: EngineElements, opts: EngineOptions) {
    this.els = els;
    this.mode = opts.mode;
    this.animate = opts.animate;
    this.onDegrade = opts.onDegrade;
    this.spin = new SpinModel(this.animate && this.mode === "orbit" ? ORBIT_OMEGA : 0);
    const blank = (): BookState => ({ emphasis: 0, front: 0, side: 1, lastTransform: "", lastZ: -1, lastShade: "", lastSide: "" });
    this.states = { leaguecraft: blank(), "pro-play": blank(), "combat-lab": blank(), archives: blank() };
  }

  /** The stage's pixel size → one scale for every unit. */
  resize(width: number, height: number): void {
    // phones: the composition is fitted to the stage box's aspect (composed-fit.ts)
    if (this.mode === "composed") this.fit = composedFit(width, height);
    const stage = this.mode === "orbit" ? STAGE : composedStage(this.fit);
    this.u = Math.max(0.2, Math.min(width / stage.width, height / stage.height));
    this.renderFrame(0);
  }

  setTargets(next: Partial<EngineTargets>): void {
    const prev = this.targets;
    this.targets = { ...prev, ...next };
    // A book chosen for the front takes the side it is already on, so it
    // never crosses the Core on its way.
    if (next.front && next.front !== prev.front && this.mode === "orbit") {
      const i = BOOK_ORDER.indexOf(next.front);
      const p = orbitPose(bookAngle(i, this.spin.theta), DESKTOP_ORBIT);
      this.states[next.front].side = p.x >= DESKTOP_ORBIT.cx ? 1 : -1;
    }
    // Without the loop (reduced motion, composed) targets apply at once.
    if (!this.animate || this.mode === "composed") this.settle();
    if (this.animate && this.mode === "orbit") this.wake();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.wake();
    else this.halt();
  }

  setPointer(nx: number, ny: number): void {
    this.pxTarget = nx;
    this.pyTarget = ny;
    if (this.animate && this.mode === "orbit") this.wake();
  }

  /** Current orbit phase (radians) — exposed for inspection and tests. */
  get phase(): number {
    return this.spin.theta;
  }

  /** The spin state machine's phase (free / grabbed / inertia / snapping / dwell / steering / held). */
  get spinPhase(): string {
    return this.spin.phase;
  }

  /** Speed multiplier for the Core's ring / comet animations (eased). */
  setTempo(rate: number): void {
    this.tempoTarget = rate;
    if (!this.animate) this.applyTempo(rate);
  }

  /** Direct manipulation (orbit mode, motion allowed): the pointer takes the orbit. */
  grab(): void {
    if (!this.animate || this.mode !== "orbit") return;
    this.spin.grab();
    this.wake();
  }

  /** The pointer moved the orbit by `dx` screen px over `dt` seconds. */
  dragBy(dx: number, dt: number): void {
    if (this.spin.phase !== "grabbed") return;
    // front books follow the pointer: dx/dtheta at the near side of the orbit is -rx * u
    this.spin.drag(-dx / (DESKTOP_ORBIT.rx * this.u), dt);
    this.renderFrame(0);
  }

  release(): void {
    this.spin.release();
    this.wake();
  }

  /**
   * The arrow selector (orbit mode): turn the whole orbit so the next book in
   * direction `dir` comes to the front, then hold it there. Under reduced motion
   * the orbit is placed at once. Returns the book now selected.
   */
  steer(dir: 1 | -1): BookId | null {
    if (this.mode !== "orbit") return null;
    const i = this.spin.steer(dir, this.animate);
    this.syncSpin(); // at once, not on the next frame: a reader must never see the previous "held"
    if (!this.animate) this.renderFrame(0);
    this.wake();
    return i >= 0 ? BOOK_ORDER[i] : null;
  }

  /**
   * Hover-to-front (orbit mode): turn the whole orbit, by the shorter way, until
   * `id` is front and centre, then hold it there — the arrows' own turn and hold.
   * Choosing the book already being brought changes nothing. Under reduced
   * motion the orbit is placed at once. False when there is no orbit to turn or
   * the pointer is holding it (a drag).
   */
  steerTo(id: BookId): boolean {
    if (this.mode !== "orbit") return false;
    const ok = this.spin.steerToBook(BOOK_ORDER.indexOf(id), this.animate);
    this.syncSpin();
    if (!this.animate) this.renderFrame(0);
    this.wake();
    return ok;
  }

  /** Release a selector hold; the orbit resumes. */
  releaseSelection(): void {
    this.spin.releaseHold();
    this.syncSpin();
    this.wake();
  }

  private syncSpin(): void {
    if (this.spin.phase === this.lastSpin) return;
    this.lastSpin = this.spin.phase;
    this.els.host?.setAttribute("data-spin", this.spin.phase);
  }

  /** The book the selector holds (or is turning) to the front, if any. */
  get selected(): BookId | null {
    return this.spin.selected >= 0 && (this.spin.phase === "steering" || this.spin.phase === "held")
      ? BOOK_ORDER[this.spin.selected]
      : null;
  }

  start(): void {
    this.renderFrame(0);
    if (this.animate && this.mode === "orbit") this.wake();
  }

  stop(): void {
    this.halt();
  }

  private wake(): void {
    if (this.running || !this.visible || !this.animate) return;
    if (typeof document !== "undefined" && document.hidden) return;
    this.running = true;
    this.last = 0;
    this.warm = 0;
    this.winHead = 0;
    this.winLen = 0;
    this.winTotal = 0;
    this.winSlow = 0;
    this.slowFor = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private halt(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const raw = this.last ? (now - this.last) / 1000 : 1 / 60;
    const dt = Math.min(MAX_DT, raw);
    this.last = now;
    // A sustained slow median frame (after warm-up) means this device cannot afford
    // the full scene: tell the page once, which drops to the lite tier.
    if (!this.degraded && this.onDegrade) {
      if (this.warm < WARMUP_FRAMES) this.warm++;
      else if (this.sample(Math.min(raw, FRAME_CAP_S))) {
        this.degraded = true;
        this.onDegrade();
      }
    }
    this.clock += dt;
    this.renderFrame(dt);
    this.raf = requestAnimationFrame(this.tick);
  };

  /**
   * Add one frame to the rolling window; true once the window's median frame
   * has stayed over budget for SLOW_HOLD_S.
   *
   * The median is over budget when at least half the window's frames are, so
   * a count is enough: no sort. A median shrugs off a few long frames. A tie
   * counts as slow, give or take the one frame at the window's edge: a browser
   * that alternates 33 ms and 17 ms frames (Firefox at full quality) holds a
   * median of 25 ms that would otherwise flip with the window's parity every
   * frame. One missed vsync in three (45 fps) stays well under.
   */
  private sample(s: number): boolean {
    if (this.winLen === WINDOW_FRAMES) this.dropOldest();
    this.win[(this.winHead + this.winLen) % WINDOW_FRAMES] = s;
    this.winLen++;
    this.winTotal += s;
    if (s > SLOW_FRAME_S) this.winSlow++;
    // Keep just over WINDOW_S of frames.
    while (this.winLen > 1 && this.winTotal - this.win[this.winHead] >= WINDOW_S) this.dropOldest();
    if (this.winTotal < WINDOW_S) return false;
    if (this.winSlow * 2 >= this.winLen - 1) this.slowFor += s;
    else this.slowFor = 0;
    return this.slowFor >= SLOW_HOLD_S;
  }

  private dropOldest(): void {
    const s = this.win[this.winHead];
    this.winHead = (this.winHead + 1) % WINDOW_FRAMES;
    this.winLen--;
    this.winTotal -= s;
    if (s > SLOW_FRAME_S) this.winSlow--;
  }

  /** Snap every eased value to its target (reduced motion / composed). */
  private settle(): void {
    const t = this.targets;
    for (const id of BOOK_ORDER) {
      const s = this.states[id];
      s.emphasis = t.emphasis === id ? 1 : 0;
      s.front = t.front === id ? 1 : 0;
    }
    this.renderFrame(0);
  }

  private applyTempo(rate: number): void {
    if (Math.abs(rate - this.tempoApplied) < 0.005 && rate !== this.tempoTarget) return;
    this.tempoApplied = rate;
    for (const el of this.els.tempo ?? []) {
      for (const a of el.getAnimations?.() ?? []) a.playbackRate = rate;
    }
  }

  private renderFrame(dt: number): void {
    const t = this.targets;
    const u = this.u;
    const orbit = this.mode === "orbit";
    this.frame++;

    if (orbit) this.spin.step(dt, t.calm, this.animate);
    this.syncSpin();
    const theta = this.spin.theta;
    if (dt > 0 && this.animate && Math.abs(this.tempo - this.tempoTarget) > 0.005) {
      this.tempo = approach(this.tempo, this.tempoTarget, dt, TAU_TEMPO);
      this.applyTempo(this.tempo);
    }

    const baseW = orbit ? BOOK_BASE_W : BOOK_BASE_W_COMPOSED;
    const baseH = baseW * BOOK_RATIO;
    const core = orbit ? CORE_CENTER : composedCore(this.fit);
    const anyFocus = t.emphasis !== null;
    const selected = this.selected;
    let needleTarget: BookPose | null = null;

    BOOK_ORDER.forEach((id, i) => {
      const el = this.els.books[id];
      const s = this.states[id];
      if (dt > 0) {
        s.emphasis = approach(s.emphasis, t.emphasis === id ? 1 : 0, dt, TAU_EMPHASIS);
        s.front = approach(s.front, t.front === id ? 1 : 0, dt, TAU_FRONT);
      }

      let pose: BookPose = orbit ? orbitPose(bookAngle(i, theta), DESKTOP_ORBIT) : composedPose(id, this.fit);
      if (orbit && s.front > 0.001) pose = blendPose(pose, frontPose(s.side), s.front);
      // Float the phone books a touch differently so they never read as a grid.
      // the selector's book sits in the orbit right under the crystal: it is lit and
      // on top, but grows less than a hovered book so it does not climb over the lens
      const held = selected === id;
      let scale = pose.scale * (1 + (held ? SELECTED_EMPHASIS_SCALE : EMPHASIS_SCALE) * s.emphasis);
      if (anyFocus && t.emphasis !== id) scale *= lerp(1, SUPPORT_SCALE, 1 - s.emphasis);
      if (t.activating === id) scale *= 1.06;

      if (t.emphasis === id) needleTarget = pose;
      else if (!needleTarget && t.front === id) needleTarget = pose;

      if (el) {
        const x = pose.x * u - (baseW * u) / 2;
        const y = pose.y * u - (baseH * u) / 2;
        const tf = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${scale.toFixed(4)}) perspective(1100px) rotateY(${pose.yaw.toFixed(2)}deg)`;
        if (tf !== s.lastTransform) {
          el.style.transform = tf;
          s.lastTransform = tf;
        }
        const z = stackingFor(pose.depth, s.emphasis);
        if (z !== s.lastZ) {
          el.style.zIndex = String(z);
          s.lastZ = z;
        }
        const side = pose.depth >= 0 ? "near" : "far";
        if (side !== s.lastSide) {
          el.dataset.depth = side;
          s.lastSide = side;
        }
        // far books sit a little deeper in the haze. Written straight onto the
        // levitation wrapper as `opacity`: an inherited custom property here
        // forced a style recalc of the whole book subtree four times a frame.
        const lev = el.firstElementChild as HTMLElement | null;
        const shade = (1 - 0.3 * (1 - smoothstep((pose.depth + 1) / 2))).toFixed(2);
        if (lev && shade !== s.lastShade) {
          lev.style.opacity = shade;
          s.lastShade = shade;
        }
      }

      // `d` is a presentation attribute (a style recalc per write): the faint idle
      // threads are refreshed every third frame, the lit one every frame.
      const path = this.els.tethers[id];
      if (path && (dt === 0 || t.emphasis === id || t.front === id || this.frame % 3 === i % 3)) {
        const sway = Math.sin(this.clock * 0.7 + i * 1.7) * 10;
        path.setAttribute(
          "d",
          tetherPath(core, { x: pose.x, y: pose.y }, orbit ? TETHER_START_R : lerp(TETHER_START_R_COMPOSED, TETHER_START_R_COMPOSED_COMPACT, this.fit), sway),
        );
      }
    });

    // Bearing needle: points at the focused book, otherwise sweeps slowly.
    if (this.els.needle) {
      const rad = (v: number) => (v * Math.PI) / 180;
      if (needleTarget) {
        const target = bearingDeg(core, needleTarget);
        this.needle = dt > 0 ? (approachAngle(rad(this.needle), rad(target), dt, TAU_NEEDLE) * 180) / Math.PI : target;
      } else if (this.animate) {
        this.needle += 6 * dt; // a slow idle sweep
      }
      const css = `rotate(${this.needle.toFixed(2)}deg)`;
      if (css !== this.lastNeedle) {
        this.els.needle.style.transform = css;
        this.lastNeedle = css;
      }
    }

    // Parallax: the far layers drift a little against the pointer.
    if (this.animate && orbit && this.els.parallax.length) {
      this.px = approach(this.px, this.pxTarget, dt, 0.7);
      this.py = approach(this.py, this.pyTarget, dt, 0.7);
      for (const el of this.els.parallax) {
        const depth = Number(el.dataset.depth ?? 0.5);
        const css = `translate3d(${(-this.px * depth * 26).toFixed(1)}px,${(-this.py * depth * 16).toFixed(1)}px,0)`;
        if (this.parallaxLast.get(el) !== css) {
          el.style.transform = css;
          this.parallaxLast.set(el, css);
        }
      }
    }
  }
}
