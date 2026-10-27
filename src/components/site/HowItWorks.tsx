import { FileCheck2, Mail, PenLine, Workflow } from "lucide-react";

const STEPS = [
  {
    icon: PenLine,
    title: "شارك تفاصيل مشروعك",
    body: "اختر الخدمات، صف أهدافك، وحدّد ميزانية وجدولاً زمنياً واقعياً. مخططك المباشر يسعّر ذلك أولاً بأول.",
  },
  {
    icon: Workflow,
    title: "تحديد النطاق بالذكاء الاصطناعي",
    body: "يطابق مساعدنا طلبك مع باقاتنا وأسعارنا المنشورة: التسليمات، المراحل، المدة، والاستثمار الموصى به.",
  },
  {
    icon: Mail,
    title: "عرضك يصلك تلقائياً",
    body: "خلال دقائق يصلك عرض مفصّل بصيغة PDF على بريدك الإلكتروني، مع رابط خاص لمراجعته أونلاين.",
  },
  {
    icon: FileCheck2,
    title: "الموافقة والانطلاق",
    body: "وافق على العرض بنقرة واحدة، ونتواصل معك مباشرة لتحديد موعد الانطلاق.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="automation-how-section automation-container scroll-mt-28">
      <div className="max-w-2xl">
        <p className="automation-kicker"><span /> 02 / كيف تعمل الخدمة</p>
        <h2 className="text-balance-safe mt-3 font-display text-[26px] font-bold leading-[1.35] text-ivory sm:text-[44px]">
          من الفكرة إلى عرض سعر واضح، <span className="text-ember-gradient">دون انتظار ولا مراسلات طويلة.</span>
        </h2>
      </div>
      <ol className="mt-8 grid gap-3 sm:mt-12 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="glass edge-light group relative rounded-3xl p-5 transition-transform sm:p-6 duration-500 ease-out-expo hover:-translate-y-1">
            <span className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-2xl border border-line/10 bg-line/[0.04] text-ember-300">
                <step.icon className="size-5" strokeWidth={1.6} />
              </span>
              <span aria-hidden="true" className="font-display text-[44px] leading-none text-fog transition-colors group-hover:text-ember-300">
                0{index + 1}
              </span>
            </span>
            <h3 className="mt-5 font-display text-[19px] font-bold text-ivory sm:mt-8 sm:text-[21px]">{step.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-mist">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
