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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof window==='undefined')return;var E=['bis_skin_checked','bis_register','__processed_'];var oE=console.error;console.error=function(){for(var i=0;i<arguments.length;i++){var a=arguments[i];if(typeof a==='string'&&E.some(function(x){return a.indexOf(x)!==-1;}))return;}return oE.apply(console,arguments);};var oS=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(typeof n==='string'&&E.some(function(x){return n.indexOf(x)!==-1;}))return;return oS.apply(this,arguments);};try{var scrub=function(el){if(!el||!el.removeAttribute||!el.attributes)return;for(var i=el.attributes.length-1;i>=0;i--){var aN=el.attributes[i].name;if(E.some(function(x){return aN.indexOf(x)!==-1;}))el.removeAttribute(aN);}};var obs=new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){var m=muts[i];if(m.type==='attributes'){scrub(m.target);}else if(m.type==='childList'){for(var j=0;j<m.addedNodes.length;j++){var n=m.addedNodes[j];if(n.nodeType===1){scrub(n);if(n.querySelectorAll){var sub=n.querySelectorAll('*');for(var k=0;k<sub.length;k++)scrub(sub[k]);}}}}}});obs.observe(document.documentElement,{attributes:true,subtree:true,childList:true});window.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('*').forEach(scrub);});}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
