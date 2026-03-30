import type { NextApiRequest, NextApiResponse } from "next";
import {
  createInvite,
  listPendingInvitesForRecipient,
} from "../../../lib/inviteStore";
import { findGroup } from "../../../lib/groupStore";
import { sendInviteNotification } from "../../../lib/pushServer";
import { getUserById, requireAuthenticatedUser } from "../../../lib/serverAuth";
import type { InviteListItem } from "../../../lib/authTypes";

type CreateInviteRequest = {
  browserId?: string;
  recipientUserId?: string;
  sessionId?: string;
  message?: string;
};

type ResponseBody = {
  invites?: InviteListItem[];
  invite?: {
    id: string;
    sessionId: string;
    recipientUserId: string;
    status: string;
  };
  notificationDelivered?: boolean;
  notificationMessage?: string;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method === "GET") {
    try {
      const user = await requireAuthenticatedUser(req);
      const invites = await listPendingInvitesForRecipient(user.id);
      return res.status(200).json({ invites });
    } catch (error: any) {
      const message = error?.message || "Unable to load invites.";
      const status = message === "Authentication required." ? 401 : 400;
      return res.status(status).json({ message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const payload = req.body as CreateInviteRequest;
  if (!payload?.browserId || !payload?.recipientUserId || !payload?.sessionId) {
    return res.status(400).json({ message: "Missing invite details." });
  }

  try {
    const inviter = await requireAuthenticatedUser(req);
    const recipient = await getUserById(payload.recipientUserId);
    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found." });
    }
    if (recipient.id === inviter.id) {
      return res.status(400).json({ message: "You cannot invite yourself." });
    }

    const group = await findGroup(payload.sessionId);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }
    const actingMember = group.sessionMembers.find(
      (member) => member.browserId === payload.browserId,
    );
    if (!actingMember) {
      return res.status(403).json({ message: "Only group members can invite." });
    }

    const recipientAlreadyJoined = group.users.some(
      (user) => user.authenticatedUserId === recipient.id,
    );
    if (recipientAlreadyJoined) {
      return res.status(400).json({ message: "Recipient already joined this group." });
    }

    const invite = await createInvite({
      inviterUserId: inviter.id,
      recipientUserId: recipient.id,
      sessionId: payload.sessionId,
      message: payload.message,
    });

    const notificationResult = await sendInviteNotification({
      inviteId: invite.id,
      recipientUserId: recipient.id,
      inviterDisplayName: inviter.displayName,
      sessionId: payload.sessionId,
    });

    const notificationMessage =
      notificationResult.reason === "no_endpoints"
        ? "Invite saved, but the recipient has not enabled notifications on this device."
        : notificationResult.reason === "fcm_not_configured"
          ? "Invite saved, but the server is missing Firebase FCM credentials."
          : notificationResult.reason === "not_delivered"
            ? "Invite saved, but push delivery did not complete."
            : undefined;

    return res.status(200).json({
      invite: {
        id: invite.id,
        sessionId: invite.session_id,
        recipientUserId: invite.recipient_user_id,
        status: invite.status,
      },
      notificationDelivered: notificationResult.delivered > 0,
      notificationMessage,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: error?.message || "Unable to create invite.",
    });
  }
}
