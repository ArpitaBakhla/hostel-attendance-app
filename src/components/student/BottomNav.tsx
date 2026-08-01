import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/student/check-in', icon: 'fingerprint', label: 'Check-in', filled: true },
  { to: '/student/history', icon: 'history', label: 'History' },
  { to: '/student/leave', icon: 'event_busy', label: 'Leave' },
  { to: '/student/settings', icon: 'settings', label: 'Settings' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-xl border-t border-white/10 bg-surface-container/80 px-4 py-3 shadow-lg backdrop-blur-xl pb-safe md:hidden">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center rounded-full px-4 py-1 transition-transform duration-200 active:scale-90 ${
              isActive
                ? 'bg-primary-container text-on-primary-container'
                : 'rounded-xl px-3 text-on-surface-variant hover:bg-white/5'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`material-symbols-outlined ${isActive || tab.filled ? 'filled' : ''}`}>
                {tab.icon}
              </span>
              <span className="mt-1 font-[family-name:var(--font-label-sm)] text-xs font-semibold uppercase tracking-wider">
                {tab.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
