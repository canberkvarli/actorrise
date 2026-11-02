"use client";

import { Glyph } from "@/components/brand/glyphs";
import { useT } from "@/lib/i18n";

/** The 404 bear, named in the reader's language. A client island so the
 *  not-found page itself stays a static server component. */
export function NotFoundBear() {
  const t = useT();
  return <Glyph name="bear" size={88} title={t("appShellErrors.bearTitle")} />;
}
