import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigate,
  type NavigateFunction,
} from "react-router-dom";
import { TransactionalLeaveDialog } from "@/components/navigation/TransactionalLeaveDialog";
import { useTransactionalLeaveGuard } from "./useTransactionalLeaveGuard";

const NativeRequest = globalThis.Request;

class RouterTestRequest {
  readonly url: string;
  readonly method: string;
  readonly signal: AbortSignal | null;
  readonly headers: Headers;

  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = String(input);
    this.method = init.method ?? "GET";
    this.signal = init.signal ?? null;
    this.headers = new Headers(init.headers);
  }
}

let deactivateGuard = () => {};
let recoverGuard = () => {};

beforeAll(() => {
  globalThis.Request = RouterTestRequest as unknown as typeof Request;
});

afterAll(() => {
  globalThis.Request = NativeRequest;
});

const copy = {
  title: "Leave protected fixture?",
  body: "This neutral fixture verifies router behavior.",
  stayLabel: "Stay",
  leaveLabel: "Leave",
};

function PlainPage({ name }: { name: string }) {
  const location = useLocation();
  return <h1>{name}:{location.pathname}{location.search}{location.hash}</h1>;
}

function GuardedPage({ initiallyActive = true }: { initiallyActive?: boolean }) {
  const [active, setActive] = useState(initiallyActive);
  const navigate = useNavigate();
  const location = useLocation();
  const guard = useTransactionalLeaveGuard({
    active,
    kind: "ranked_match",
    copy,
    shouldBlock: ({ currentLocation, nextLocation }) => (
      currentLocation.pathname !== nextLocation.pathname
    ),
  });
  deactivateGuard = () => setActive(false);
  recoverGuard = () => guard.runWithBypass(
    "ROUTE_RECOVERY",
    () => navigate("/c", { replace: true }),
  );

  const bypass = (navigateWithReason: NavigateFunction) => {
    guard.runWithBypass("ROUTE_RECOVERY", () => navigateWithReason("/c"));
  };

  return (
    <main>
      <h1>protected:{location.pathname}{location.search}{location.hash}</h1>
      <button onClick={() => navigate("/c", { state: { source: "push" } })}>push</button>
      <button onClick={() => navigate("/c", { replace: true, state: { source: "replace" } })}>replace</button>
      <button onClick={() => navigate("/protected?panel=owner#kept")}>owner-preserving</button>
      <button onClick={() => bypass(navigate)}>recovery bypass</button>
      <output data-testid="guard-state">{guard.state}</output>
      <TransactionalLeaveDialog
        open={guard.confirmationOpen}
        title={guard.copy.title}
        body={guard.copy.body}
        stayLabel={guard.copy.stayLabel}
        leaveLabel={guard.copy.leaveLabel}
        onStay={guard.stay}
        onLeave={guard.leave}
        busy={guard.state === "proceeding"}
      />
    </main>
  );
}

function createHarness({
  active = true,
  initialEntries = ["/a", "/protected", "/c"],
  initialIndex = 1,
}: {
  active?: boolean;
  initialEntries?: string[];
  initialIndex?: number;
} = {}) {
  const router = createMemoryRouter([
    { path: "/a", element: <PlainPage name="a" /> },
    { path: "/protected", element: <GuardedPage initiallyActive={active} /> },
    { path: "/c", element: <PlainPage name="c" /> },
  ], { initialEntries, initialIndex });

  return router;
}

describe("useTransactionalLeaveGuard behavior", () => {
  it.each([
    ["PUSH", () => fireEvent.click(screen.getByRole("button", { name: "push" }))],
    ["REPLACE", () => fireEvent.click(screen.getByRole("button", { name: "replace" }))],
  ])("allows inactive %s navigation", async (actionName, attempt) => {
    const router = createHarness({ active: false, initialEntries: ["/a", "/protected"], initialIndex: 1 });
    render(<RouterProvider router={router} />);

    attempt();

    await waitFor(() => expect(router.state.location.pathname).toBe("/c"));
    expect(router.state.historyAction).toBe(actionName);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("allows an inactive POP", async () => {
    const router = createHarness({ active: false });
    render(<RouterProvider router={router} />);

    await act(() => router.navigate(-1));

    expect(router.state.location.pathname).toBe("/a");
    expect(router.state.historyAction).toBe("POP");
  });

  it("blocks PUSH, resets on Stay, and proceeds the exact original PUSH", async () => {
    const router = createHarness({ initialEntries: ["/a", "/protected"], initialIndex: 1 });
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("button", { name: "push" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/protected");

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/protected");

    fireEvent.click(screen.getByRole("button", { name: "push" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/c"));
    expect(router.state.historyAction).toBe("PUSH");
    expect(router.state.location.state).toEqual({ source: "push" });
  });

  it("blocks and proceeds the exact original REPLACE", async () => {
    const router = createHarness({ initialEntries: ["/a", "/protected"], initialIndex: 1 });
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("button", { name: "replace" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/c"));
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.state).toEqual({ source: "replace" });
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/a");
  });

  it("cancels and replays POP while preserving natural Forward", async () => {
    const router = createHarness();
    render(<RouterProvider router={router} />);

    await act(() => router.navigate(-1));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/protected");

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/protected");

    await act(() => router.navigate(-1));
    fireEvent.click(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/a"));
    expect(router.state.historyAction).toBe("POP");

    await act(() => router.navigate(1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/protected"));
  });

  it("keeps one confirmation during repeated Back input", async () => {
    const router = createHarness();
    render(<RouterProvider router={router} />);

    await act(() => router.navigate(-1));
    expect(await screen.findAllByRole("alertdialog")).toHaveLength(1);
    await act(() => router.navigate(-1));

    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/a"));
  });

  it("does not proceed a blocked transition when active becomes false", async () => {
    const router = createHarness();
    render(<RouterProvider router={router} />);

    await act(() => router.navigate(-1));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    act(() => deactivateGuard());

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/protected");
    expect(screen.getByTestId("guard-state")).toHaveTextContent("unblocked");
  });

  it("uses a typed bypass once and blocks the next unrelated transition", async () => {
    const router = createHarness({ initialEntries: ["/a", "/protected"], initialIndex: 1 });
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("button", { name: "recovery bypass" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/c"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/protected");
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/protected");
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("cancels a stale blocked user transition before a recovery bypass", async () => {
    const router = createHarness();
    render(<RouterProvider router={router} />);

    await act(() => router.navigate(-1));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    act(() => recoverGuard());

    await waitFor(() => expect(router.state.location.pathname).toBe("/c"));
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("allows owner-preserving search/hash navigation through the predicate seam", async () => {
    const router = createHarness({ initialEntries: ["/protected"], initialIndex: 0 });
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("button", { name: "owner-preserving" }));

    await waitFor(() => expect(router.state.location.search).toBe("?panel=owner"));
    expect(router.state.location.hash).toBe("#kept");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("registers one blocker and renders one confirmation in StrictMode", async () => {
    const router = createHarness({ initialEntries: ["/a", "/protected"], initialIndex: 1 });
    render(<StrictMode><RouterProvider router={router} /></StrictMode>);

    fireEvent.click(screen.getByRole("button", { name: "push" }));

    expect(await screen.findAllByRole("alertdialog")).toHaveLength(1);
    expect(screen.getAllByText(copy.title)).toHaveLength(1);
  });
});
