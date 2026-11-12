import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export function dateLabel(value: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(
    "en",
    options ?? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  ).format(new Date(value));
}
export function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
export function title(value: string) {
  return value.replaceAll(/[._-]/g, " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
}
