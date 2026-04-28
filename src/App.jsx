import React, { useEffect, useState } from "react";
import "./styles.css";

// Pages
import Dashboard from "./pages/Dashboard";
import PostsModule from "./pages/PostsModule";
import Settings from "./pages/Settings";
import FirstRun from "./pages/FirstRun";
import SchedulerRunWizard from "./pages/SchedulerRunWizard";
import AutoReactor from "./pages/AutoReactor";
import Tutorials from "./pages/Tutorials";
import FAQs from "./pages/FAQs";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import License from "./pages/License";

// Navigation
import Navigation from "./components/Navigation";

export default function App() {
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [setupStatus, setSetupStatus] = useState({ completed: false });
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState("dashboard");

  useEffect(() => {
    async function bootstrap() {
      try {
        const [license, setup] = await Promise.all([
          window.electronAPI?.getLicenseStatus(),
          window.electronAPI?.getSetupStatus(),
        ]);
        setLicenseStatus(license || null);
        setSetupStatus(setup || { completed: false });
      } catch (error) {
        console.error("Failed to check license:", error);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  if (loading) {
    return (
      <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div className="panel" style={{ width: "min(520px, 92vw)", textAlign: "center" }}>
          <p className="page-kicker">System Boot</p>
          <h1 className="page-title" style={{ fontSize: "clamp(28px, 6vw, 56px)" }}>Loading</h1>
          <p className="page-subtitle">Preparing scheduler, license checks, and posting pipeline...</p>
        </div>
      </div>
    );
  }

  // First run: show setup wizard
  if (!setupStatus?.completed) {
    return (
      <FirstRun
        onComplete={async () => {
          const [license, setup] = await Promise.all([
            window.electronAPI.getLicenseStatus(),
            window.electronAPI.getSetupStatus(),
          ]);
          setLicenseStatus(license || null);
          setSetupStatus(setup || { completed: false });
        }}
      />
    );
  }

  // Render current page
  const renderPage = () => {
    switch (currentPage) {
      case "posts":
        return <PostsModule />;
      case "scheduler-run":
        return <SchedulerRunWizard onDone={() => setCurrentPage("dashboard")} />;
      case "auto-reactor":
        return <AutoReactor />;
      case "settings":
        return <Settings />;
      case "license":
        return <License />;
      case "tutorials":
        return <Tutorials />;
      case "faqs":
        return <FAQs />;
      case "terms":
        return <Terms />;
      case "privacy":
        return <Privacy />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="app-shell">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="app-main">
        {renderPage()}
      </main>
    </div>
  );
}
