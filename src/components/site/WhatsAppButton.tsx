import { MessageCircle } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/components/ui/cn";

/**
 * 1-click WhatsApp kickoff link to Ali's number (NEXT_PUBLIC_WHATSAPP_NUMBER).
 * Renders nothing when the number isn't configured.
 */
export function WhatsAppButton({ className }: { className?: string }) {
  if (!brand.whatsappNumber) return null;
  const digits = brand.whatsappNumber.replace(/[^0-9]/g, "");
  const text = encodeURIComponent(`مرحباً ${brand.owner}، أرغب ببدء مشروع مع ${brand.name}.`);
  return (
    <a
      href={`https://wa.me/${digits}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line/10 bg-line/[0.03] px-3.5 py-2 text-mist transition hover:border-line/25 hover:text-ivory",
        className,
      )}
    >
      <MessageCircle className="size-3.5" />
      WhatsApp
    </a>
  );
}
