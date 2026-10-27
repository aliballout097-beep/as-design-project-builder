import { SCALE_KEYS, type ServiceKey } from '@/config/catalog';
import { PLAN_NAMES } from '@/config/plans';
import { getRepository } from '@/lib/db';
import { jsonOk, route } from '@/lib/http';
import { sanitizeOverrides, resolveServices, resolveItems, resolveIncludes } from '@/lib/pricing/overrides';
import { priceScope } from '@/lib/pricing/estimate';
import { promoFromSettings, resolveSettings } from '@/lib/settings';
import { SERVICE_NAMES_AR, ITEM_NAMES_AR } from '@/config/catalog.ar';
interface RateCardRow {id:string;service:ServiceKey;category:string;categoryAr:string;name:string;nameAr:string;tagline:string;priceFinal:number;priceOriginal:number|null;features:string[];featuresAr:string[];sortOrder:number;tier:string|null;quoteUrl:string}
export const GET = route(async()=>{
 const repo=getRepository();
 const [saved,storedSettings]=await Promise.all([repo.getPricingOverrides(),repo.getAppSettings()]);
 const overrides=sanitizeOverrides(saved),promo=promoFromSettings(resolveSettings(storedSettings));
 const services=resolveServices(overrides),items=resolveItems(overrides);
 const packages=services.flatMap<RateCardRow>(service=>{
  if(service.kind==='items')return items.filter(item=>item.service===service.key).map(item=>({id:item.key==='cv-ats'?'career-cv':item.key==='cover-letter'?'career-cover-letter':item.key==='linkedin'?'career-linkedin':`item-${item.key}`,service:service.key,category:service.name,categoryAr:SERVICE_NAMES_AR[service.key],name:item.name,nameAr:ITEM_NAMES_AR[item.key],tagline:service.tagline,priceFinal:priceScope({services:[service.key],items:{[item.key]:1},projectType:'new',languages:['en']},'starter',overrides,{promo}).total,priceOriginal:null,features:[`One ${item.unit}`],featuresAr:[],sortOrder:0,tier:null,quoteUrl:'https://automation.asdesignlb.com/'}));
  return SCALE_KEYS.filter(tier=>typeof service.tiers[tier]==='number').map((tier,index)=>{
   const price=priceScope({services:[service.key as ServiceKey],features:[],items:{},projectType:'new',scale:tier,timeline:'flexible',languages:['en']},tier,overrides,{promo});
   const includes=resolveIncludes(service.key,tier,overrides);
   return {id:`${service.key}-${tier}`,service:service.key,category:service.name,categoryAr:SERVICE_NAMES_AR[service.key],name:`${service.name} — ${PLAN_NAMES[tier].en}`,nameAr:`${SERVICE_NAMES_AR[service.key]} — ${PLAN_NAMES[tier].ar}`,tagline:service.tagline,priceFinal:price.total,priceOriginal:price.list>price.total?price.list:null,features:includes?.en||[],featuresAr:includes?.ar||[],sortOrder:index,tier,quoteUrl:'https://automation.asdesignlb.com/'};
  });
 });
 return jsonOk({currency:'USD',source:'automation.asdesignlb.com',packages},{headers:{'Cache-Control':'no-store, max-age=0'}});
});
