import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CapturePage, LearningNotesPage, ReviewPage, SearchPage, SettingsPage, SourcesPage, TodayPage } from "./pages";
import { Icon, type IconName } from "./icons";

const navigation: Array<{ to: string; label: string; icon: IconName; mobile?: boolean }> = [
  { to: "/today", label: "Today", icon: "today", mobile: true },
  { to: "/capture", label: "Capture", icon: "capture", mobile: true },
  { to: "/search", label: "Search", icon: "search", mobile: true },
  { to: "/review", label: "Review", icon: "review", mobile: true },
  { to: "/learning", label: "Learning", icon: "memory" },
  { to: "/sources", label: "Sources", icon: "sources" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export default function App() {
  const [theme, setThemeState] = useState<"light" | "dark">(() => ((localStorage.getItem("tracekeep.theme") ?? localStorage.getItem("atlas.theme")) as "light" | "dark") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const location = useLocation();
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("tracekeep.theme", theme); }, [theme]);
  useEffect(() => { document.getElementById("main-content")?.focus({ preventScroll: true }); }, [location.pathname]);
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/today" className="brand" aria-label="Tracekeep home"><span className="brand-mark">T</span><span><strong>Tracekeep</strong><small>Second brain</small></span></NavLink>
      <nav aria-label="Primary navigation">{navigation.map((item) => <NavLink key={item.to} to={item.to}><Icon name={item.icon}/><span>{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><span className="local-dot"/><span><strong>Local first</strong><small>Private on this device</small></span></div>
    </aside>
    <main id="main-content" data-testid="app-main" tabIndex={-1}><div className="content-wrap"><Routes>
      <Route path="/today" element={<TodayPage/>}/><Route path="/capture" element={<CapturePage/>}/><Route path="/search" element={<SearchPage/>}/><Route path="/review" element={<ReviewPage/>}/><Route path="/learning" element={<LearningNotesPage/>}/><Route path="/sources" element={<SourcesPage/>}/><Route path="/settings" element={<SettingsPage theme={theme} setTheme={setThemeState}/>}/><Route path="*" element={<Navigate to="/today" replace/>}/>
    </Routes></div></main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{navigation.filter((item) => item.mobile).map((item) => <NavLink key={item.to} to={item.to}><Icon name={item.icon}/><span>{item.label}</span></NavLink>)}</nav>
  </div>;
}
