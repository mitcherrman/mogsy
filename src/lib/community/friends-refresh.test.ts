/**
 * The Community friends invalidation signal.
 *
 * It exists because the friendships realtime subscription is not dependable
 * enough to be the only path from "an admin created a friendship" to "the
 * drawer shows it". These tests pin the properties the callers rely on.
 */
import { describe, expect, it, vi } from "vitest";
import { notifyFriendsChanged, subscribeFriendsChanged } from "./friends-refresh";

describe("friends-refresh", () => {
  it("notifies every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeFriendsChanged(a);
    const offB = subscribeFriendsChanged(b);
    notifyFriendsChanged();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    subscribeFriendsChanged(listener)();
    notifyFriendsChanged();
    expect(listener).not.toHaveBeenCalled();
  });

  it("a throwing listener does not prevent its peers from being notified", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const offBad = subscribeFriendsChanged(bad);
    const offGood = subscribeFriendsChanged(good);
    expect(() => notifyFriendsChanged()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
  });

  it("a listener that unsubscribes during dispatch does not skip its peers", () => {
    const second = vi.fn();
    let offSecond = () => {};
    const first = vi.fn(() => offSecond());
    const offFirst = subscribeFriendsChanged(first);
    offSecond = subscribeFriendsChanged(second);
    notifyFriendsChanged();
    expect(second).toHaveBeenCalledTimes(1);
    offFirst();
  });

  it("carries no payload — it is an invalidation, not state", () => {
    const listener = vi.fn();
    const off = subscribeFriendsChanged(listener);
    notifyFriendsChanged();
    expect(listener.mock.calls[0]).toHaveLength(0);
    off();
  });

  it("is a no-op with no subscribers", () => {
    expect(() => notifyFriendsChanged()).not.toThrow();
  });
});
