import { Instagram, Mail } from "lucide-react";
import { IconBrandX } from "@tabler/icons-react";

/**
 * Where to find Canberk.
 *
 * One list, because a handle that lives in two files is a handle that gets
 * changed in one of them. The footer and the founder note both read from here,
 * and they render it differently on purpose: the note spells the handles out
 * (someone who just read it wants something to type), the footer shows icons
 * only (a utility row that is already carrying nine links).
 *
 * Colour is deliberately NOT set here. These sit on opposite grounds — the note
 * on cream, the footer on ink — and a muted colour baked in would be invisible
 * on one of them. Each caller passes its own.
 */
export const SOCIALS = [
  {
    label: "@canberk.varli",
    name: "Instagram",
    href: "https://instagram.com/canberk.varli",
    Icon: Instagram,
  },
  {
    label: "@canberkvarli",
    name: "X",
    href: "https://x.com/canberkvarli",
    Icon: IconBrandX,
  },
  {
    label: "canberk@actorrise.com",
    name: "Email",
    href: "mailto:canberk@actorrise.com",
    Icon: Mail,
  },
] as const;

/** mailto: must not open a tab or carry rel; everything else must. */
export function externalProps(href: string) {
  return href.startsWith("mailto:")
    ? {}
    : { target: "_blank", rel: "noopener noreferrer" };
}
