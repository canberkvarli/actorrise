/** A dictionary's shape with every literal widened to string, so another
 *  language can be typed against the English file. */
export type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? readonly string[]
    : { [K in keyof T]: Widen<T[K]> };
