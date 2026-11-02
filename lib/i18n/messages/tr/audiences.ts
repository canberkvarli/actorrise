import type { Widen } from "../types";
import type { audiences as en } from "../en/audiences";

export const audiences: Widen<typeof en> = {};
