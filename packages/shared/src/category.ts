export type Category = { id: string; parent_id: string; name: string; children?: Category[] };

export function flattenCats(nodes: Category[], prefix = "", excludeId?: string) {
  const out: { value: string; code: string; description: string }[] = [];
  for (const n of nodes) {
    if (n.id === excludeId) continue;
    const path = prefix ? `${prefix} → ${n.name}` : n.name;
    out.push({ value: n.id, code: "", description: path });
    out.push(...flattenCats(n.children || [], path, excludeId));
  }
  return out;
}

export function categoryPath(id: string, nodes: Category[], prefix = ""): string {
  for (const n of nodes) {
    const path = prefix ? `${prefix} → ${n.name}` : n.name;
    if (n.id === id) return path;
    const inner = categoryPath(id, n.children || [], path);
    if (inner) return inner;
  }
  return "";
}

export function categoryWithDescendants(nodes: Category[], id: string) {
  const ids = new Set<string>();
  function walk(list: Category[], on: boolean) {
    for (const n of list) {
      const match = on || n.id === id;
      if (match) ids.add(n.id);
      walk(n.children || [], match);
    }
  }
  walk(nodes, false);
  return ids;
}
