import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Montserrat, Newsreader } from "next/font/google";
import { Providers } from "@/components/shell/providers";
import { FORWARD_AUTH_LINK_SCRIPT } from "@/features/auth/auth-link-forward";
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
  // The on-screen keyboard shrinks the layout viewport (Chrome/Android), so fixed modal footers stay above it.
  // iOS Safari ignores this; ModalShell/FlowScreen lift their footer with useKeyboardInset() there.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${newsreader.variable} ${montserrat.variable} h-full antialiased`}>
      <head>
        {/* An invite / recovery link that Supabase Auth sent to the Site URL (or another page) goes on to
            /acceso/definir-contrasena before anything reads the session: features/auth/auth-link-forward.ts. */}
        <script dangerouslySetInnerHTML={{ __html: FORWARD_AUTH_LINK_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
