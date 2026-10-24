// PULSE-2B — the workspace is owner-only: the gate decides before anything
// loads, and the prototype never writes to the server.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const owner = vi.hoisted(() => ({
  state: { loading: false, phase: "ready", isOwner: true, authorized: true, recheck: () => {} } as Record<string, unknown>,
}));
vi.mock("@/hooks/useOwnerAuth", () => ({ useOwnerAuth: () => owner.state }));
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, auth: { mfa: {} } } }));
vi.mock("./AdminPulseWorkspace", () => ({
  AdminPulseWorkspace: ({ repository }: { repository: { mode: string } }) => <div data-testid="workspace" data-mode={repository.mode} />,
}));

import AdminPulsePage, { pulseStorageMode } from "./AdminPulsePage";

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={["/admin/pulse"]}>
      <Routes>
        <Route path="/admin/pulse" element={<AdminPulsePage />} />
        <Route path="/" element={<div data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  owner.state = { loading: false, phase: "ready", isOwner: true, authorized: true, recheck: () => {} };
  rpc.mockClear();
});

describe("AdminPulsePage owner gate", () => {
  it("mounts the workspace for the authorized owner, on the prototype repository by default", () => {
    renderAt();
    expect(screen.getByTestId("workspace").getAttribute("data-mode")).toBe("prototype");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("redirects a non-owner without mounting the workspace", async () => {
    owner.state = { ...owner.state, isOwner: false, authorized: false };
    renderAt();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(screen.queryByTestId("workspace")).toBeNull();
  });

  it("asks the owner for MFA on an untrusted session before anything mounts", () => {
    owner.state = { ...owner.state, isOwner: true, authorized: false };
    renderAt();
    expect(screen.getByTestId("owner-step-up")).toBeTruthy();
    expect(screen.queryByTestId("workspace")).toBeNull();
  });

  it("mounts nothing while the owner check is loading or unavailable", () => {
    owner.state = { ...owner.state, loading: true };
    const { unmount } = renderAt();
    expect(screen.queryByTestId("workspace")).toBeNull();
    unmount();
    owner.state = { ...owner.state, loading: false, phase: "unavailable" };
    renderAt();
    expect(screen.getByTestId("owner-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("workspace")).toBeNull();
  });

  it("server storage is opt-in", () => {
    expect(pulseStorageMode({})).toBe("prototype");
    expect(pulseStorageMode({ VITE_PULSE_ADMIN_STORAGE: "1" })).toBe("prototype");
    expect(pulseStorageMode({ VITE_PULSE_ADMIN_STORAGE: "server" })).toBe("server");
  });
});
