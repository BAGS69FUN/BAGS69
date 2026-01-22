import './globals.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import type { Metadata, Viewport } from 'next';
import { WalletConnectionProvider } from '@/components/WalletProvider';

export const metadata: Metadata = {
  title: 'BAGS69 | $69',
  description: 'Fair launch presale launchpad - bags69.fun',
  openGraph: {
    title: 'BAGS69 | $69',
    description: 'Fair launch presales where everyone earns trading fees forever — bags69.fun',
    type: 'website'
  },
  themeColor: '#000000'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta name="color-scheme" content="dark" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Share+Tech+Mono&display=swap" rel="stylesheet" />
      </head>
      <body className="crt">
        <WalletConnectionProvider>
          {children}
        </WalletConnectionProvider>
      </body>
    </html>
  );
}
