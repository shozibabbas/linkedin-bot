import React from "react";
import brandLogo from "../assets/brand-logo.svg";

export default function Navigation({ currentPage, onNavigate }) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "◆" },
    { id: "posts", label: "Posts", icon: "✎" },
    { id: "scheduler-run", label: "Scheduler", icon: "⏱" },
    { id: "auto-reactor", label: "Auto Reactor", icon: "❤" },
    { id: "auto-commenter", label: "Auto Commenter", icon: "✦" },
    { id: "settings", label: "Settings", icon: "⚙" },
    { id: "license", label: "License", icon: "🔐" },
    { id: "tutorials", label: "Tutorials", icon: "?" },
    { id: "faqs", label: "FAQs", icon: "❓" },
    { id: "terms", label: "Terms", icon: "⚖" },
    { id: "privacy", label: "Privacy", icon: "🛡" },
  ];

  return (
    <nav className="app-nav">
      <div className="nav-logo">
        <img src={brandLogo} alt="LinkedIn Bot logo" className="nav-logo-mark" />
        <div className="nav-logo-text">LinkedIn Bot</div>
      </div>
      <div className="nav-list">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? "is-active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-item-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="nav-foot">v1.0.0 | Desktop Edition</div>
    </nav>
  );
}
