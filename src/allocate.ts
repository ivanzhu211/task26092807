export interface Share {
  key: string;
  weight: bigint;
}

export function allocate(total: bigint, shares: Share[]): Map<string, bigint> {
  const result = new Map<string, bigint>();
  if (total < 0n) throw new Error("total must be non-negative");
  const sorted = [...shares].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  let sumW = 0n;
  for (const s of sorted) {
    if (s.weight < 0n) throw new Error("weight must be non-negative");
    sumW += s.weight;
  }
  if (total === 0n || sumW === 0n || sorted.length === 0) {
    for (const s of sorted) result.set(s.key, 0n);
    return result;
  }
  const bases: bigint[] = [];
  const fracs: bigint[] = [];
  let assigned = 0n;
  for (const s of sorted) {
    const exact = total * s.weight;
    const base = exact / sumW;
    bases.push(base);
    fracs.push(exact - base * sumW);
    assigned += base;
  }
  let remainder = total - assigned;
  const order = sorted.map((_, i) => i);
  order.sort((a, b) => {
    if (fracs[a] !== fracs[b]) return fracs[a] > fracs[b] ? -1 : 1;
    return sorted[a].key < sorted[b].key ? -1 : 1;
  });
  for (let i = 0; remainder > 0n; i = (i + 1) % order.length) {
    bases[order[i]] += 1n;
    remainder -= 1n;
  }
  for (let i = 0; i < sorted.length; i++) result.set(sorted[i].key, bases[i]);
  return result;
}
