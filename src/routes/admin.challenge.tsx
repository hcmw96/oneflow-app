import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { HomeSpotlightCard } from "@/components/HomeSpotlightCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_MOVEMENT_CHALLENGE,
  fetchMovementChallengeConfig,
  homeSpotlightImageUrl,
  movementChallengeTotalDays,
  saveMovementChallengeConfig,
  type HomeSpotlightCardMode,
  type MovementChallengeConfig,
} from "@/lib/movementChallenge";
import { getUser } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import {
  DEFAULT_HOME_EVENT_CARD,
  fetchHomeEventCardConfig,
  saveHomeEventCardConfig,
  type HomeEventCardConfig,
} from "@/lib/homeEventCard";
import { HomeEventCard } from "@/components/HomeEventCard";

export const Route = createFileRoute("/admin/challenge")({
  head: () => ({ meta: [{ title: "Home Spotlight — One Flow Admin" }] }),
  component: AdminChallengePage,
});

type ImageTarget = "challenge" | "promo" | "event";

function AdminChallengePage() {
  const [config, setConfig] = useState<MovementChallengeConfig>(DEFAULT_MOVEMENT_CHALLENGE);
  const [eventCard, setEventCard] = useState<HomeEventCardConfig>(DEFAULT_HOME_EVENT_CARD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageTarget, setImageTarget] = useState<ImageTarget>("challenge");
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await fetchMovementChallengeConfig({ bypassCache: true }));
      setEventCard(await fetchHomeEventCardConfig({ bypassCache: true }));
    } catch (e) {
      console.error(e);
      toast.error("Could not load spotlight settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = <K extends keyof MovementChallengeConfig>(
    key: K,
    value: MovementChallengeConfig[K],
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateEventCard = <K extends keyof HomeEventCardConfig>(
    key: K,
    value: HomeEventCardConfig[K],
  ) => {
    setEventCard((prev) => ({ ...prev, [key]: value }));
  };

  const isPromoMode = config.home_card_mode === "event" || config.home_card_mode === "offer";

  const save = async () => {
    if (isPromoMode && !config.promo_title.trim()) {
      toast.error("Promo title is required for events and offers");
      return;
    }
    if (config.home_card_mode === "challenge" && !config.title.trim()) {
      toast.error("Challenge title is required");
      return;
    }
    if (config.enabled) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(config.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(config.end_date)) {
        toast.error("Use YYYY-MM-DD for challenge start and end dates");
        return;
      }
      if (config.end_date < config.start_date) {
        toast.error("Challenge end date must be on or after start date");
        return;
      }
    }
    const promoLink = config.promo_link.trim();
    if (isPromoMode && promoLink.startsWith("http") && !promoLink.startsWith("https://")) {
      toast.error("External promo links must use https://");
      return;
    }

    setSaving(true);
    try {
      const user = await getUser();
      await saveMovementChallengeConfig(
        {
          ...config,
          badge_label: config.badge_label.trim(),
          title: config.title.trim(),
          subtitle: config.subtitle.trim(),
          stamp_help_text: config.stamp_help_text.trim(),
          booking_banner_text: config.booking_banner_text.trim(),
          promo_badge_label: config.promo_badge_label.trim(),
          promo_title: config.promo_title.trim(),
          promo_subtitle: config.promo_subtitle.trim(),
          promo_link: promoLink,
          promo_link_label: config.promo_link_label.trim(),
        },
        user?.id ?? null,
      );
      await saveHomeEventCardConfig({
        ...eventCard,
        image_url: eventCard.image_url.trim(),
        event_date: eventCard.event_date.trim(),
        price_label: eventCard.price_label.trim(),
        title: eventCard.title.trim(),
        body_text: eventCard.body_text.trim(),
        link_url: eventCard.link_url.trim() || "/schedule",
        link_label: eventCard.link_label.trim() || "Learn more",
      });
      toast.success("Saved");
    } catch (e) {
      console.error(e);
      toast.error(supabaseErrorMessage(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  const onImagePick = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadChallengeImage(file);
      if (imageTarget === "event") {
        updateEventCard("image_url", url);
      } else if (imageTarget === "promo") {
        update("promo_image_url", url);
      } else {
        update("image_url", url);
      }
      toast.success("Image uploaded");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const totalDays = movementChallengeTotalDays(config);
  const previewConfig =
    config.home_card_mode === "hidden"
      ? { ...config, home_card_mode: "challenge" as const }
      : config;

  return (
    <div>
      <PageHeader
        title="Home spotlight & event card"
        description="Spotlight and event cards appear at the bottom of the member home page — below bookings and schedule actions."
        actions={
          <Button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving}
            className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 font-display text-lg font-semibold">Home card</h3>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>What to show</Label>
                <Select
                  value={config.home_card_mode}
                  onValueChange={(v) => update("home_card_mode", v as HomeSpotlightCardMode)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="challenge">Movement challenge</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="offer">Special offer</SelectItem>
                    <SelectItem value="hidden">Hidden (no card)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isPromoMode ? (
                <div className="grid gap-4 rounded-xl border border-border/80 bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">
                    Promote an event or offer on the home card. Members tap through to your link.
                  </p>
                  <div className="grid gap-1.5">
                    <Label htmlFor="promo-badge">Badge</Label>
                    <Input
                      id="promo-badge"
                      value={config.promo_badge_label}
                      onChange={(e) => update("promo_badge_label", e.target.value)}
                      disabled={loading}
                      placeholder="Special offer"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="promo-title">Title</Label>
                    <Input
                      id="promo-title"
                      value={config.promo_title}
                      onChange={(e) => update("promo_title", e.target.value)}
                      disabled={loading}
                      placeholder="Mother's Day brunch"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="promo-subtitle">Subtitle (home card)</Label>
                    <Input
                      id="promo-subtitle"
                      value={config.promo_subtitle}
                      onChange={(e) => update("promo_subtitle", e.target.value)}
                      disabled={loading}
                      placeholder="Sunday 11 May · Limited spots"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="promo-link">Link</Label>
                    <Input
                      id="promo-link"
                      value={config.promo_link}
                      onChange={(e) => update("promo_link", e.target.value)}
                      disabled={loading}
                      placeholder="/schedule or https://…"
                    />
                    <p className="text-xs text-muted-foreground">
                      App path (e.g. /schedule, /pricing) or full https URL.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="promo-cta">Call to action</Label>
                    <Input
                      id="promo-cta"
                      value={config.promo_link_label}
                      onChange={(e) => update("promo_link_label", e.target.value)}
                      disabled={loading}
                      placeholder="Tap to view →"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="promo-image-url">Promo image URL</Label>
                    <Input
                      id="promo-image-url"
                      value={config.promo_image_url}
                      onChange={(e) => update("promo_image_url", e.target.value)}
                      disabled={loading}
                      placeholder="Optional — falls back to challenge image"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={loading || uploading}
                    onClick={() => {
                      setImageTarget("promo");
                      imageInputRef.current?.click();
                    }}
                  >
                    {uploading && imageTarget === "promo" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                    Upload promo image
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 font-display text-lg font-semibold">Movement challenge</h3>
            <label className="mb-4 flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={config.enabled}
                onCheckedChange={(v) => update("enabled", v === true)}
                disabled={loading}
              />
              <span className="text-sm">
                Enable stamp tracking, /challenge page, and booking banners
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ch-badge">Badge label</Label>
                <Input
                  id="ch-badge"
                  value={config.badge_label}
                  onChange={(e) => update("badge_label", e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ch-title">Title</Label>
                <Input
                  id="ch-title"
                  value={config.title}
                  onChange={(e) => update("title", e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ch-subtitle">Subtitle (/challenge page)</Label>
                <Input
                  id="ch-subtitle"
                  value={config.subtitle}
                  onChange={(e) => update("subtitle", e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ch-booking">Booking sheet banner</Label>
                <Input
                  id="ch-booking"
                  value={config.booking_banner_text}
                  onChange={(e) => update("booking_banner_text", e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ch-stamp-help">Stamp card footnote</Label>
                <Textarea
                  id="ch-stamp-help"
                  rows={3}
                  value={config.stamp_help_text}
                  onChange={(e) => update("stamp_help_text", e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-5">
              <h4 className="mb-3 text-sm font-semibold">Challenge dates</h4>
              <p className="mb-4 text-sm text-muted-foreground">
                Check-ins during this range earn stamps ({totalDays} day
                {totalDays === 1 ? "" : "s"}).
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="ch-start">Start date</Label>
                  <Input
                    id="ch-start"
                    type="date"
                    value={config.start_date}
                    onChange={(e) => update("start_date", e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ch-end">End date</Label>
                  <Input
                    id="ch-end"
                    type="date"
                    value={config.end_date}
                    onChange={(e) => update("end_date", e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-5">
              <h4 className="mb-3 text-sm font-semibold">Challenge hero image</h4>
              <div className="grid gap-1.5">
                <Label htmlFor="ch-image-url">Image URL</Label>
                <Input
                  id="ch-image-url"
                  value={config.image_url}
                  onChange={(e) => update("image_url", e.target.value)}
                  disabled={loading}
                  placeholder="Leave blank for default studio photo"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-3 gap-2"
                disabled={loading || uploading}
                onClick={() => {
                  setImageTarget("challenge");
                  imageInputRef.current?.click();
                }}
              >
                {uploading && imageTarget === "challenge" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                Upload challenge image
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-1 font-display text-lg font-semibold">Event card (bottom of home)</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Separate promo card with image, date, price, and copy. Shown below core home content,
              alongside the spotlight card.
            </p>
            <div className="grid gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={eventCard.enabled}
                  onCheckedChange={(v) => updateEventCard("enabled", v === true)}
                  disabled={loading}
                />
                Show event card on home
              </label>
              <div className="grid gap-1.5">
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  value={eventCard.title}
                  onChange={(e) => updateEventCard("title", e.target.value)}
                  disabled={loading}
                  placeholder="Summer solstice workshop"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="event-date">Date (display text)</Label>
                  <Input
                    id="event-date"
                    value={eventCard.event_date}
                    onChange={(e) => updateEventCard("event_date", e.target.value)}
                    disabled={loading}
                    placeholder="Saturday 12 July"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="event-price">Price (display text)</Label>
                  <Input
                    id="event-price"
                    value={eventCard.price_label}
                    onChange={(e) => updateEventCard("price_label", e.target.value)}
                    disabled={loading}
                    placeholder="R450"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-body">Description</Label>
                <Textarea
                  id="event-body"
                  value={eventCard.body_text}
                  onChange={(e) => updateEventCard("body_text", e.target.value)}
                  disabled={loading}
                  rows={3}
                  placeholder="What members should know about this event…"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-link">Link</Label>
                <Input
                  id="event-link"
                  value={eventCard.link_url}
                  onChange={(e) => updateEventCard("link_url", e.target.value)}
                  disabled={loading}
                  placeholder="/schedule or https://…"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-cta">Call to action</Label>
                <Input
                  id="event-cta"
                  value={eventCard.link_label}
                  onChange={(e) => updateEventCard("link_label", e.target.value)}
                  disabled={loading}
                  placeholder="Book your spot"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-image-url">Image URL</Label>
                <Input
                  id="event-image-url"
                  value={eventCard.image_url}
                  onChange={(e) => updateEventCard("image_url", e.target.value)}
                  disabled={loading}
                  placeholder="Optional hero image"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={loading || uploading}
                onClick={() => {
                  setImageTarget("event");
                  imageInputRef.current?.click();
                }}
              >
                {uploading && imageTarget === "event" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                Upload event image
              </Button>
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Home preview
          </p>
          {config.home_card_mode === "hidden" ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Card hidden on home
            </p>
          ) : (
            <div className="pointer-events-none">
              <HomeSpotlightCard
                config={previewConfig}
                challengeStamped={0}
                challengeTotalDays={totalDays}
              />
            </div>
          )}
          {!isPromoMode && config.home_card_mode !== "hidden" ? (
            <p className="text-xs text-muted-foreground">
              Image: {homeSpotlightImageUrl(config) ? "custom" : "default"}
            </p>
          ) : null}
          {eventCard.enabled && eventCard.title.trim() ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Event card preview
              </p>
              <div className="pointer-events-none">
                <HomeEventCard config={eventCard} />
              </div>
            </>
          ) : null}
        </aside>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onImagePick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
