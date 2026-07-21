import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import AppShell from "../components/AppShell";
import MobileAppShell from "../mobile/layout/MobileAppShell";
import DeviceRouter from "../shared/device/DeviceRouter";
import SWRPersistedProvider from "../shared/swr/SWRPersistedProvider";
import { ThemeProvider } from "../components/ThemeProvider";
import { I18nProvider } from "../lib/i18n/context";
import AuthGuard from "../components/AuthGuard";
import { DialogHost } from "../components/ui/dialog";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Akakua'a",
  description: "Sistema de gestión Akakua'a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <I18nProvider>
            <SWRPersistedProvider>
              <AuthGuard>
                <DeviceRouter
                  desktop={<AppShell>{children}</AppShell>}
                  mobile={<MobileAppShell>{children}</MobileAppShell>}
                />
              </AuthGuard>
              <DialogHost />
            </SWRPersistedProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}