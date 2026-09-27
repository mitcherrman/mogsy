import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { TransactionalLeaveDialog } from "@/components/navigation/TransactionalLeaveDialog";
import { useTransactionalLeaveGuard } from "@/lib/navigation/useTransactionalLeaveGuard";
import "@/index.css";

const PROTECTED_PATH = "/__nav1-e1/protected";

function Fixture() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = location.pathname === PROTECTED_PATH;
  const guard = useTransactionalLeaveGuard({
    active,
    kind: "ranked_match",
    copy: {
      title: "Leave protected fixture?",
      body: "Neutral browser-history fixture.",
      stayLabel: "Stay",
      leaveLabel: "Leave",
    },
    shouldBlock: ({ currentLocation, nextLocation }) => (
      currentLocation.pathname === PROTECTED_PATH
      && nextLocation.pathname !== PROTECTED_PATH
    ),
  });

  const label = active
    ? "Protected B"
    : location.pathname === "/__nav1-e1/push"
      ? "Push C"
      : location.pathname === "/__nav1-e1/replace"
        ? "Replace D"
        : "Origin A";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
      <h1>{label}</h1>
      <output data-testid="url">{location.pathname}{location.search}{location.hash}</output>
      {!active ? (
        <button type="button" onClick={() => navigate(PROTECTED_PATH, { state: { matchId: "fixture-match" } })}>
          Enter protected B
        </button>
      ) : (
        <>
          <button type="button" onClick={() => navigate("/__nav1-e1/push", { state: { intent: "push" } })}>
            Guarded PUSH
          </button>
          <button type="button" onClick={() => navigate("/__nav1-e1/replace", { replace: true, state: { intent: "replace" } })}>
            Guarded REPLACE
          </button>
        </>
      )}
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

const router = createBrowserRouter([{ path: "*", element: <Fixture /> }]);
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
