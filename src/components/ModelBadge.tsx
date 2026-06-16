import Link from "next/link";
import { cn } from "@/lib/utils";

interface Props {
  modelId: string;
  displayName: string;
  /** Mark the plan's default model. */
  isDefault?: boolean;
  /** Access qualifier shown as a faint suffix (e.g. "limited"). */
  accessNote?: string;
  /** Link to the model detail page. Omit for a static chip. */
  href?: string;
  className?: string;
}

/** Model chip; links to `/models/[id]` when `href` is given. */
export function ModelBadge({ modelId, displayName, isDefault = false, accessNote, href, className }: Props) {
  const chip = cn(
    "inline-flex items-center px-2 py-0.5 rounded text-[11px] border transition-colors",
    isDefault
      ? "bg-brand-50 border-brand-200 text-brand-700 font-medium"
      : "bg-gray-50 border-gray-200 text-gray-600",
    href && "hover:border-brand-300 hover:text-brand-700 cursor-pointer",
    className,
  );

  const inner = (
    <>
      {displayName}
      {accessNote && <span className="ml-1 text-[9px] opacity-60">{accessNote}</span>}
    </>
  );

  if (href) {
    return (
      <Link key={modelId} href={href} className={chip}>
        {inner}
      </Link>
    );
  }
  return <span className={chip}>{inner}</span>;
}
