"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/**
 * The customer's side of support.
 *
 * A customer submits a request and gets back a correlation id they can quote
 * when they follow up. The screen never implies a reply has arrived: the
 * status and the response both come from the server, so an unanswered request
 * reads as unanswered.
 */

export const supportQk = {
  requests: ["support-requests"] as const,
};

/** The categories the API accepts. */
export type SupportCategory = "question" | "bug" | "billing" | "account" | "other";

export interface SupportRequestRow {
  id: string;
  correlationId: string;
  category: SupportCategory;
  subject: string;
  status: string;
  response: string | null;
  createdAt: string;
}

/** The customer's own support requests. */
export function useSupportRequests() {
  return useQuery({
    queryKey: supportQk.requests,
    queryFn: () => api.get<{ requests: SupportRequestRow[] }>("/support/requests").then((r) => r.requests),
  });
}

/**
 * Submits a support request.
 *
 * The correlation id is generated in the browser so the customer can quote it
 * straight away, even if the response is slow.
 */
export function useSubmitSupportRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      category: SupportCategory;
      subject: string;
      message: string;
      context?: string;
      email?: string;
    }) =>
      // The API answers with the request's id and correlation id at the top
      // level, so the receipt can be shown without a second lookup.
      api.post<{ id: string; correlationId: string }>("/support/requests", {
        category: input.category,
        subject: input.subject,
        message: input.message,
        context: input.context,
        email: input.email,
        correlationId: `sup-${Date.now().toString(36)}`,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: supportQk.requests });
    },
  });
}
