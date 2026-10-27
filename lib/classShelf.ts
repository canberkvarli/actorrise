/** The class shelf's search box: a script matches on its title, or on any of
 *  its scenes' titles or the two characters in them. Case does not matter. */
export interface FilterableScript {
  title: string;
  scenes: { title: string; character_1_name: string; character_2_name: string }[];
}

export function filterShelf<T extends FilterableScript>(scripts: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return scripts;
  return scripts.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.scenes.some(
        (sc) =>
          sc.title.toLowerCase().includes(q) ||
          sc.character_1_name.toLowerCase().includes(q) ||
          sc.character_2_name.toLowerCase().includes(q),
      ),
  );
}
