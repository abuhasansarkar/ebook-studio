import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/app/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/**
 * The public site URL.
 *
 * It is read from the environment so a deployment can point the canonical
 * links, the Open Graph URLs and the sitemap at its own address. The fallback
 * keeps a local build working.
 */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "eBookStudio — Write, design and publish eBooks with AI",
    template: "%s · eBookStudio",
  },
  description:
    "Turn an idea into a professionally structured, editable, export-ready eBook. Generate the outline, write the chapters, design the interior, make the cover, review the quality and prepare the files for Amazon KDP, Etsy and Gumroad.",
  applicationName: "eBookStudio",
  keywords: [
    "ebook writer",
    "AI ebook generator",
    "KDP ebook",
    "Etsy digital download",
    "Gumroad ebook",
    "self publishing",
    "epub export",
  ],
  authors: [{ name: "eBookStudio" }],
  creator: "eBookStudio",
  publisher: "eBookStudio",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "eBookStudio",
    title: "eBookStudio — Write, design and publish eBooks with AI",
    description:
      "Generate the outline, write the chapters, design the interior, make the cover, review the quality and prepare the files for Amazon KDP, Etsy and Gumroad.",
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: "eBookStudio — Write, design and publish eBooks with AI",
    description:
      "Generate the outline, write the chapters, design the interior, make the cover and prepare the files for Amazon KDP, Etsy and Gumroad.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "productivity",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
