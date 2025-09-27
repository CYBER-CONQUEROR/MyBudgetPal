import React from "react";
import "../css/privacy.css";
import { useNavigate } from "react-router-dom"; // for navigation

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate(-1); // go back to previous page
  };

  return (
    <div className="privacy-container">
      {/* Close button */}
      <button className="close-btn" onClick={handleClose}>
        ×
      </button>

      <h1>Privacy Policy</h1>
      <p>Last updated: September 24, 2025</p>

      <section>
        <h2>1. Introduction</h2>
        <p>
          MyBudgetPal ("we", "our", "us") values your privacy and is committed
          to protecting your personal information. This Privacy Policy explains
          how we collect, use, and safeguard your data.
        </p>
      </section>

      <section>
        <h2>2. Information We Collect</h2>
        <ul>
          <li>Personal details such as name, email, and contact info.</li>
          <li>Financial information related to budgeting and expenses.</li>
          <li>Usage data from your interaction with the app/website.</li>
        </ul>
      </section>

      <section>
        <h2>3. How We Use Your Information</h2>
        <ul>
          <li>To provide and improve our services.</li>
          <li>To communicate important updates and offers.</li>
          <li>To comply with legal obligations.</li>
        </ul>
      </section>

      <section>
        <h2>4. Data Security</h2>
        <p>
          We implement appropriate security measures to protect your information
          from unauthorized access, alteration, disclosure, or destruction.
        </p>
      </section>

      <section>
        <h2>5. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please contact us
          at{" "}
          <a href="mailto:hello@mybudgetpal.lk">hello@mybudgetpal.lk</a>.
        </p>
      </section>
    </div>
  );
};

export default PrivacyPolicy;
