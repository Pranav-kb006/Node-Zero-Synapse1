import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

/** Pages that need full-bleed (no padding, no scroll — they manage their own layout). */
const FULL_BLEED_ROUTES = new Set(['/explorer']);

export default function AppShell() {
    const { pathname } = useLocation();
    const isFullBleed = FULL_BLEED_ROUTES.has(pathname);

    return (
        <div className="flex h-screen bg-black overflow-hidden">
            {/* Fixed Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="ml-16 flex flex-1 flex-col overflow-hidden">
                {/* Fixed Header */}
                <Header />

                {/* Page Content */}
                <main
                    className={`mt-14 flex-1 ${
                        isFullBleed
                            ? 'overflow-hidden'
                            : 'overflow-y-auto p-6'
                    }`}
                >
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
