// Short display names for model ids (docs/chat-sidebar.md §7.2).
// The ids in chat/config.json go to the CLI as-is; only the dock shortens them.
// Kept free of browser APIs so scripts/check-engine.mjs can load it.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function modelLabel(id: string): string {
  // Trailing release dates carry no meaning for the reader.
  const base = id.replace(/-\d{8}$/, '');
  const claude = /^claude-([a-z]+)-([\d-]+)$/.exec(base);
  if (claude) return `${cap(claude[1])} ${claude[2].replace(/-/g, '.')}`;
  const gpt = /^gpt-([\d.]+)(?:-([a-z]+))?$/.exec(base);
  if (gpt) return `GPT-${gpt[1]}${gpt[2] ? ` ${cap(gpt[2])}` : ''}`;
  return base;
}
