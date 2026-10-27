import type { Metadata, Viewport } from "next";
import { Cairo, Fraunces, Manrope, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { brand } from "@/config/brand";
import "./globals.css";
import "./studio.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
  display: "swap",
});

const hanken = Manrope({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

// Arabic client-facing surfaces (Project Builder, client portal, embed) use Cairo
// instead of Fraunces/Hanken — neither Latin display font has Arabic glyphs.
const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-cairo", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.appUrl),
  title: { default: `Start your project — ${brand.name}`, template: `%s — ${brand.name}` },
  description: `Tell ${brand.name} what you're building. Get a tailored scope, timeline and investment proposal — drafted in minutes, reviewed by our team.`,
  applicationName: `${brand.name} Studio Platform`,
  openGraph: {
    type: "website",
    siteName: brand.name,
    title: `Start your project with ${brand.name}`,
    description: "A tailored scope, timeline and investment proposal — drafted in minutes, reviewed by our team.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0c2645",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${hanken.variable} ${plexMono.variable} ${cairo.variable} h-full antialiased`}>
      <body className="automation-brand min-h-full">
        {children}
        <Toaster
          theme="light"
          position="top-center"
          toastOptions={{
            classNames: {
              toast: "!bg-white !border !border-line/10 !text-ivory !rounded-2xl !shadow-[0_20px_50px_-20px_rgb(10_22_105/0.45)]",
              description: "!text-mist",
            },
          }}
        />
      </body>
    </html>
  );
}
