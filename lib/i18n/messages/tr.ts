/** Türkçe. Each part is typed against its English file. */
import { core } from "./tr/core";
import { landing } from "./tr/landing";
import { marketing } from "./tr/marketing";
import { audiences } from "./tr/audiences";
import { seo } from "./tr/seo";
import type { Messages } from "./en";

export const tr: Messages = { ...core, ...landing, ...marketing, ...audiences, ...seo };
