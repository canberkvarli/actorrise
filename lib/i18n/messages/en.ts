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
import { appSearch } from "./en/appSearch";
import { appMonologue } from "./en/appMonologue";
import { appPractice } from "./en/appPractice";
import { appScenes } from "./en/appScenes";
import { appAuditions } from "./en/appAuditions";
import { appShell } from "./en/appShell";
import { appAccount } from "./en/appAccount";
import { content } from "./en/content";
import type { Widen } from "./types";

export const en = { ...core, ...landing, ...marketing, ...audiences, ...seo, ...appSearch, ...appMonologue, ...appPractice, ...appScenes, ...appAuditions, ...appShell, ...appAccount, ...content };

export type Messages = Widen<typeof en>;
