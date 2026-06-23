"use client";
import { useState } from "react";
import { providerBadgeColors } from "./ProviderBadge";

const LOGO_SLUG_MAP: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  "github-copilot": "github",
  "copilot-xcode": "github",
  // ponytail: microsoft not in Simple Icons; falls back to initials
  meta: "meta",
  mistral: "mistral",
  deepseek: "deepseek",
};

interface Props {
  providerId: string;
  name: string;
  size?: number;
}

export function ProviderLogo({ providerId, name, size = 32 }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const slug = LOGO_SLUG_MAP[providerId];
  const colors = providerBadgeColors(providerId);
  const initials = name.split(/[\s-]/)[0]?.slice(0, 2).toUpperCase() ?? "??";

  if (slug && !imgFailed) {
    return (
      <img
        src={`/logos/${slug}.svg`}
        width={size}
        height={size}
        alt={name}
        className="object-contain dark:invert"
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-bold text-white ${colors.bg}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </span>
  );
}
