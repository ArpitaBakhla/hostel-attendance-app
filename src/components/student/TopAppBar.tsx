import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

interface TopAppBarProps {
  title?: string;
  showMenu?: boolean;
}

export function TopAppBar({ title = 'NightCheck', showMenu = false }: TopAppBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await api.signOut();
    } catch {
      // ignore
    }
    window.location.href = '/student/login';
  };

  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/10 bg-surface/70 px-[var(--spacing-container-margin-mobile)] shadow-sm backdrop-blur-xl transition-all duration-300 pt-safe">
      <Link to="/student/check-in" className="flex items-center gap-2">
        <span className="material-symbols-outlined filled text-primary">security</span>
        <span className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold tracking-tight text-primary">
          {title}
        </span>
      </Link>

      {showMenu && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-surface-variant text-on-surface hover:bg-white/10"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-surface-container-high p-2 shadow-lg backdrop-blur-md">
              <div className="flex flex-col gap-1">
                <Link
                  to="/student/check-in"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-on-surface hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-[20px]">home</span>
                  Dashboard
                </Link>
                <Link
                  to="/student/history"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-on-surface hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                  History
                </Link>
                <Link
                  to="/student/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-on-surface hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-[20px]">settings</span>
                  Settings
                </Link>
                <div className="my-1 h-px w-full bg-white/10" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-error hover:bg-error/10"
                >
                  <span className="material-symbols-outlined text-[20px]">logout</span>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
