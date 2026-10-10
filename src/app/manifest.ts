import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pulkro Cuadrillas",
    short_name: "Pulkro",
    description: "Control operativo y postventa de cuadrillas de limpieza",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f2ee",
    theme_color: "#f3f2ee",
    lang: "es-MX",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Hoy", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Pendientes", url: "/pendientes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Órdenes", url: "/ordenes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
