import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "مسار - إدارة مراكز صيانة المركبات",
    short_name: "مسار",
    description: "منظومة مسار لإدارة مراكز صيانة المركبات والعملاء وأوامر الصيانة والمخزون والمشتريات والفواتير.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    orientation: "any",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/massar-pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/massar-pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/massar-pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
