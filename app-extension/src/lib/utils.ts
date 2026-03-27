import { type ClassValue, clsx } from "clsx";
import { generateKeyBetween } from "fractional-indexing";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function compareByOrder<T extends { order: string }>(a: T, b: T): number {
  return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
}

export function toPascalCase(str: string): string {
  return str
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
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
