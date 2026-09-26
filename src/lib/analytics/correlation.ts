import { getSession, getVisitor } from "./identity";
import { secureUuid } from "./runtime";

export type BrowserCorrelation = {
  visitor_id: string;
  session_id: string;
  interaction_id: string;
};

/**
 * Join context for a browser-initiated backend write.
 *
 * These values are observability identifiers only. Railway derives account
 * identity and authorization from the bearer token; none of these fields can
 * select a user or grant access.
 */
export function browserCorrelation(): BrowserCorrelation {
  const visitor = getVisitor();
  const session = getSession({ visitorId: visitor.visitorId });
  return {
    visitor_id: visitor.visitorId,
    session_id: session.sessionId,
    interaction_id: secureUuid(),
  };
}

export function withBrowserCorrelation<T extends Record<string, unknown>>(body: T): T & BrowserCorrelation {
  return { ...body, ...browserCorrelation() };
}
