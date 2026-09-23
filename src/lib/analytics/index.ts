/**
 * FUNNEL1B1 — the public surface of Mogzy analytics.
 *
 * Import from "@/lib/analytics". Nothing outside this directory should reach
 * into its internals: the reason UTM, referrer and session handling never
 * existed is that there was no single place to put them, and the reason they
 * will stay correct is that there is exactly one now.
 *
 * Typical use:
 *
 *   import { track } from "@/lib/analytics";
 *   track("leaguecraft_opened");
 *   track("ranked_opened", { metadata: { entry: "hub_tile" } });
 *
 * The caller names the event and the parts only it knows. Visitor id, session
 * id, route, guest state, auth uid, attribution and timestamps are captured by
 * the emitter.
 */

export {
  track,
  trackAsync,
  promoteSessionToHuman,
  trackVerificationStarted,
  trackVerificationCompleted,
  trackVerificationFailed,
  buildServerEventRow,
  type TrackOptions,
} from "./track";

export {
  MACRO_EVENTS,
  PRODUCT_EVENTS,
  RETIRED_EVENTS,
  VERIFICATION_TYPES,
  EVENT_NAME_PATTERN,
  isKnownEvent,
  isMacroEvent,
  isRegisteredUser,
  type AnalyticsEventName,
  type MacroEventName,
  type ProductEventName,
  type VerificationType,
  type SignupMethod,
  type SourceSystem,
  type ServerEventIdentity,
} from "./contract";

export {
  getVisitor,
  getSession,
  SESSION_INACTIVITY_MS,
  type VisitorState,
  type SessionState,
} from "./identity";

export {
  readCurrentTouch,
  hasUtm,
  sameCampaign,
  EMPTY_TOUCH,
  type Touch,
} from "./attribution";

export {
  getAnalyticsDiagnostics,
  type AnalyticsFailure,
} from "./runtime";

export {
  type AnalyticsEventInsert,
  type AnalyticsVisitorInsert,
  type AnalyticsSessionInsert,
} from "./schema";

export {
  useSurfaceEvent,
  trackSurfaceOncePerSession,
} from "./useSurfaceEvent";

export {
  observeAuthIdentity,
  reportDirectSignupCompleted,
  trackSignupStarted,
  type ObservableUser,
} from "./signup";

export {
  classifyTraffic,
  canPromoteToHuman,
  isTrafficClass,
  resolveTrafficMarker,
  TRAFFIC_CLASSES,
  TRAFFIC_MARKER_KEY,
  TRAFFIC_QUERY_CLASS,
  TRAFFIC_QUERY_SOURCE,
  UNKNOWN_TRAFFIC,
  type TrafficClass,
  type TrafficSignal,
} from "./traffic";

export { installHumanSignalWatcher } from "./humanSignal";
