export default function addVoterBadgeAvatars(parent: HTMLDivElement, venueId: string, votes: Record<string, string[]>, userById: Map<string, { avatarUrl: string }> ) {
  const voterIds = votes?.[venueId] || [];
  if (voterIds.length === 0) return;
  const stack = document.createElement("div");
  stack.className = "ml-1 flex items-center";

  const maxVisible = 5;
  const visible = voterIds.slice(0, maxVisible);
  visible.forEach((id, index) => {
    const user = userById.get(id);
    if (!user) return;
    const avatar = document.createElement("div");
    avatar.className =
      "h-3.5 w-3.5 rounded-full border border-white shadow-sm";
    avatar.style.marginLeft = index === 0 ? "0" : "-7px";
    avatar.style.backgroundImage = `url(${user.avatarUrl})`;
    avatar.style.backgroundSize = "cover";
    avatar.style.backgroundPosition = "center";
    stack.appendChild(avatar);
  });

  if (voterIds.length > maxVisible) {
    const more = document.createElement("div");
    more.className =
      "ml-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-ink px-1 text-[8px] font-bold text-white";
    more.textContent = `+${voterIds.length - maxVisible}`;
    stack.appendChild(more);
  }

  parent.appendChild(stack);
};