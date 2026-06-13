export function mergeSkillIds(...lists: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const list of lists) {
    if (!list) continue;
    for (const id of list) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
  }

  return merged;
}
