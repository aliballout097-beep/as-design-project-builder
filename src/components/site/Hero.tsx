import { ArrowDown, ArrowUpLeft, Check, Clock3, FileText, Images, Sparkles } from "lucide-react";
import { brand } from "@/config/brand";
const MARKERS = [
  { icon: Clock3, value: "3 دقائق", label: "لتعبئة التفاصيل" },
  { icon: Sparkles, value: "فوري", label: "تقدير السعر" },
  { icon: FileText, value: "PDF", label: "يصلك على بريدك" },
];
const BRIEF_STEPS = ["الخدمات التي تحتاجها", "فكرتك وأهداف مشروعك", "الخطة والميزانية", "تفاصيل التواصل"];
export function Hero() {
  return (
    <section className="automation-hero">
      <div className="automation-container automation-hero-grid">
        <div className="automation-hero-copy">
          <p className="automation-kicker"><span /> AS DESIGN LB · خطوتك الجاية</p>
          <h1>أخبرنا عمّا تريد بناءه.<br /><em>وعرضك يصلك خلال دقائق.</em></h1>
          <p className="automation-hero-description">اختر خدماتك وصف فكرتك باختصار — نحسب لك السعر مباشرة من أسعارنا الحقيقية، ونرسل لك عرضاً مفصّلاً بصيغة PDF على بريدك.</p>
          <div className="automation-actions">
            <a href="#builder" className="automation-button"><ArrowDown size={18} /> ابدأ الآن — مجاناً</a>
            <a href={brand.portfolioUrl} target="_blank" rel="noopener" className="automation-button automation-button-outline"><Images size={18} /> شاهد أعمالنا</a>
          </div>
          <div className="automation-hero-proof"><span><Check size={15} /> تقدير مباشر</span><span><Check size={15} /> عرض مفصّل لمشروعك</span><span><Check size={15} /> تواصل مع الاستوديو</span></div>
        </div>
        <aside className="automation-brief" aria-label="مراحل طلب عرض السعر">
          <div className="automation-brief-top"><span dir="ltr">YOUR NEXT CHAPTER</span><ArrowUpLeft size={23} /></div>
          <p className="automation-brief-eyebrow">مشروعك، بطريقتك.</p>
          <h2>فكرة واضحة.<br /><span>عرض على قدّها.</span></h2>
          <ol>{BRIEF_STEPS.map((step, index) => <li key={step}><span dir="ltr">0{index + 1}</span>{step}<Check size={15} /></li>)}</ol>
          <div className="automation-brief-bottom"><FileText size={20} /><span>نطاق · مراحل · مدة · استثمار</span><span dir="ltr">AS / LB</span></div>
        </aside>
      </div>
      <div className="automation-hero-markers"><dl className="automation-container">{MARKERS.map(marker => <div key={marker.label}><dt><marker.icon size={23} aria-hidden />{marker.label}</dt><dd>{marker.value}</dd></div>)}</dl></div>
    </section>
  );
}
