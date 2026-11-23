export function adjacentTabKey(order: string[], current: string | undefined, offset: -1 | 1) {
  if (!current || order.length === 0) return
  const index = order.indexOf(current)
  if (index === -1) return
  return order[(index + offset + order.length) % order.length]
}

export function mergeVisibleTabOrder(all: string[], current: string[], next: string[]) {
  const visible = new Set(current)
  const reordered = next.values()
  return all.map((key) => (visible.has(key) ? (reordered.next().value ?? key) : key))
}

export function mainTabKey(order: string[], current: string | undefined, recent?: string) {
  if (current && order.includes(current)) return current
  if (recent && order.includes(recent)) return recent
  return order[order.length - 1]
}
