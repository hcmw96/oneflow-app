import { MessageCircle } from "lucide-react";

export function WhatsAppFab() {
  return (
    <a
      href="https://wa.me/27825533033"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp One Flow"
      className="fixed bottom-24 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/15 transition-transform active:scale-95"
    >
      <MessageCircle className="h-5 w-5" />
    </a>
  );
}
