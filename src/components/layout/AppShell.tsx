import { ReactNode } from "react";
import { Link } from "react-router";
import logo from "@/assets/logo.svg";
import {
  BarChart3,
  Menu,
  Mic,
  Settings,
  Store,
  TrendingDown,
  Wallet,
  Plus,
  X,
  ChevronLeft,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatNumber, type DigitStyle, type EntryType } from "@/lib/khata";
import { t } from "@/lib/i18n";

export type NavId = "ledger" | EntryType | "analytics" | "settings" | "shop";

interface AppShellProps {
  activeView: NavId;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  isStaff: boolean;
  user: { name?: string | null } | null;
  isCurrentMonth: boolean;
  monthName: string;
  totals: {
    balance: number;
    totalIncome: number;
    totalExpense: number;
  };
  digitStyle: DigitStyle;
  onNavigate: (view: NavId) => void;
  children: ReactNode;
}

export function AppShell({
  activeView,
  navOpen,
  setNavOpen,
  isStaff,
  user,
  isCurrentMonth,
  monthName,
  totals,
  digitStyle,
  onNavigate,
  children,
}: AppShellProps) {
  const navItems: { id: NavId; label: string; icon: typeof Mic }[] = [
    { id: "ledger", label: "کھاتہ", icon: Mic },
    { id: "income", label: t("totalIncome"), icon: Wallet },
    { id: "expense", label: t("totalExpense"), icon: TrendingDown },
    { id: "analytics", label: t("charts"), icon: BarChart3 },
    { id: "shop", label: "دکان (گاہک/سپلائر)", icon: Store },
    { id: "settings", label: "سیٹنگز", icon: Settings },
  ];

  const visibleNavItems = isStaff
    ? navItems.filter((item) => item.id !== "settings")
    : navItems;

  const renderBrand = (
    <Link
      to="/"
      className="flex items-center gap-3 mb-8 px-1 animate-fade-in-up"
      aria-label="صفحۂ اول"
    >
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border-gradient bg-gradient-to-br from-pink-400/20 to-purple-400/20">
        <img
          src={logo}
          alt="صوتی بقیہ"
          className="size-7"
        />
      </div>
      <div className="min-w-0">
        <span className="nastaliq block text-xl font-semibold text-slate-800 tracking-tight">صوتی بقیہ</span>
        <span className="block font-sans text-[11px] text-slate-500 font-medium">اردو وائس فنانس اسسٹنٹ</span>
      </div>
    </Link>
  );

  const renderNavList = (
    <nav className="flex flex-col gap-1.5 animate-fade-in-up delay-1" aria-label="مینو">
      {visibleNavItems.map((item, index) => {
        const active = activeView === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onNavigate(item.id);
              setNavOpen(false);
            }}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 glass-nav-item ${
              active
                ? "active text-sky-600 dark:text-sky-400"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
            style={{ animationDelay: `${index * 0.05}s` } as React.CSSProperties}
          >
            <div className={`flex items-center justify-center size-8 shrink-0 rounded-xl transition-all duration-300 ${
              active
                ? "bg-sky-500/15 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400"
                : "text-slate-400 dark:text-slate-500 hover:text-sky-500 dark:hover:text-sky-400"
            }`}>
              <Icon className="size-4.5" />
            </div>
            <span className="truncate">{item.label}</span>
            {active && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-sky-500 rounded-r-full" />
            )}
          </button>
        );
      })}
    </nav>
  );

  const userLabel = user?.name || "مہمان صارف";
  const renderUserBlock = (
    <div className="border-t border-slate-200/50 dark:border-white/10 pt-4 animate-slide-in-right delay-2 glass-card p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-sky-400/40 bg-gradient-to-br from-sky-400/20 to-sky-500/15 text-sm font-bold text-sky-600 dark:text-sky-400 shadow-sm">
          {userLabel.trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{userLabel}</span>
          <span className="block truncate font-sans text-[10px] text-slate-500 dark:text-slate-400">
            کلاؤڈ سینک فعال
          </span>
        </div>
      </div>
    </div>
  );

  const renderSummaryBlock = (
    <div className="space-y-3 animate-slide-in-right delay-3">
      {/* Balance Card */}
      <div className="glass-card p-4 border-gradient" style={{ '--card-gradient': 'linear-gradient(135deg, #3b82f6, #6366f1)' } as React.CSSProperties}>
        <p className="font-sans text-[10px] uppercase tracking-widest text-sky-600 dark:text-sky-400 font-semibold">
          {isCurrentMonth ? t("currentMonth") : t("archivedMonth")}
        </p>
        <p className="nastaliq mt-1 text-sm text-slate-500 dark:text-slate-400">{monthName}</p>
        <p className="mt-2.5 text-2xl font-bold text-slate-900 dark:text-white">
          {formatNumber(totals.balance, digitStyle)}
          <span className="nastaliq ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">روپے</span>
        </p>
      </div>

      {/* Income & Expense Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-3 relative overflow-hidden" style={{ '--card-gradient': 'linear-gradient(135deg, #10b981, #34d399)' } as React.CSSProperties}>
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          <p className="font-sans text-[9px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-semibold mb-1">
            آمدنی
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {formatNumber(totals.totalIncome, digitStyle)}
          </p>
        </div>
        <div className="glass-card p-3 relative overflow-hidden" style={{ '--card-gradient': 'linear-gradient(135deg, #ef4444, #f87171)' } as React.CSSProperties}>
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-rose-400" />
          <p className="font-sans text-[9px] uppercase tracking-widest text-rose-600 dark:text-rose-400 font-semibold mb-1">
            خرچ
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {formatNumber(totals.totalExpense, digitStyle)}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div dir="rtl" className="min-h-screen w-full flex relative">
      {/* Ethereal Ambient Background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#f4e8eb] via-[#e3ebf7] to-[#d6dce6]" />
      <div className="absolute inset-0 -z-10 opacity-[0.04]" style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        backgroundSize: "256px 256px"
      }} />

      <div className="relative z-10 flex min-h-screen w-full">
        {/* Sidebar — Desktop Fluid Navigation */}
        <aside className="hidden w-72 shrink-0 flex-col gap-6 border-l border-slate-200/50 dark:border-white/10 bg-white/20 dark:bg-slate-950/20 backdrop-blur-2xl p-6 lg:flex overflow-y-auto">
          {renderBrand}
          {renderNavList}
          <div className="mt-auto flex flex-col gap-4 pt-4 border-t border-slate-200/50 dark:border-white/10">
            {renderSummaryBlock}
            {renderUserBlock}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Bar — Mobile */}
          <header className="flex items-center justify-between gap-3 border-b border-slate-200/50 dark:border-white/10 bg-white/30 dark:bg-slate-950/30 px-4 pb-3 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] backdrop-blur-2xl lg:hidden glass-panel rounded-none rounded-bl-2xl rounded-br-2xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg border-gradient bg-gradient-to-br from-pink-400/20 to-purple-400/20">
                <img src={logo} alt="صوتی بقیہ" className="size-6" />
              </div>
              <span className="nastaliq text-lg font-semibold text-slate-800 dark:text-white">صوتی بقیہ</span>
            </div>
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="مینو کھولیں"
              className="glass-btn-secondary w-10 h-10 p-0"
            >
              <Menu className="size-5 text-slate-600 dark:text-slate-300" />
            </button>
          </header>

          {/* Main Content — Centered Floating Module */}
          <main className="flex flex-1 items-center justify-center p-4 lg:p-8">
            <div className="w-full max-w-5xl glass-panel animate-fade-in-scale">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Navigation — Mobile Sheet */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="right"
          className="w-72 gap-4 border-l border-slate-200/50 dark:border-white/10 bg-white/30 dark:bg-slate-950/30 text-slate-900 dark:text-white backdrop-blur-2xl p-6 glass-panel rounded-none"
        >
          <SheetHeader className="pb-2">
            <SheetTitle className="text-slate-900 dark:text-white nastaliq text-xl font-semibold">مینو</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4">
            {renderNavList}
            <div className="flex flex-col gap-3 pt-2 border-t border-slate-200/50 dark:border-white/10">
              {renderSummaryBlock}
              {renderUserBlock}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}