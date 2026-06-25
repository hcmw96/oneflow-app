import { Link } from "@tanstack/react-router";
import {
  challengeHeroImageUrl,
  homeSpotlightFootnote,
  homeSpotlightHref,
  homeSpotlightImageUrl,
  isInternalAppLink,
  type MovementChallengeConfig,
} from "@/lib/movementChallenge";

type Props = {
  config: MovementChallengeConfig;
  challengeStamped?: number;
  challengeTotalDays?: number;
};

export function HomeSpotlightCard({
  config,
  challengeStamped = 0,
  challengeTotalDays = 31,
}: Props) {
  const image = homeSpotlightImageUrl(config);
  const href = homeSpotlightHref(config);
  const footnote = homeSpotlightFootnote(config, challengeStamped, challengeTotalDays);
  const badge =
    config.home_card_mode === "challenge"
      ? config.badge_label
      : config.promo_badge_label;
  const title =
    config.home_card_mode === "challenge" ? config.title : config.promo_title;

  const inner = (
    <>
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/25" />
      <div className="relative p-5">
        <span className="inline-block rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
          {badge}
        </span>
        <h3 className="mt-2 font-display text-2xl font-bold text-white">{title}</h3>
        <p className="mt-1 text-xs text-white/80">{footnote}</p>
      </div>
    </>
  );

  const className = "relative block overflow-hidden rounded-2xl";

  if (isInternalAppLink(href)) {
    return (
      <Link to={href as "/"} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  );
}

export function homeSpotlightCardVisible(config: MovementChallengeConfig): boolean {
  return config.home_card_mode !== "hidden";
}
