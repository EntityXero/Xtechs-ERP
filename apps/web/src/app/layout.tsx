import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Xtechs ERP',
  description: 'Self-hosted enterprise resource planning platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Inter font — loaded from Google Fonts for dev, self-host in production */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface-d0 text-text-dark-primary min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
