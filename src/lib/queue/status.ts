import type { Status } from "@/lib/constants";

/** Allowed status transitions. `sent` is terminal: a sent email can never be re-sent. */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  draft: ["pending_review", "rejected"],
  pending_review: ["approved", "rejected", "draft"],
  approved: ["sending", "pending_review", "rejected"],
  sending: ["sent", "failed", "approved"], // `approved` only when a block/auth stop returns the item to the queue
  sent: [],
  failed: ["approved", "pending_review", "rejected"],
  rejected: ["pending_review"],
};

export const EDITABLE_STATUSES: readonly Status[] = ["draft", "pending_review", "failed"];
export const DELETABLE_STATUSES: readonly Status[] = ["draft", "pending_review", "approved", "failed", "rejected"];

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: Status, to: Status): void {
  if (!canTransition(from, to)) throw new Error(`Invalid status transition: ${from} → ${to}`);
}

export type BulkAction = "approve" | "reject" | "submit" | "retry" | "unapprove" | "delete";

/** Maps a user-facing action to the status the item must currently have and the status it moves to. */
export const ACTIONS: Record<Exclude<BulkAction, "delete">, { from: Status[]; to: Status }> = {
  approve: { from: ["pending_review"], to: "approved" },
  reject: { from: ["draft", "pending_review", "approved", "failed"], to: "rejected" },
  submit: { from: ["draft", "rejected", "failed"], to: "pending_review" },
  retry: { from: ["failed"], to: "approved" },
  unapprove: { from: ["approved"], to: "pending_review" },
};
