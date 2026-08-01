import { Link } from 'react-router-dom';

interface TopAppBarProps {
  title?: string;
  profileLink?: string;
}

export function TopAppBar({ title = 'NightCheck', profileLink }: TopAppBarProps) {
  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/10 bg-surface/70 px-[var(--spacing-container-margin-mobile)] shadow-sm backdrop-blur-xl transition-all duration-300 pt-safe">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined filled text-primary">security</span>
        <span className="font-[family-name:var(--font-headline-md)] text-2xl font-semibold tracking-tight text-primary">
          {title}
        </span>
      </div>
      {profileLink ? (
        <Link
          to={profileLink}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-surface-variant"
        >
          <span className="material-symbols-outlined text-sm text-on-surface-variant">person</span>
        </Link>
      ) : (
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-surface-variant">
          <span className="material-symbols-outlined text-sm text-on-surface-variant">person</span>
        </div>
      )}
    </header>
  );
}
