// src/pages/headerfooter.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "../css/headerfooter.css";
import logoImg from "../images/logo.jpg";
import {
  FaTwitter, FaFacebookF, FaYoutube, FaPinterestP, FaGithub, FaGoogle, FaInstagram,
} from "react-icons/fa";

const NAV_ITEMS = [
  { to: "/", label: "Home", end: true },
  { to: "/#features", label: "Features" },
  { to: "/aboutus", label: "About" },
  { to: "/contactus", label: "Contact" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef(null);
  const navigate = useNavigate();

  // Helper: safely get body (avoids 'style of null')
  const getBody = () => (typeof document !== "undefined" ? document.body : null);

  // Push content below sticky header (measure safely, after layout)
  useLayoutEffect(() => {
    const updatePadding = () => {
      const body = getBody();
      const h = headerRef.current?.offsetHeight ?? 0;
      if (body && h) body.style.paddingTop = `${h}px`;
    };
    // run once after layout, then on resize
    updatePadding();
    window.addEventListener("resize", updatePadding);
    return () => window.removeEventListener("resize", updatePadding);
  }, []);

  // Lock/unlock scroll when mobile menu opens (safe + restore previous)
  useEffect(() => {
    const body = getBody();
    if (!body) return;

    const prev = body.style.overflow;
    body.style.overflow = menuOpen ? "hidden" : "";

    return () => {
      // In StrictMode effects run twice in dev; guard again
      const b = getBody();
      if (b) b.style.overflow = prev;
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToFeatures = () => {
    const featuresSection = document.getElementById("features");
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: "smooth" });
      return true;
    }
    return false;
  };

  const handleHomeClick = (e) => {
    e.preventDefault();
    closeMenu();
    
    // Check if we're already on the home page
    if (window.location.pathname === "/") {
      // If already on home page, just scroll to top
      scrollToTop();
    } else {
      // If not on home page, navigate first then scroll to top
      navigate("/");
      setTimeout(() => {
        scrollToTop();
      }, 100);
    }
  };

  const handleFeaturesClick = (e) => {
    e.preventDefault();
    closeMenu();
    
    // Check if we're already on the home page
    if (window.location.pathname === "/") {
      // If already on home page, just scroll to features
      scrollToFeatures();
    } else {
      // If not on home page, navigate first then scroll
      navigate("/");
      // Try multiple times to find the element after navigation
      let attempts = 0;
      const maxAttempts = 10;
      const tryScroll = () => {
        if (scrollToFeatures() || attempts >= maxAttempts) {
          return;
        }
        attempts++;
        setTimeout(tryScroll, 100);
      };
      setTimeout(tryScroll, 200);
    }
  };

  return (
    <>
      <header ref={headerRef} className={`app-header ${menuOpen ? "is-open" : ""}`}>
        <div className="header-container">
          <div
            className="header-left"
            onClick={() => { navigate("/"); closeMenu(); }}
            style={{ cursor: "pointer" }}
            aria-label="Go to home"
          >
            <img src={logoImg} alt="My Budget Pal logo" className="logo-img" />
            <span className="logo-text">My Budget Pal</span>
          </div>

          <nav className="nav-links" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => {
                  // Features should never be active since it's just a scroll action
                  if (item.to === "/#features") {
                    return "nav-link";
                  }
                  return `nav-link ${isActive ? "active" : ""}`;
                }}
                onClick={
                  item.to === "/#features" 
                    ? handleFeaturesClick 
                    : item.to === "/" 
                    ? handleHomeClick 
                    : closeMenu
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-right">
            <button
              className="get-started-btn"
              onClick={() => { navigate("/signup"); closeMenu(); }}
            >
              Get Started
            </button>
            <button
              className="login-btn"
              onClick={() => { navigate("/login"); closeMenu(); }}
            >
              Login
            </button>

            <button
              className="hamburger"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="hamburger-icon" aria-hidden="true">
                {menuOpen ? "×" : "☰"}
              </span>
            </button>
          </div>
        </div>

        <div className={`mobile-nav ${menuOpen ? "show" : ""}`} role="menu" aria-label="Mobile">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => {
                // Features should never be active since it's just a scroll action
                if (item.to === "/#features") {
                  return "mobile-link";
                }
                return `mobile-link ${isActive ? "active" : ""}`;
              }}
              onClick={
                item.to === "/#features" 
                  ? handleFeaturesClick 
                  : item.to === "/" 
                  ? handleHomeClick 
                  : closeMenu
              }
              role="menuitem"
            >
              {item.label}
            </NavLink>
          ))}
          <button className="mobile-link mobile-cta" onClick={() => { navigate("/signup"); closeMenu(); }}>
            Get Started
          </button>
          <button className="mobile-link mobile-cta" onClick={() => { navigate("/login"); closeMenu(); }}>
            Login
          </button>
        </div>

        <div className={`backdrop ${menuOpen ? "show" : ""}`} onClick={closeMenu} aria-hidden={!menuOpen} />
      </header>

      <main style={{ minHeight: "calc(100vh - 200px)", width: "100%" }}>
        <Outlet />
      </main>

      <footer className="app-footer">
        <div className="footer-container">
          <div className="footer-grid">
            <div className="footer-col brand-block">
              <div className="brand-row">
                <img src={logoImg} className="footer-logo" alt="logo" />
                <span className="brand-name">MY BUDGET PAL</span>
              </div>
              <address className="address">
                410, Galle Road, Colombo 03<br />Sri Lanka
              </address>
              <a href="mailto:hello@mybudgetpal.lk" className="muted-link">hello@mybudgetpal.lk</a>
            </div>

            <div className="footer-col">
              <h5 className="footer-head">APP</h5>
              <ul className="footer-list">
                {NAV_ITEMS.map((item) => (
                  <li key={item.to}>
                    <NavLink 
                      to={item.to} 
                      end={item.end} 
                      onClick={item.to === "/#features" ? handleFeaturesClick : closeMenu}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer-col">
              <h5 className="footer-head">SERVICES</h5>
              <ul className="footer-list">
                <li>Budget Planning</li>
                <li>Expense Insights</li>
                <li>Debt Tracking</li>
                <li>Bill Reminders</li>
              </ul>
            </div>

            <div className="footer-col">
              <h5 className="footer-head">FOLLOW</h5>
              <div className="social-row">
                <a href="#" onClick={(e) => e.preventDefault()} aria-label="Twitter"><FaTwitter /></a>
                <a href="#" onClick={(e) => e.preventDefault()} aria-label="Facebook"><FaFacebookF /></a>
                <a href="#" onClick={(e) => e.preventDefault()} aria-label="YouTube"><FaYoutube /></a>
                <a href="#" onClick={(e) => e.preventDefault()} aria-label="Pinterest"><FaPinterestP /></a>
                <a href="#" onClick={(e) => e.preventDefault()} aria-label="GitHub"><FaGithub /></a>
                <a href="#" onClick={(e) => e.preventDefault()} aria-label="Google"><FaGoogle /></a>
                <a href="#" onClick={(e) => e.preventDefault()} aria-label="Instagram"><FaInstagram /></a>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <div className="legal-links">
              <NavLink to="/terms" onClick={closeMenu}>Terms &amp; Conditions</NavLink>
              <NavLink to="/privacy" onClick={closeMenu}>Privacy Policy</NavLink>
            </div>
            <p className="copyright">© {new Date().getFullYear()} My Budget Pal</p>
          </div>
        </div>
      </footer>
    </>
  );
}
