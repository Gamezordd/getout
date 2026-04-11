import { findGroup } from "../../lib/groupStore";
import { send } from "../../lib/vercelQueue";

export const INITIAL_SUGGESTIONS_TOPIC = "initial-suggestions";

export type InitialSuggestionsMessage = {
  sessionId: string;
  createdAt: string | null;
  queuedAt: string;
};

export const enqueueInitialSuggestionsGeneration = async (sessionId: string) => {
  const group = await findGroup(sessionId);
  if (!group) return;

  await send(
    INITIAL_SUGGESTIONS_TOPIC,
    {
      sessionId,
      createdAt: group.createdAt,
      queuedAt: new Date().toISOString(),
    } satisfies InitialSuggestionsMessage,
    {
      idempotencyKey: `${sessionId}:${group.createdAt || "initial"}`,
    },
  );
};
