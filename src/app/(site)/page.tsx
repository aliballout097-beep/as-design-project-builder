import { ProjectBuilder } from "@/components/builder/ProjectBuilder";
import { Hero } from "@/components/site/Hero";
import { HowItWorks } from "@/components/site/HowItWorks";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export default function HomePage() {
  return (
    <main dir="rtl" lang="ar" className="automation-site relative">
      <SiteHeader />
      <Hero />
      <section id="builder" aria-label="Project builder" className="automation-builder-section">
        <div className="automation-container">
          <div className="automation-builder-heading">
            <div><p className="automation-kicker"><span /> 01 / مشروعك يبدأ من هون</p><h2>كل مشروع مميّز، <span>بيبدأ بفكرة واضحة.</span></h2></div>
            <p>اختر خدماتك وشاركنا التفاصيل. مخطّط المشروع يحسب تقديرك مباشرة، خطوة بخطوة.</p>
          </div>
          <ProjectBuilder variant="page" />
        </div>
      </section>
      <HowItWorks />
      <SiteFooter />
    </main>
  );
}
