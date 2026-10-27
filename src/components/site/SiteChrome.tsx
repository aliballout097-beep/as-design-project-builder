import { ArrowUpRight, LayoutDashboard, Images, ArrowDown } from "lucide-react";
import { brand } from "@/config/brand";
import { SoundToggle } from "@/components/ui/ClickSound";
import { Logo } from "@/components/ui/Logo";
import { WhatsAppButton } from "./WhatsAppButton";
export function SiteHeader() {
  return (
    <header className="automation-header">
      <div className="automation-container automation-header-inner">
        <Logo subtitle="WEB · SYSTEMS · BRANDING" />
        <nav aria-label="تصفّح الاستوديو" className="automation-header-nav" dir="rtl">
          <a href="#how-it-works" className="automation-nav-how">كيف تعمل الخدمة</a>
          <a href={brand.portfolioUrl} target="_blank" rel="noopener" className="automation-nav-work"><Images size={16} /> أعمالنا</a>
          <a href={brand.siteUrl} className="automation-nav-studio"><span dir="ltr">asdesignlb.com</span><ArrowUpRight size={15} /></a>
          <span className="automation-header-whatsapp"><WhatsAppButton /></span>
          <SoundToggle />
          <a href="#builder" className="automation-button automation-nav-quote">ابدأ مشروعك<ArrowDown size={16} /></a>
        </nav>
      </div>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="automation-footer">
      <div className="automation-container">
        <div className="automation-footer-grid">
          <div><Logo href={brand.siteUrl} subtitle="WEB · SYSTEMS · BRANDING" /><p>تصميم بشخصية. تطوير بهدف.<br />نحو حضور يعبّر عن مشروعك.</p></div>
          <div><h2>الاستوديو</h2><a href={brand.siteUrl}>الموقع الأساسي ↗</a><a href={brand.portfolioUrl} target="_blank" rel="noopener">أعمالنا ↗</a><a href="#how-it-works">كيف تعمل الخدمة</a><a href="#builder">ابدأ مشروعك ↗</a></div>
          <div><h2>خلّينا نحكي</h2><a href={`mailto:${brand.contactEmail}`} dir="ltr">{brand.contactEmail}</a><WhatsAppButton />{brand.location ? <p>{brand.location}</p> : null}<p className="automation-footer-privacy">تُستخدم تفاصيل مشروعك فقط لإعداد عرضك ومناقشته.</p></div>
        </div>
        <div className="automation-footer-bottom"><p>© {new Date().getFullYear()} {brand.name} · Ali Mawla</p><a href="/admin"><LayoutDashboard size={13} /> دخول لوحة التحكم</a><span dir="ltr">YOUR NEXT CHAPTER ↗</span></div>
      </div>
    </footer>
  );
}
