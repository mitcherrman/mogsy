// ---------------------------------------------------------------------------
// Developer — engineering-only tooling, explicitly labelled as such.
//
// The boundary applied to every /dev page: does it write production state, or
// read production user data? If yes it is administration and it was homed in
// its product area regardless of its URL. What remains here writes nothing.
//
// AUTHORIZATION: no /dev route's gate was changed by this classification. A
// page that had no gate still has none; a page that refuses outside DEV builds
// still does. Classification is labelling, not access control — closing those
// gaps is a separate, deliberate decision.
// ---------------------------------------------------------------------------

import { Link } from "react-router-dom";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import AdminRegistryAreaPage from "./AdminRegistryAreaPage";

const MASTERY_PROTOTYPES = [
  "/dev/mastery/ahri-vs-syndra",
  "/dev/mastery/syndra-progression",
  "/dev/mastery/syndra-branching",
  "/dev/mastery/lux-progression",
  "/dev/mastery/jarvan-progression",
  "/dev/mastery/maokai-progression",
  "/dev/mastery/olaf-progression",
  "/dev/mastery/lux-cooldown-progression",
  "/dev/mastery/jarvan-cooldown-progression",
  "/dev/mastery/olaf-cooldown-mana-progression",
];

function PrototypeExtras() {
  return (
    <AdminPanel
      title="Mastery progression prototypes"
      description="All ten remain registered and reachable. They were invisible everywhere before; each is linked here."
      testId="developer-mastery-prototypes"
    >
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {MASTERY_PROTOTYPES.map((path) => (
          <li key={path}>
            <Link
              to={path}
              className="text-[11px] text-primary underline-offset-2 hover:underline"
            >
              {path}
            </Link>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}

export default function AdminDeveloperPage() {
  return (
    <AdminRegistryAreaPage
      areaId="developer"
      sectionExtras={{ prototypes: <PrototypeExtras /> }}
    />
  );
}
