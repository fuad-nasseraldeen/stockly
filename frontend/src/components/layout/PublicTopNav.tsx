import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';

export function PublicTopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#2f66e0] text-white">
            <Package className="h-6 w-6" />
          </div>
          <span className="text-2xl font-extrabold text-[#2f66e0]">Stockly</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
            התחברות
          </Link>
          <Link to="/signup" className="rounded-lg bg-[#2f66e0] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#2558c9]">
            פתח חשבון חינם
          </Link>
        </div>
      </div>
    </header>
  );
}

