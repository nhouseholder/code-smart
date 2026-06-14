import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Confidence } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(usd: number | null): string {
  if (usd === null) return "Contact sales";
  if (usd === 0) return "Free";
  return `$${usd.toFixed(usd % 1 === 0 ? 0 : 2)}/mo`;
}

export function formatLimitType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function confidenceLabel(c: Confidence): string {
  const map: Record<Confidence, string> = {
    observed: "Verified",
    inferred: "Inferred",
    assumed: "Estimated",
    stale: "Stale",
    unknown: "Unknown",
  };
  return map[c];
}

export function confidenceColor(c: Confidence): string {
  const map: Record<Confidence, string> = {
    observed: "text-green-700 bg-green-50 border-green-200",
    inferred: "text-blue-700 bg-blue-50 border-blue-200",
    assumed: "text-amber-700 bg-amber-50 border-amber-200",
    stale: "text-red-700 bg-red-50 border-red-200",
    unknown: "text-gray-500 bg-gray-50 border-gray-200",
  };
  return map[c];
}

export function confidenceDotColor(c: Confidence): string {
  const map: Record<Confidence, string> = {
    observed: "bg-green-600",
    inferred: "bg-blue-600",
    assumed: "bg-amber-500",
    stale: "bg-red-500",
    unknown: "bg-gray-400",
  };
  return map[c];
}

/** Staleness: >90 days from accessed_date = stale */
export function isStale(accessedDate: string): boolean {
  const accessed = new Date(accessedDate);
  const now = new Date();
  const days = (now.getTime() - accessed.getTime()) / (1000 * 60 * 60 * 24);
  return days > 90;
}

export function daysAgo(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}
