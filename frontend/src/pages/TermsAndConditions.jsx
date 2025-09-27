import React from 'react';
import '../css/TermsAndCondtions.css';

const TermsAndConditions = () => {
  return (
    <div className="terms-container">
      <div className="terms-header">
        <p className="agreement-label">AGREEMENT</p>
        <h1>Terms of Service</h1>
      </div>
      <div className="terms-content">
        <p>
          We know it's tempting to skip these Terms of Service, but it's important to establish what you can expect from us as you use *My Budget Pal* services, and what we expect from you.
        </p>
        <p>
          These Terms of Service reflect the way My Budget Pal business works, the laws that apply to our company, and certain things we've always believed to be true. As a result, these Terms of Service help define My Budget Pal's relationship with you as you interact with our services. For example, these terms include the following topic headings:
        </p>
        <ul>
          <li>
            *What you can expect from us,* which describes how we provide and develop our services.
          </li>
          <li>
            *What we expect from you,* which establishes certain rules for using our services.
          </li>
          <li>
            *Content in My Budget Pal services,* which describes the intellectual property rights to the content you find in our services — whether that content belongs to you, My Budget Pal, or others.
          </li>
          <li>
            *In case of problems or disagreements,* which describes other legal rights you have, and what to expect in case someone violates these terms.
          </li>
        </ul>
        <p>
          Understanding these terms is important because, to use our services, you must accept these terms.
        </p>
        <p>
          Besides these terms, we also publish a Privacy Policy. Although it's not part of these terms, we encourage you to read it to better understand how you can update, manage, export, and delete your information.
        </p>
      </div>
      <div className="terms-footer">
        <button className="button-not-now">Not right now...</button>
        <button className="button-agree">I agree with terms</button>
      </div>
    </div>
  );
};

export default TermsAndConditions;