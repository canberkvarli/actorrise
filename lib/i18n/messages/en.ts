/**
 * English, the source of truth, assembled from one file per area so screens
 * can move over in parallel. Every other language is typed against these
 * files: a key added in en/ and missing in tr/ fails the typecheck.
 *
 * A screen that has not moved yet stays English in every language.
 * `{name}` is interpolated by t(). Stage directions keep their lowercase and
 * their parentheses in every language: that is the house voice.
 */
import { core } from "./en/core";
import { landing } from "./en/landing";
import { marketing } from "./en/marketing";
import { audiences } from "./en/audiences";
import { seo } from "./en/seo";
import type { Widen } from "./types";

export const en = { ...core, ...landing, ...marketing, ...audiences, ...seo };

export type Messages = Widen<typeof en>;
