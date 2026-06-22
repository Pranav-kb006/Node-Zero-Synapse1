import { Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import LandingPage from './pages/LandingPage';
import AnalyzingPage from './pages/AnalyzingPage';
import DashboardPage from './pages/DashboardPage';
import BlastRadiusPage from './pages/BlastRadiusPage';
import SmartBlamePage from './pages/SmartBlamePage';
import GovernancePage from './pages/GovernancePage';
import MentorPage from './pages/MentorPage';
import ExplorerPage from './features/explorer/ExplorerPage';

export default function App() {
  return (
    <Routes>
      {/* Standalone pages (no AppShell) */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/analyzing" element={<AnalyzingPage />} />

      {/* Dashboard & app pages wrapped in AppShell */}
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/blast-radius" element={<BlastRadiusPage />} />
        <Route path="/smart-blame" element={<SmartBlamePage />} />
        <Route path="/governance" element={<GovernancePage />} />
        <Route path="/mentor" element={<MentorPage />} />
      </Route>
    </Routes>
  );
}
