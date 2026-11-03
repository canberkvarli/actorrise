"use client";

/**
 * ⌘K: everything the Studio can do, in one box. Type a few letters, Enter.
 * shadcn's Command (cmdk) does the filtering and the keys; the page hands in
 * the commands.
 */

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { EASE } from "./style";
import { Kbd } from "./ui";

export type Command = {
  id: string;
  group: "Go to" | "Role" | "Stage";
  name: string;
  /** Extra words it answers to. */
  keywords?: string;
  kbd?: string;
  run: () => void;
};

const GROUPS: Command["group"][] = ["Role", "Go to", "Stage"];

export default function CommandMenu({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Commands"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "14vh",
        background: "rgba(0,0,0,0.45)",
        animation: `cmd-in 160ms ${EASE}`,
      }}
    >
      <div className="sui-sheet" style={{ width: "min(calc(100vw - 32px), 560px)", borderRadius: 10 }}>
        <Command loop>
          <CommandInput placeholder="Type a command, or a way to move…" autoFocus />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {GROUPS.map((g) => {
              const items = commands.filter((c) => c.group === g);
              if (!items.length) return null;
              return (
                <CommandGroup key={g} heading={g}>
                  {items.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.keywords ?? ""}`}
                      onSelect={() => {
                        onClose();
                        c.run();
                      }}
                    >
                      <span>{c.name}</span>
                      {c.kbd && <Kbd>{c.kbd}</Kbd>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </div>
      <style>{`@keyframes cmd-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
