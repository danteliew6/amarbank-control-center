import { createBrowserRouter, RouterProvider, NavLink, Outlet, Navigate } from 'react-router';
import { useState } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { Menu } from 'lucide-react';
import { FraudControlCenterPage } from './pages/fraud/FraudControlCenterPage';
import { Customer360Page } from './pages/customer/Customer360Page';
import { OpsOverviewPage } from './pages/ops/OpsOverviewPage';
import { AskAmarPage } from './pages/genie/AskAmarPage';
import { AiBiDashboardPage } from './pages/dashboard/AiBiDashboardPage';
import { GovernancePage } from './pages/governance/GovernancePage';
import { ArchitecturePage } from './pages/architecture/ArchitecturePage';

// Official Amar Bank logo (infinity mark + wordmark) in a white pill so the brand-blue
// wordmark reads on the gradient header. Falls back to the mark-only SVG, then a wordmark.
function AmarMark() {
  const [step, setStep] = useState(0);
  const src = step === 0 ? '/amar-logo.svg' : '/amar-mark.svg';
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-white px-3 py-1.5 shadow-sm">
        {step < 2 ? (
          <img
            src={src}
            alt="Amar Bank"
            className="h-7 w-auto max-w-[136px] object-contain"
            onError={() => setStep((s) => s + 1)}
          />
        ) : (
          <span className="font-bold text-base tracking-tight" style={{ color: '#1C75BC' }}>amar bank</span>
        )}
      </div>
      <span className="hidden sm:inline text-white/85 text-sm border-l border-white/30 pl-3">
        Retail Control Center
      </span>
    </div>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

type NavLinkClassFn = (props: { isActive: boolean }) => string;

const LINKS: { to: string; label: string }[] = [
  { to: '/fraud', label: 'Fraud Control' },
  { to: '/customer', label: 'Customer 360' },
  { to: '/ops', label: 'Ops Overview' },
  { to: '/ask', label: 'Ask Amar' },
  { to: '/dashboard', label: 'AI/BI Dashboard' },
  { to: '/governance', label: 'Governance' },
  { to: '/architecture', label: 'Architecture' },
];

function NavLinks({ className, linkClass, onClick }: { className?: string; linkClass: NavLinkClassFn; onClick?: () => void }) {
  return (
    <nav className={className}>
      {LINKS.map((l) => (
        <NavLink key={l.to} to={l.to} className={linkClass} onClick={onClick}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Layout() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="ab-header px-4 md:px-6 py-3 flex items-center gap-5 shadow-md">
        <AmarMark />
        <NavLinks className="hidden lg:flex gap-1" linkClass={navLinkClass} />
        <div className="ml-auto hidden lg:block text-white/60 text-xs">
          Powered by Databricks · Unity Catalog governed
        </div>
        <div className="ml-auto lg:hidden">
          <Sheet open={isMobile && mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setMobileNavOpen(true)}>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Amar Bank</SheetTitle>
              </SheetHeader>
              <NavLinks className="flex flex-col gap-1 mt-4" linkClass={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 bg-muted/30">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/fraud" replace /> },
      { path: '/fraud', element: <FraudControlCenterPage /> },
      { path: '/customer', element: <Customer360Page /> },
      { path: '/ops', element: <OpsOverviewPage /> },
      { path: '/ask', element: <AskAmarPage /> },
      { path: '/dashboard', element: <AiBiDashboardPage /> },
      { path: '/governance', element: <GovernancePage /> },
      { path: '/architecture', element: <ArchitecturePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
