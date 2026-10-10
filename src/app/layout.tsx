import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Montserrat, Newsreader } from "next/font/google";
import { Providers } from "@/components/shell/providers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["700", "800"] });

export const metadata: Metadata = {
  title: { default: "Pulkro Cuadrillas", template: "%s · Pulkro Cuadrillas" },
  description: "Control operativo y postventa de cuadrillas de limpieza · Pulkro Compañía de Servicios",
  applicationName: "Pulkro Cuadrillas",
  appleWebApp: { capable: true, title: "Pulkro", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  other: { "mobile-web-app-capable": "yes" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // = --canvas of each theme (phones use the warm sand chrome in light). ThemeColorSync (providers.tsx) keeps the metas
  // right when the user forces Claro/Oscuro against the OS setting.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050e18" },
    { media: "(max-width: 1023px)", color: "#f3f2ee" },
    { color: "#f1f3f6" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${newsreader.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
