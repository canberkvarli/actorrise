/** Türkçe. Each part is typed against its English file. */
import { core } from "./tr/core";
import { landing } from "./tr/landing";
import { marketing } from "./tr/marketing";
import { audiences } from "./tr/audiences";
import { seo } from "./tr/seo";
import { appSearch } from "./tr/appSearch";
import { appMonologue } from "./tr/appMonologue";
import { appPractice } from "./tr/appPractice";
import { appScenes } from "./tr/appScenes";
import { appAuditions } from "./tr/appAuditions";
import { appShell } from "./tr/appShell";
import { appAccount } from "./tr/appAccount";
import { content } from "./tr/content";
import type { Messages } from "./en";

export const tr: Messages = { ...core, ...landing, ...marketing, ...audiences, ...seo, ...appSearch, ...appMonologue, ...appPractice, ...appScenes, ...appAuditions, ...appShell, ...appAccount, ...content };
