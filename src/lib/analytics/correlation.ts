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
 *
 * `interaction_id` names ONE logical operation. By default every call is a new
 * operation. A caller that automatically retries the same logical operation
 * (the Daily stage launch) mints the id once with `newInteractionId()` and
 * passes it on every attempt, so a retry is not counted as a new interaction.
 */
export function browserCorrelation(interactionId: string = newInteractionId()): BrowserCorrelation {
  const visitor = getVisitor();
  const session = getSession({ visitorId: visitor.visitorId });
  return {
    visitor_id: visitor.visitorId,
    session_id: session.sessionId,
    interaction_id: interactionId,
  };
}

export function withBrowserCorrelation<T extends Record<string, unknown>>(
  body: T, interactionId?: string,
): T & BrowserCorrelation {
  return { ...body, ...browserCorrelation(interactionId) };
}

/** A fresh id for one logical browser-initiated operation. */
export function newInteractionId(): string {
  return secureUuid();
}
