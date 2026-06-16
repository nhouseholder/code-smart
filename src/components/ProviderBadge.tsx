import Link from "next/link";
import { cn } from "@/lib/utils";

/** Brand colors per provider id. Fallback dark-gray for unmapped providers. */
export const PROVIDER_BADGE: Record<string, { bg: string; text: string }> = {
  anthropic: { bg: "bg-[#d97757]", text: "text-white" },
  openai: { bg: "bg-[#10a37f]", text: "text-white" },
  "github-copilot": { bg: "bg-[#1f2328]", text: "text-white" },
  cursor: { bg: "bg-[#000000]", text: "text-white" },
  google: { bg: "bg-[#4285f4]", text: "text-white" },
};

export function providerBadgeColors(providerId: string) {
  return PROVIDER_BADGE[providerId] ?? { bg: "bg-gray-800", text: "text-white" };
}

interface Props {
  providerId: string;
  name: string;
  /** Wrap in a link to the provider detail page. */
  href?: string;
  size?: "sm" | "md";
  className?: string;
}

export function ProviderBadge({ providerId, name, href, size = "md", className }: Props) {
  const c = providerBadgeColors(providerId);
  const pill = cn(
    "inline-flex items-center rounded-full font-semibold",
    size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
    c.bg,
    c.text,
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(pill, "transition-all duration-200 hover:brightness-110 cursor-pointer")}>
        {name}
      </Link>
    );
  }
  return <span className={pill}>{name}</span>;
}
