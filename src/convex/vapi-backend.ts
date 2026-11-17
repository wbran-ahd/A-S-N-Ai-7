"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import {
  VAPI_BASE,
  buildPlaceOutboundCallPayload,
  normalizePhoneNumber,
} from "./vapi";

// Vapi backend integration — wired, not live-verified yet.
//
// This is the Convex action for starting an outbound Vapi call. The shared
// helpers live in `src/convex/vapi.ts` so the payload logic stays testable
// without a Convex runtime.
//
// Gated on `VAPI_API_KEY`: until that environment variable exists, the action
// throws a message that says exactly what to configure instead of calling Vapi
// with an empty token.

export const placeOutboundCall = action({
  args: {
    assistantId: v.string(),
    phoneNumberId: v.string(),
    customerNumber: v.string(),
  },
  handler: async (_ctx, { assistantId, phoneNumberId, customerNumber }) => {
    const apiKey = process.env.VAPI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Vapi is not configured yet. Add VAPI_API_KEY in Settings → Environment and redeploy.",
      );
    }

    const payload = buildPlaceOutboundCallPayload({
      assistantId,
      phoneNumberId,
      customerNumber,
    });

    const response = await fetch(`${VAPI_BASE}/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = (await response.text().catch(() => "")).slice(0, 500);
      throw new Error(
        `Vapi call creation failed (${response.status}). ${body ? `Response: ${body}` : ""}`,
      );
    }

    const result = (await response.json()) as Record<string, unknown>;
    const callId = result.id;
    if (typeof callId !== "string" || callId.length === 0) {
      throw new Error(
        "Vapi returned a call response we could not read (no `id` field).",
      );
    }

    return {
      callId,
      customer: normalizePhoneNumber(customerNumber) ?? customerNumber,
      assistantId,
      phoneNumberId,
    };
  },
});
