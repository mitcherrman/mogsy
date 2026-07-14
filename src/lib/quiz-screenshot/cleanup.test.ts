import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createCleanupRegistry, installSignalHandlers } from "./cleanup";

describe("createCleanupRegistry", () => {
  it("runs every cleanup once, in LIFO order, tolerating failures", async () => {
    const order: string[] = [];
    const r = createCleanupRegistry();
    r.register("server", () => {
      order.push("server");
    });
    r.register("boom", () => {
      order.push("boom");
      throw new Error("teardown failure");
    });
    r.register("browser", async () => {
      order.push("browser");
    });
    await r.runAll();
    await r.runAll(); // second call is a no-op
    expect(order).toEqual(["browser", "boom", "server"]);
  });

  it("only runs callbacks that were explicitly registered (tracked handles only)", async () => {
    const r = createCleanupRegistry();
    let calls = 0;
    r.register("only-this", () => {
      calls++;
    });
    await r.runAll();
    expect(calls).toBe(1);
  });
});

describe("installSignalHandlers", () => {
  function fakeProcess() {
    const emitter = new EventEmitter();
    const exits: number[] = [];
    return {
      emitter,
      exits,
      procLike: {
        once: (event: string, handler: (...args: unknown[]) => void) =>
          emitter.once(event, handler),
        exit: (code: number) => {
          exits.push(code);
        },
      },
    };
  }

  it("SIGINT runs cleanup and exits 130", async () => {
    const { emitter, exits, procLike } = fakeProcess();
    const r = createCleanupRegistry();
    let cleaned = false;
    r.register("x", () => {
      cleaned = true;
    });
    installSignalHandlers(r, procLike);
    emitter.emit("SIGINT");
    await new Promise((res) => setTimeout(res, 0));
    expect(cleaned).toBe(true);
    expect(exits).toEqual([130]);
  });

  it("SIGTERM exits 143 and uncaughtException exits 1, both after cleanup", async () => {
    for (const [event, code, arg] of [
      ["SIGTERM", 143, undefined],
      ["uncaughtException", 1, new Error("boom")],
    ] as const) {
      const { emitter, exits, procLike } = fakeProcess();
      const r = createCleanupRegistry();
      let cleaned = false;
      r.register("x", () => {
        cleaned = true;
      });
      installSignalHandlers(r, procLike);
      emitter.emit(event, arg);
      await new Promise((res) => setTimeout(res, 0));
      expect(cleaned).toBe(true);
      expect(exits).toEqual([code]);
    }
  });
});
