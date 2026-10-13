import type { Metadata } from "next";
import { Cinzel, EB_Garamond, JetBrains_Mono } from "next/font/google";
import { AmbientLayer } from "@/components/AmbientLayer";
import { ThemeProvider } from "@/components/ThemeProvider";
import { WeavefieldLazy } from "@/components/WeavefieldLazy";
import { AttuneBoot, SessionHud } from "@/components/Hud";
import { ScrollProgress } from "@/components/Motion";
import "./globals.css";

export const metadata: Metadata = {
  title: "Character Vault",
  description: "A small multi-session D&D character sheet app.",
};

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cinzel",
});

const garamond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-garamond",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${garamond.variable} ${mono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <AmbientLayer />
          <WeavefieldLazy />
          <ScrollProgress />
          <div className="page-shell">{children}</div>
          <SessionHud />
          <AttuneBoot />
        </ThemeProvider>
      </body>
    </html>
  );
}
