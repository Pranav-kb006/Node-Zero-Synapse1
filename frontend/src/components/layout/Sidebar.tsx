import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Network,
    Radiation,
    Users,
    Shield,
    Sparkles,
    Brain,
} from 'lucide-react';

/** Navigation items for the sidebar */
const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
    { to: '/explorer', icon: Network, label: 'Explorer' },
    { to: '/blast-radius', icon: Radiation, label: 'Blast Radius' },
    { to: '/smart-blame', icon: Users, label: 'Smart Blame' },
    { to: '/governance', icon: Shield, label: 'Governance' },
    { to: '/mentor', icon: Sparkles, label: 'AI Mentor' },
];

export default function Sidebar() {
    return (
        <aside className="fixed left-0 top-0 z-50 flex h-screen w-16 flex-col items-center border-r border-white/[0.06] bg-black py-4">
            {/* Logo */}
            <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400">
                <Brain className="h-5 w-5 text-white" />
            </div>

            {/* Navigation */}
            <nav className="flex flex-1 flex-col items-center gap-1">
                {navItems.map(({ to, icon: Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        title={label}
                        className={({ isActive }) =>
                            `group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${isActive
                                ? 'bg-white/[0.08] text-white'
                                : 'text-neutral-600 hover:bg-white/[0.04] hover:text-neutral-400'
                            }`
                        }
                    >
                        <Icon className="h-5 w-5" />
                        {/* Tooltip */}
                        <span className="pointer-events-none absolute left-14 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 opacity-0 shadow-xl ring-1 ring-white/[0.06] transition-opacity duration-200 group-hover:opacity-100">
                            {label}
                        </span>
                    </NavLink>
                ))}
            </nav>

            {/* Version badge */}
            <div className="mt-auto text-[10px] font-medium tracking-wider text-neutral-700">
                v1.0
            </div>
        </aside>
    );
}
