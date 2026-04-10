import { generateKeyBetween } from "fractional-indexing";

export function compareByOrder<T extends { order: string }>(a: T, b: T): number {
  return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
}

export function computeOrderBetween<T extends { order: string }>(
  items: T[],
  oldIndex: number,
  newIndex: number,
): string {
  let lowerBound: string | null = null;
  let upperBound: string | null = null;

  if (newIndex < oldIndex) {
    lowerBound = newIndex > 0 ? items[newIndex - 1].order : null;
    upperBound = items[newIndex].order;
  } else {
    lowerBound = items[newIndex].order;
    upperBound = newIndex < items.length - 1 ? items[newIndex + 1].order : null;
  }

  return generateKeyBetween(lowerBound, upperBound);
}
