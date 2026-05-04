/** Filter a list of entries by department */
export function filterByDept<T extends { department: string }>(
  entries: T[],
  selected: string[],
): T[] {
  return entries.filter((e) => selected.includes(e.department));
}
