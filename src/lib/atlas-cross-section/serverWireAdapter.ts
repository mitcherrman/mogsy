/**
 * Atlas cross-section — server wire adapter (boundary only).
 *
 * `createServerWireAdapter(transport)` composes the three pure pieces into a
 * `CrossSectionAdapter`: encode the query, hand the request to an INJECTED
 * transport, validate and translate the reply. It has no `fetch`, no base URL,
 * no token and no module-level state, so importing it can never cause a
 * request, and the page does not construct it. Wiring it to a real transport
 * is a separate, owner-gated change (migration, security review, deploy).
 *
 * Identity comes only from whatever credentials the transport attaches. The
 * adapter takes the `SessionContext` the interface hands it and IGNORES it:
 * the demo "Preview as" persona must never become a request input, so a live
 * adapter cannot impersonate anyone. A transport failure becomes an
 * `AtlasWireError("transport")`; nothing is retried here.
 */
import { encodeSearchRequest, type EncodeOptions } from "./wireRequest";
import { mapWireResponse } from "./wireResponse";
import { AtlasWireError, type WireTransport } from "./wire";
import type { CrossSectionAdapter } from "./types";

export interface ServerWireAdapterOptions extends EncodeOptions {
  label?: string;
}

export function createServerWireAdapter(transport: WireTransport, options: ServerWireAdapterOptions = {}): CrossSectionAdapter {
  return {
    label: options.label ?? "Atlas question API (atlas_questions.v0)",
    async search(query) {
      // Deliberately one-argument: the demo session is not an input here.
      const request = encodeSearchRequest(query, options);
      let response;
      try {
        response = await transport(request);
      } catch (error) {
        if (error instanceof AtlasWireError) throw error;
        throw new AtlasWireError("transport", "", "the request could not be completed");
      }
      return mapWireResponse(response, { query });
    },
  };
}
