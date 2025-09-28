import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/TermsAndCondtions.css';

const TermsAndConditions = () => {
  const navigate = useNavigate();

  const handleAgree = () => {
    // Store agreement in localStorage
    localStorage.setItem('termsAgreed', 'true');
    localStorage.setItem('termsAgreedDate', new Date().toISOString());
    navigate('/');
  };

  const handleNotNow = () => {
    navigate('/');
  };

  return (
    <div className="terms-container">
      <div className="terms-header">
        <p className="agreement-label">LEGAL AGREEMENT</p>
        <h1>Terms of Service</h1>
        <p className="last-updated">Last updated: {new Date().toLocaleDateString()}</p>
      </div>
      
      <div className="terms-content">
        <section className="terms-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using MyBudgetPal ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
          </p>
        </section>

        <section className="terms-section">
          <h2>2. Description of Service</h2>
          <p>
            MyBudgetPal is a financial management platform designed to help Sri Lankan families manage their budgets, track expenses, and achieve their financial goals. Our services include:
          </p>
          <ul>
            <li>Budget planning and management tools</li>
            <li>Expense tracking and categorization</li>
            <li>Financial goal setting and progress monitoring</li>
            <li>Bill reminders and payment tracking</li>
            <li>Family collaboration features</li>
            <li>Financial insights and analytics</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>3. User Accounts and Registration</h2>
          <p>
            To access certain features of the Service, you must register for an account. You agree to:
          </p>
          <ul>
            <li>Provide accurate, current, and complete information during registration</li>
            <li>Maintain and update your account information</li>
            <li>Keep your password secure and confidential</li>
            <li>Accept responsibility for all activities under your account</li>
            <li>Notify us immediately of any unauthorized use</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>4. Privacy and Data Protection</h2>
          <p>
            Your privacy is important to us. We collect, use, and protect your personal information in accordance with our Privacy Policy. By using our Service, you consent to the collection and use of information as outlined in our Privacy Policy.
          </p>
          <p>
            We implement bank-level security measures to protect your financial data, including:
          </p>
          <ul>
            <li>End-to-end encryption for data transmission</li>
            <li>Secure data storage with industry-standard protocols</li>
            <li>Regular security audits and updates</li>
            <li>Limited access to personal information</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>5. User Responsibilities</h2>
          <p>You agree to use the Service responsibly and in accordance with applicable laws. You will not:</p>
          <ul>
            <li>Use the Service for any illegal or unauthorized purpose</li>
            <li>Attempt to gain unauthorized access to our systems</li>
            <li>Interfere with or disrupt the Service</li>
            <li>Share your account credentials with others</li>
            <li>Upload malicious code or harmful content</li>
            <li>Violate any applicable local, national, or international law</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>6. Financial Information and Accuracy</h2>
          <p>
            While we strive to provide accurate financial tools and insights, you acknowledge that:
          </p>
          <ul>
            <li>You are responsible for the accuracy of information you provide</li>
            <li>Financial advice provided is for informational purposes only</li>
            <li>You should consult with qualified financial advisors for major decisions</li>
            <li>We are not responsible for financial losses resulting from your use of the Service</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>7. Service Availability</h2>
          <p>
            We strive to maintain high service availability but cannot guarantee uninterrupted access. We may:
          </p>
          <ul>
            <li>Perform scheduled maintenance with advance notice</li>
            <li>Implement updates to improve functionality</li>
            <li>Temporarily suspend service for security reasons</li>
            <li>Modify or discontinue features with reasonable notice</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>8. Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are owned by MyBudgetPal and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
          </p>
        </section>

        <section className="terms-section">
          <h2>9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, MyBudgetPal shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
          </p>
        </section>

        <section className="terms-section">
          <h2>10. Termination</h2>
          <p>
            We may terminate or suspend your account immediately, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.
          </p>
        </section>

        <section className="terms-section">
          <h2>11. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. We will notify users of any material changes via email or through the Service. Continued use of the Service after changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section className="terms-section">
          <h2>12. Contact Information</h2>
          <p>
            If you have any questions about these Terms of Service, please contact us at:
          </p>
          <div className="contact-info">
            <p><strong>Email:</strong> legal@mybudgetpal.lk</p>
            <p><strong>Address:</strong> 410, Galle Road, Colombo 03, Sri Lanka</p>
            <p><strong>Phone:</strong> +94 11 234 5678</p>
          </div>
        </section>
      </div>
      
      <div className="terms-footer">
        <button className="button-not-now" onClick={handleNotNow}>
          Not right now
        </button>
        <button className="button-agree" onClick={handleAgree}>
          I agree with terms
        </button>
      </div>
    </div>
  );
};

export default TermsAndConditions;