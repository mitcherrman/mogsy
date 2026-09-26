import { beforeEach, describe, expect, it } from "vitest";

import { browserCorrelation, withBrowserCorrelation } from "./correlation";
import { resetIdentityForTests } from "./identity";

describe("browser gameplay correlation", () => {
  beforeEach(() => resetIdentityForTests());

  it("keeps visitor/session stable and gives each request a fresh interaction id", () => {
    const first = browserCorrelation();
    const second = browserCorrelation();

    expect(first.visitor_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.visitor_id).toBe(second.visitor_id);
    expect(first.session_id).toBe(second.session_id);
    expect(first.interaction_id).not.toBe(second.interaction_id);
  });

  it("adds correlation without adding an identity or authorization field", () => {
    const body = withBrowserCorrelation({ mastery_set_id: "mset_1" });
    expect(body.mastery_set_id).toBe("mset_1");
    expect(body).not.toHaveProperty("user_id");
    expect(body).toMatchObject({
      visitor_id: expect.any(String),
      session_id: expect.any(String),
      interaction_id: expect.any(String),
    });
  });
});
