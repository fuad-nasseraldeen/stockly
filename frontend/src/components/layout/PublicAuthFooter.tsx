import { Link } from 'react-router-dom';

export function PublicAuthFooter() {
  return (
    <footer className="w-full bg-[#0a1532] py-10 text-center text-sm text-slate-300" dir="rtl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-10 px-4">
        <Link to="/privacy" className="hover:text-white">פרטיות</Link>
        <Link to="/contact" className="hover:text-white">צור קשר</Link>
        <Link to="/about" className="hover:text-white">אודות</Link>
        <Link to="/" className="hover:text-white">דף הבית</Link>
      </div>
      <p className="mt-5 text-sm text-slate-400">כל הזכויות שמורות - © Stockly 2025</p>
    </footer>
  );
}
