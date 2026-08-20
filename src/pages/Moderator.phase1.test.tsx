import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Moderator from "./Moderator";

const { roleQuery } = vi.hoisted(() => ({
  roleQuery: {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: any) => Promise.resolve({ data: [{ role: "moderator" }], error: null }).then(resolve),
  },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "mod-user" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => roleQuery } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/admin/AdminCollections", () => ({ default: () => <div>Collections panel</div> }));
vi.mock("@/components/admin/AdminBots", () => ({ default: () => <div>Bots panel</div> }));
vi.mock("@/components/admin/AdminComments", () => ({ default: () => <div>Comments panel</div> }));
vi.mock("@/components/admin/AdminInviteLinks", () => ({ default: () => <div>Invites panel</div> }));
vi.mock("@/components/admin/AdminEloCheck", () => ({ default: () => <div>Aura panel</div> }));

describe("Moderator Phase 1 navigation", () => {
  it("keeps legitimate moderator tools but does not expose Admin Users", async () => {
    render(<MemoryRouter><Moderator /></MemoryRouter>);
    expect(await screen.findByText("Collections panel")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Collections" })).toBeInTheDocument();
  });
});
