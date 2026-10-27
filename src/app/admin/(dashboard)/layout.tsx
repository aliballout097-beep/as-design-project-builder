import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { LiveProvider } from "@/components/admin/LiveProvider";
import { Sidebar } from "@/components/admin/Sidebar";
import { Backdrop } from "@/components/ui/Backdrop";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Studio OS" }, robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage();
  const review = await getRepository().listLeads({ status: ["review"], limit: 1 });
  return (
    <LiveProvider>
      <Backdrop intensity="soft" className="opacity-70" />
      <div className="lg:flex">
        <Sidebar email={session.email} reviewCount={review.total} />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-8 lg:pt-9">{children}</main>
      </div>
    </LiveProvider>
  );
}
