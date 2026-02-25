import { VotesByVenue } from "../../lib/types";
import addVoterBadgeAvatars from "./voterBadgeAvatar";

const addVoteBadge = (parent: HTMLDivElement, venueId: string, votes: VotesByVenue, userById: Map<string, { avatarUrl: string }>) => {
  const voteCount = votes?.[venueId]?.length || 0;
  if (voteCount <= 0) return;

  const badge = document.createElement("div");
  badge.className =
    "absolute -right-1 -top-2 flex h-5 min-w-[26px] items-center justify-center rounded-full border border-white bg-slate-700 px-1 text-[10px] font-bold text-white shadow";

  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = "8px";
  svg.style.height = "8px";

  const path = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  path.setAttribute(
    "d",
    "m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z",
  );
  svg.appendChild(path);

  const text = document.createElement("span");
  text.textContent = String(voteCount);

  badge.appendChild(svg);
  badge.appendChild(text);
  addVoterBadgeAvatars(badge, venueId, votes, userById);
  parent.appendChild(badge);
};

export default addVoteBadge;