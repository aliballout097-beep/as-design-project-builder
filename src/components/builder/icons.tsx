import { Bot, Clapperboard, FileText, Gem, LayoutTemplate, Megaphone, Monitor, PenTool, Receipt, Search, ShoppingBag, Smartphone, Sparkles, type LucideIcon } from "lucide-react";
import type { CatalogIcon } from "@/config/catalog";

export const SERVICE_ICONS: Record<CatalogIcon, LucideIcon> = {
  gem: Gem,
  monitor: Monitor,
  "shopping-bag": ShoppingBag,
  "pen-tool": PenTool,
  smartphone: Smartphone,
  bot: Bot,
  search: Search,
  megaphone: Megaphone,
  clapperboard: Clapperboard,
  layout: LayoutTemplate,
  receipt: Receipt,
  sparkles: Sparkles,
  "file-text": FileText,
};
