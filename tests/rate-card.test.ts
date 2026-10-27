import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from '@/lib/db/local';
import { setRepositoryForTests } from '@/lib/db';
import { sanitizeOverrides } from '@/lib/pricing/overrides';
import { GET } from '@/app/api/v1/rate-card/route';

let repo: LocalRepository;
async function card() {
 const response=await GET(new Request('https://automation.asdesignlb.com/api/v1/rate-card'),undefined);
 expect(response.status).toBe(200);
 expect(response.headers.get('cache-control')).toContain('no-store');
 return response.json();
}
describe('public portfolio rate card',()=>{
 beforeEach(()=>{repo=new LocalRepository(null);setRepositoryForTests(repo);});
 afterEach(()=>{setRepositoryForTests(undefined);});
 it('publishes the approved base packages without a hidden promotion',async()=>{
  const data=await card();
  const price=(id:string)=>data.packages.find((p:{id:string})=>p.id===id)?.priceFinal;
  expect(price('web-design-starter')).toBe(300);
  expect(price('landing-page-starter')).toBe(130);
  expect(price('ecommerce-starter')).toBe(400);
  expect(price('pos-system-starter')).toBe(350);
  expect(price('career-cv')).toBe(20);
  expect(price('career-cover-letter')).toBe(7);
  expect(price('career-linkedin')).toBe(30);
  expect(Object.keys(data).sort()).toEqual(['currency','packages','source']);
 });
 it('applies saved owner promotions and special offers exactly like the proposal engine',async()=>{
  await repo.saveAppSettings({promoPercent:25,promoLabel:'Owner offer'});
  await repo.savePricingOverrides(sanitizeOverrides({services:{'web-design':{tiers:{starter:500},offers:{starter:10,enterprise:null}}},items:{'cv-ats':{price:25.8}}}));
  const data=await card();
  expect(data.packages.find((p:{id:string})=>p.id==='web-design-starter')).toMatchObject({priceFinal:450,priceOriginal:500});
  expect(data.packages.find((p:{id:string})=>p.id==='ecommerce-starter')).toMatchObject({priceFinal:300,priceOriginal:400});
  expect(data.packages.find((p:{id:string})=>p.id==='career-cv')).toMatchObject({priceFinal:26,priceOriginal:null});
 });
 it('omits owner-disabled plans and keeps catalogue reads anonymous',async()=>{
  await repo.savePricingOverrides(sanitizeOverrides({services:{'web-design':{tiers:{enterprise:null}}},items:{},typeFactors:{}}));
  const data=await card();
  expect(data.packages.some((p:{id:string})=>p.id==='web-design-enterprise')).toBe(false);
  expect((await repo.listLeads({})).items).toHaveLength(0);
  expect(JSON.stringify(data)).not.toMatch(/webhookSecret|sessionSecret|SMTP_PASS|DATABASE_URL/i);
 });
});
