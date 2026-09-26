import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';
import { AuthHydrator } from '@/lib/auth-hydrator';
import { ToastHost } from '@/lib/toast';
import { ErrorBoundary } from '@/lib/error-boundary';
import { ThemeProvider } from '@/lib/theme-provider';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'StaffSync - Attendance, Payroll & Invoicing',
  description: 'Production-grade staff management, manual attendance, automated payroll and client invoicing system',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <QueryProvider>
            <ErrorBoundary>
              <AuthHydrator />
              <ToastHost />
              {children}
            </ErrorBoundary>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
