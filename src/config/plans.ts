import type { ScaleKey, ServiceKey } from "./catalog";

/**
 * What each plan includes, per service and scope scale — the client-facing
 * bullets on the plan cards (proposal page, PDF, email). Where asdesignlb.com
 * publishes a package for that price, the bullets follow the package
 * (Startup / Business / Enterprise website, Basic / Advanced / Marketplace
 * store, POS Lite / Pro / Ultimate, landing pages, hybrid app, API).
 */

export const PLAN_NAMES: Record<ScaleKey, { en: string; ar: string; summaryAr: string }> = {
  starter: { en: "Essential", ar: "الخطة الأساسية", summaryAr: "انطلاقة قوية بأقل تكلفة" },
  standard: { en: "Professional", ar: "الخطة الاحترافية", summaryAr: "متكاملة وتناسب أغلب المشاريع" },
  advanced: { en: "Advanced", ar: "الخطة المتقدمة", summaryAr: "ميزات أكثر ونمو أسرع" },
  enterprise: { en: "Premium", ar: "الخطة المتكاملة", summaryAr: "حل مخصّص بالكامل" },
};

export type Bullets = { en: string[]; ar: string[] };

/** Only tiered services have plan bullets; "items" services list their items instead. */
export const PLAN_INCLUDES: Partial<Record<ServiceKey, Partial<Record<ScaleKey, Bullets>>>> = {
  "ai-website": {
    starter: {
      en: ["A professional, fully responsive website designed for you", "AI assistant (chatbot) trained on your business information", "Automated handling of enquiries & follow-ups", "Simple admin access to edit your content"],
      ar: ["موقع احترافي متجاوب مصمّم خصيصاً لك", "مساعد ذكاء اصطناعي (شات بوت) مدرَّب على معلومات نشاطك", "أتمتة استقبال الطلبات والاستفسارات ومتابعتها", "صلاحيات أدمن بسيطة لتعديل المحتوى"],
    },
  },
  "web-design": {
    starter: {
      en: ["Up to 5 custom pages", "Mobile-first responsive design", "Simple admin access to edit your content", "Free domain for 1 year", "Free hosting for 5 months", "Contact form & map"],
      ar: ["حتى 5 صفحات مصمّمة خصيصاً", "تصميم متجاوب مع الموبايل", "صلاحيات أدمن بسيطة لتعديل المحتوى", "دومين مجاني لمدة سنة", "استضافة مجانية لمدة 5 أشهر", "نموذج تواصل وخريطة الموقع"],
    },
    standard: {
      en: ["Everything in the Essential plan", "Up to 10 custom pages", "Service request & quote forms", "Team, portfolio & blog sections", "Analytics dashboard"],
      ar: ["كل ما في الخطة الأساسية", "حتى 10 صفحات مصمّمة خصيصاً", "نماذج طلب خدمة وعرض سعر", "أقسام الفريق والأعمال والمدونة", "ربط لوحة التحليلات"],
    },
    advanced: {
      en: ["Everything in the Professional plan", "20+ pages & landing pages", "Arabic / English", "Client login or partner portal", "Advanced animations & document sharing"],
      ar: ["كل ما في الخطة الاحترافية", "أكثر من 20 صفحة وصفحات هبوط", "عربي / إنجليزي", "بوابة دخول للعملاء أو الشركاء", "حركات متقدمة ومشاركة ملفات"],
    },
    enterprise: {
      en: ["Custom web application (CRM, portal or dashboard)", "Role-based access & secure login", "Admin & user panels with reports", "REST API for other apps", "Hosting & deployment"],
      ar: ["تطبيق ويب مخصّص (CRM، بوابة أو لوحة تحكم)", "صلاحيات حسب الدور ودخول آمن", "لوحات إدارة ومستخدمين مع تقارير", "واجهة API لربط تطبيقات أخرى", "الاستضافة والنشر"],
    },
  },
  "landing-page": {
    starter: {
      en: ["Custom responsive landing page", "Headline, benefits & call to action", "Lead / contact form", "Basic analytics", "Free domain (1st year) + SSL"],
      ar: ["صفحة هبوط مصمّمة ومتجاوبة", "عنوان، مزايا، وزر دعوة للإجراء", "نموذج لجمع العملاء والتواصل", "تحليلات أساسية", "دومين مجاني للسنة الأولى وشهادة أمان"],
    },
    standard: {
      en: ["Conversion-optimised page", "A/B-test ready design", "CRM or email-marketing integration", "Google / Meta conversion tracking", "Sticky CTA, exit popup & 3 revisions"],
      ar: ["صفحة محسّنة للتحويل", "تصميم جاهز لاختبار A/B", "ربط CRM أو التسويق بالإيميل", "تتبّع التحويلات على Google وMeta", "زر ثابت، نافذة خروج و3 تعديلات"],
    },
    advanced: {
      en: ["Up to 3 funnel pages", "Upsell / downsell flow", "Thank-you page & form logic", "Zapier / Mailchimp automation", "Social media starter package"],
      ar: ["حتى 3 صفحات في مسار مبيعات", "مسار عروض إضافية (Upsell / Downsell)", "صفحة شكر ومنطق للنماذج", "أتمتة Zapier / Mailchimp", "باقة سوشيال ميديا للبداية"],
    },
    enterprise: {
      en: ["Full sales funnel (up to 5 pages)", "Automation & CRM integration", "Advanced tracking & A/B testing", "Copywriting for every page", "Launch & optimisation support"],
      ar: ["مسار مبيعات كامل (حتى 5 صفحات)", "أتمتة وربط CRM", "تتبّع متقدّم واختبارات A/B", "كتابة المحتوى لكل صفحة", "دعم الإطلاق والتحسين"],
    },
  },
  ecommerce: {
    starter: {
      en: ["Custom storefront design", "Up to 100 products, categories & search", "Cart & checkout with cash on delivery", "Mobile-friendly, with a free domain for 1 year"],
      ar: ["تصميم متجر مخصّص", "حتى 100 منتج مع تصنيفات وبحث", "سلة وطلب مع الدفع عند الاستلام", "متجاوب مع الموبايل ودومين مجاني لمدة سنة"],
    },
    standard: {
      en: ["Everything in the Essential plan", "Online payment gateway", "Unlimited products & bulk import", "Product variants, shipping & tax", "Order dashboard, customer accounts & discount codes"],
      ar: ["كل ما في الخطة الأساسية", "بوابة دفع إلكتروني", "منتجات غير محدودة واستيراد بالجملة", "خيارات المنتج، الشحن والضرائب", "لوحة الطلبات، حسابات العملاء وأكواد الخصم"],
    },
    advanced: {
      en: ["Multi-vendor marketplace", "Vendor dashboard & commissions", "Live chat & reviews", "Real-time shipping & tracking", "Facebook / Instagram shop + social media package"],
      ar: ["سوق متعدد البائعين", "لوحة للبائعين وإدارة العمولات", "دردشة مباشرة وتقييمات", "شحن وتتبّع لحظي", "متجر فيسبوك وإنستغرام + باقة سوشيال ميديا"],
    },
    enterprise: {
      en: ["Everything in the marketplace plan", "Custom integrations (ERP, POS, logistics)", "Multiple countries & currencies", "Advanced analytics & automation", "Priority support"],
      ar: ["كل ما في خطة السوق المتعدد", "ربط مخصّص (ERP، نقاط بيع، شحن)", "عدة دول وعملات", "تحليلات وأتمتة متقدمة", "دعم بأولوية"],
    },
  },
  "pos-system": {
    starter: {
      en: ["Desktop POS for one shop", "Products & categories", "Sales & receipt printing", "Basic inventory & cashier access", "12 months support"],
      ar: ["نظام كاشير لمحل واحد", "المنتجات والتصنيفات", "المبيعات وطباعة الإيصالات", "مخزون أساسي وصلاحيات الكاشير", "دعم لمدة 12 شهراً"],
    },
    standard: {
      en: ["Multiple users & branches", "Stock alerts & reports", "Customer loyalty, discounts & taxes", "Sales dashboard & shift reports", "Android tablet support"],
      ar: ["عدة مستخدمين وفروع", "تنبيهات وتقارير المخزون", "ولاء العملاء، الخصومات والضرائب", "لوحة مبيعات وتقارير الورديات", "دعم تابلت أندرويد"],
    },
    advanced: {
      en: ["Real-time cloud sync", "Multi-location web dashboard", "Printer & barcode scanner integration", "Online order sync & API access", "24 months support & updates"],
      ar: ["مزامنة سحابية لحظية", "لوحة ويب لعدة فروع", "ربط الطابعة وقارئ الباركود", "مزامنة الطلبات أونلاين وواجهة API", "دعم وتحديثات لمدة 24 شهراً"],
    },
    enterprise: {
      en: ["Everything in the cloud plan", "Custom features & reports", "E-commerce & accounting integration", "Staff training", "Priority support"],
      ar: ["كل ما في الخطة السحابية", "ميزات وتقارير مخصّصة", "ربط المتجر الإلكتروني والمحاسبة", "تدريب الموظفين", "دعم بأولوية"],
    },
  },
  "mobile-app": {
    starter: {
      en: ["Android & iOS app (one codebase)", "Custom UI design", "Login, registration & push notifications", "API integration with live data", "App Store & Google Play publishing"],
      ar: ["تطبيق أندرويد وiOS (كود واحد)", "تصميم واجهات مخصّص", "تسجيل دخول، حسابات وإشعارات", "ربط API ببيانات مباشرة", "النشر على App Store وGoogle Play"],
    },
    standard: {
      en: ["Everything in the essential app", "In-app payments", "Camera, location & file uploads", "Admin panel for content", "3 months support"],
      ar: ["كل ما في التطبيق الأساسي", "الدفع داخل التطبيق", "الكاميرا، الموقع ورفع الملفات", "لوحة تحكم لإدارة المحتوى", "دعم لمدة 3 أشهر"],
    },
    advanced: {
      en: ["Custom backend & API", "Advanced features (bookings, chat, maps…)", "Analytics & crash reporting", "Arabic / English", "6 months support"],
      ar: ["خادم وواجهة API مخصّصة", "ميزات متقدمة (حجوزات، دردشة، خرائط…)", "تحليلات وتقارير الأعطال", "عربي / إنجليزي", "دعم لمدة 6 أشهر"],
    },
    enterprise: {
      en: ["Full product: app + web dashboard", "Integration with your systems", "Scalable cloud architecture", "Security review & testing", "12 months support"],
      ar: ["منتج متكامل: تطبيق + لوحة ويب", "ربط مع أنظمتكم", "بنية سحابية قابلة للتوسّع", "مراجعة أمان واختبارات", "دعم لمدة 12 شهراً"],
    },
  },
  "social-media": {
    starter: {
      en: ["Social media management for 1 month", "Monthly content plan", "Post design & publishing"],
      ar: ["إدارة حسابات السوشيال ميديا لمدة شهر", "خطة محتوى شهرية", "تصميم ونشر المنشورات"],
    },
    standard: {
      en: ["Everything in the Essential plan", "Paid campaigns managed in Meta Ads Manager", "The ad budget itself is paid to Meta separately"],
      ar: ["كل ما في الخطة الأساسية", "إدارة الحملات الممولة عبر Ads Manager", "ميزانية الإعلانات تُدفع مباشرة لـ Meta"],
    },
  },
  "ui-ux": {
    starter: { en: ["UX review of key screens", "Wireframes for up to 5 screens", "Clickable prototype"], ar: ["مراجعة تجربة المستخدم للشاشات الأساسية", "مخططات لحتى 5 شاشات", "نموذج أولي تفاعلي"] },
    standard: {
      en: ["User journeys & wireframes", "Final UI for up to 10 screens", "Interactive prototype", "Developer handoff"],
      ar: ["رحلات المستخدم والمخططات", "تصميم نهائي لحتى 10 شاشات", "نموذج أولي تفاعلي", "تسليم للمطوّرين"],
    },
    advanced: {
      en: ["User research & testing", "Full UI for web or app", "Design system components", "Developer handoff"],
      ar: ["بحث واختبار مع المستخدمين", "تصميم كامل للويب أو التطبيق", "مكوّنات نظام تصميم", "تسليم للمطوّرين"],
    },
    enterprise: {
      en: ["Research, UX & UI for the whole product", "Complete design system", "Usability testing rounds", "Documentation"],
      ar: ["بحث وتجربة وواجهات للمنتج كاملاً", "نظام تصميم متكامل", "جولات اختبار سهولة الاستخدام", "توثيق"],
    },
  },
  "seo-content": {
    starter: { en: ["Technical SEO audit", "On-page fixes for key pages", "Search Console & Analytics setup"], ar: ["تدقيق SEO تقني", "تحسين الصفحات الأساسية", "إعداد Search Console وAnalytics"] },
    standard: {
      en: ["Keyword research & strategy", "On-page SEO for up to 10 pages", "Schema & speed improvements", "4 SEO articles"],
      ar: ["بحث الكلمات المفتاحية واستراتيجية", "تحسين SEO لحتى 10 صفحات", "Schema وتحسين السرعة", "4 مقالات SEO"],
    },
    advanced: {
      en: ["Content strategy & calendar", "8 SEO articles", "Link-building plan", "Monthly reporting dashboard"],
      ar: ["استراتيجية وخطة محتوى", "8 مقالات SEO", "خطة بناء روابط", "لوحة تقارير شهرية"],
    },
    enterprise: {
      en: ["Arabic / English SEO", "12 articles & landing pages", "Technical SEO for large sites", "Monthly reports & calls"],
      ar: ["SEO بالعربي والإنجليزي", "12 مقالاً وصفحات هبوط", "SEO تقني للمواقع الكبيرة", "تقارير واجتماعات شهرية"],
    },
  },
};
