import { Plus, Mail, MessageSquare, Calendar, Mic, X, Settings, ChevronDown } from "lucide-react";

export default function MercuryEmail() {
  return (
    <div className="min-h-screen w-full flex bg-gradient-to-br from-[#f4e8eb] via-[#e3ebf7] to-[#d6dce6] relative overflow-hidden font-sans antialiased">
      {/* Noise/Grain Overlay */}
      <div className="absolute inset-0 z-0 opacity-10" style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        backgroundSize: "256px 256px"
      }} />

      {/* Top Right Utility */}
      <div className="absolute top-6 right-6 z-10 flex items-center gap-3">
        <span className="text-sm text-slate-500 font-medium tracking-wide">9:41</span>
        <button className="flex items-center justify-center w-9 h-9 rounded-full bg-white/40 backdrop-blur-md border border-white/50 hover:bg-white/60 transition-all duration-200 shadow-sm">
          <Plus className="size-4 text-slate-600" />
        </button>
      </div>

      {/* Left Sidebar - Fluid Navigation */}
      <aside className="relative z-10 w-64 h-screen bg-white/20 backdrop-blur-xl border-r border-white/30 flex flex-col p-6 overflow-hidden">
        {/* Background Watermark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl font-bold text-slate-400/20 tracking-tighter select-none pointer-events-none whitespace-nowrap">
          Review Inbox
        </div>

        {/* Logo/Brand */}
        <div className="relative flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-400 to-purple-400 flex items-center justify-center shadow-lg">
            <Mail className="size-4 text-white" />
          </div>
          <span className="text-xl font-semibold text-slate-800">Mercury</span>
        </div>

        {/* Navigation Items */}
        <nav className="relative flex-1 flex flex-col gap-1.5">
          {[
            { id: "compose", label: "Compose", icon: Plus, active: false },
            { id: "inbox", label: "Inbox", icon: Mail, active: true },
            { id: "drafts", label: "Drafts", icon: MessageSquare, active: false },
            { id: "calendar", label: "Calendar", icon: Calendar, active: false },
          ].map((item) => (
            <button
              key={item.id}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                item.active
                  ? "bg-white/60 shadow-sm border border-white/40 text-slate-900"
                  : "text-slate-600 hover:bg-white/40 hover:text-slate-800"
              }`}
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Bottom User Info */}
        <div className="relative border-t border-white/30 pt-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-300 to-purple-300 flex items-center justify-center text-white font-medium text-sm shadow-sm">
            ML
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">Marisa Lu</p>
            <p className="text-xs text-slate-400 truncate">marisa@mercury.os</p>
          </div>
        </div>
      </aside>

      {/* Center Floating Module - The Email Card */}
      <main className="flex-1 flex items-center justify-center p-8 z-10 relative">
        <div className="w-[500px] max-w-full bg-white/70 backdrop-blur-2xl rounded-3xl border border-white/60 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          {/* Top Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-white/20">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-300/60 shadow-inner" />
              <Mail className="size-5 text-slate-500" />
              <span className="text-sm font-medium text-slate-600">Coffee? · Mail from Marisa Lu</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center justify-center w-9 h-9 rounded-full bg-white/40 backdrop-blur-md border border-white/50 hover:bg-white/60 transition-all duration-200">
                <Mic className="size-4 text-slate-500" />
              </button>
              <button className="flex items-center justify-center w-9 h-9 rounded-full bg-white/40 backdrop-blur-md border border-white/50 hover:bg-white/60 hover:text-red-400 transition-all duration-200">
                <X className="size-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="p-8">
            {/* Sender Row */}
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-300 to-purple-300 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                  ML
                </div>
                <span className="text-lg font-bold text-slate-900">Marisa Lu</span>
              </div>
              <span className="text-xs text-slate-400 font-medium">Just Now</span>
            </div>

            {/* Subject */}
            <h1 className="text-3xl font-bold text-slate-900 mt-2 mb-6 tracking-tight">Coffee?</h1>

            {/* Body Text */}
            <div className="text-slate-700 leading-relaxed text-sm whitespace-pre-line font-light">
              Hey Jason,

Was wondering if you'd be interested in meeting my team at Philz Coffee at 11 AM today. No pressure if you can't make it, although I think you guys would really get along!

Marisa
            </div>

            {/* Footer Actions */}
            <div className="mt-8 pt-6 border-t border-white/30">
              <div className="flex gap-3 flex-wrap">
                <button className="flex-1 min-w-[90px] bg-white/60 hover:bg-white/90 border border-white/80 rounded-full px-5 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 shadow-sm active:scale-[0.98]">
                  Reply
                </button>
                <button className="flex-1 min-w-[90px] bg-white/60 hover:bg-white/90 border border-white/80 rounded-full px-5 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 shadow-sm active:scale-[0.98]">
                  Forward
                </button>
                <button className="flex-1 min-w-[90px] bg-white/60 hover:bg-red-50 hover:border-red-200 hover:text-red-600 border border-white/80 rounded-full px-5 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 shadow-sm active:scale-[0.98]">
                  Delete
                </button>
              </div>

              <button className="mt-6 flex items-center justify-center gap-2 w-full text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors duration-200">
                <Settings className="size-3.5" />
                <span>More actions</span>
                <ChevronDown className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}