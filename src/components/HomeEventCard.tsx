import { Link } from "@tanstack/react-router";
import {
  homeEventCardImageUrl,
  type HomeEventCardConfig,
} from "@/lib/homeEventCard";
import { isInternalAppLink } from "@/lib/movementChallenge";

type Props = {
  config: HomeEventCardConfig;
};

export function HomeEventCard({ config }: Props) {
  const image = homeEventCardImageUrl(config);
  const href = config.link_url.trim() || "/schedule";
  const label = config.link_label.trim() || "Learn more";

  const inner = (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {image ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
          <img src={image} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="space-y-2 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {config.event_date ? <span>{config.event_date}</span> : null}
          {config.price_label ? (
            <span className="rounded-full bg-[#f4f7f0] px-2 py-0.5 text-[#4a6b3c]">
              {config.price_label}
            </span>
          ) : null}
        </div>
        <h3 className="font-display text-xl font-bold leading-tight">{config.title}</h3>
        {config.body_text ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{config.body_text}</p>
        ) : null}
        <p className="pt-1 text-sm font-semibold text-[#a3b693]">{label}</p>
      </div>
    </article>
  );

  if (isInternalAppLink(href)) {
    return (
      <Link to={href as "/"} className="block transition-opacity active:opacity-90">
        {inner}
      </Link>
    );
  }

  return (
    <a href={href} className="block transition-opacity active:opacity-90" target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  );
}
