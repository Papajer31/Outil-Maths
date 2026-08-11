import { renderSoundBubble as renderSharedSoundBubble } from "../../shared/sound-bubble.js";

export function renderSoundBubble(text, options = {}) {
  return renderSharedSoundBubble(text, { ...options, baseClass:"rg-sound-bubble" });
}
