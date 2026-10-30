import Link from "next/link";
import { PLATFORM_RULES, type Platform } from "@/lib/platforms";
import { STATUS_STYLES } from "@/lib/constants";

const GLYPHS: Record<Platform, React.ReactNode> = {
  FACEBOOK: <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v9h4v-9h3l1-4h-4V9c0-.6.4-1 1-1z" />,
  INSTAGRAM: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.3" />
    </>
  ),
  TIKTOK: <path d="M16 3c.4 2.6 2 4.2 4.5 4.4v3.4c-1.6 0-3.1-.5-4.4-1.3v6.3c0 3.4-2.7 6.2-6.1 6.2S4 19.2 4 15.8s2.7-6 6.1-6c.3 0 .7 0 1 .1v3.5c-.3-.1-.6-.2-1-.2-1.5 0-2.7 1.2-2.7 2.7s1.2 2.7 2.7 2.7 2.7-1.2 2.7-2.7V3H16z" />,
  X: <path d="M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.3 4.7H5.5l11.2 14.5z" />,
  LINKEDIN: <path d="M4 3a2 2 0 110 4 2 2 0 010-4zM2.5 9h3v12h-3V9zm6 0h2.9v1.7c.5-.9 1.7-2 3.6-2 3.8 0 4.5 2.5 4.5 5.8V21h-3v-5.8c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1V21h-3V9z" />,
  YOUTUBE: <path d="M22 8.2c-.2-1.6-1-2.7-2.6-2.9C16.9 5 12 5 12 5s-4.9 0-7.4.3C3 5.5 2.2 6.6 2 8.2 1.8 9.6 1.8 12 1.8 12s0 2.4.2 3.8c.2 1.6 1 2.7 2.6 2.9 2.5.3 7.4.3 7.4.3s4.9 0 7.4-.3c1.6-.2 2.4-1.3 2.6-2.9.2-1.4.2-3.8.2-3.8s0-2.4-.2-3.8zM10 15V9l5.2 3L10 15z" />,
};

export function PlatformIcon({ platform, size = 20, className = "" }: { platform: Platform; size?: number; className?: string }) {
  const rules = PLATFORM_RULES[platform];
  return (
    <span
      title={rules.label}
      className={`inline-flex shrink-0 items-center justify-center rounded-md text-white ${className}`}
      style={{ background: rules.color, width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="currentColor" aria-hidden>
        {GLYPHS[platform]}
      </svg>
    </span>
  );
}

export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>
      {href && cta && (
        <Link href={href} className="btn-primary mt-4">
          {cta}
        </Link>
      )}
    </div>
  );
}
