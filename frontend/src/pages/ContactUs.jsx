import React, { useState } from 'react';
import '../css/contactUs.css';

const ContactUs = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    notRobot: false
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox') {
      setFormData({ ...formData, [name]: checked });
    } else if (name === 'name') {
      const filteredValue = value.replace(/[^A-Za-z\s]/g, '');
      setFormData({ ...formData, [name]: filteredValue });
    } else {
      setFormData({ ...formData, [name]: value });
    }

    setFormErrors({ ...formErrors, [name]: '' });
  };

  const validate = () => {
    const errors = {};

    if (!formData.name.trim()) errors.name = 'Full Name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email address';
    }
    if (!formData.subject.trim()) errors.subject = 'Subject is required';
    if (!formData.message.trim()) errors.message = 'Message is required';
    if (!formData.notRobot) errors.notRobot = 'Please confirm you are not a robot';

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    
    try {
      setTimeout(() => {
        setIsSubmitting(false);
        setSubmitStatus('success');
        setFormData({ name: '', email: '', subject: '', message: '', notRobot: false });
        setFormErrors({});
        setTimeout(() => setSubmitStatus(null), 5000);
      }, 1500);
    } catch (error) {
      setIsSubmitting(false);
      setSubmitStatus('error');
      setTimeout(() => setSubmitStatus(null), 5000);
    }
  };

  return (
    <div className="contact-us-container">
      <div className="contact-header">
        <h1>Contact Us</h1>
        <p>Have questions about My Budget Pal? We're here to help!</p>
      </div>

      <div className="contact-content">
        <div className="contact-info">
          <div className="info-card">
            <div className="info-icon">📧</div>
            <h3>Email Us</h3>
            <p>support@mybudgetpal.com</p>
          </div>

          <div className="info-card">
            <div className="info-icon">📞</div>
            <h3>Call Us</h3>
            <p>+94 11 234 5678</p>
            <p>Mon - Fri, 9:00 AM - 5:00 PM</p>
          </div>

          <div className="info-card">
            <div className="info-icon">📍</div>
            <h3>Visit Us</h3>
            <p>No. 123, Financial Street</p>
            <p>Colombo 07, Sri Lanka</p>
          </div>

          <div className="info-card">
            <div className="info-icon">💬</div>
            <h3>Live Chat</h3>
            <p>Available during business hours</p>
            <button className="chat-button">Start Chat</button>
          </div>
        </div>

        <div className="contact-form-container">
          <div className="form-card">
            <h2>Send us a Message</h2>
            <form onSubmit={handleSubmit} className="contact-form">
              <div className="form-group">
                <label htmlFor="name">Full Name <span className="mandatory">*</span></label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={formErrors.name ? 'input-error' : ''}
                  required
                />
                {formErrors.name && <div className="error-message">{formErrors.name}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="email">Email Address <span className="mandatory">*</span></label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={formErrors.email ? 'input-error' : ''}
                  required
                />
                {formErrors.email && <div className="error-message">{formErrors.email}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="subject">Subject <span className="mandatory">*</span></label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  className={formErrors.subject ? 'input-error' : ''}
                  required
                />
                {formErrors.subject && <div className="error-message">{formErrors.subject}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="message">Message <span className="mandatory">*</span></label>
                <textarea
                  id="message"
                  name="message"
                  rows="5"
                  value={formData.message}
                  onChange={handleChange}
                  className={formErrors.message ? 'input-error' : ''}
                  required
                ></textarea>
                {formErrors.message && <div className="error-message">{formErrors.message}</div>}
              </div>

              {/* Professional “I’m not a robot” checkbox */}
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="notRobot"
                    checked={formData.notRobot}
                    onChange={handleChange}
                    className={formErrors.notRobot ? 'input-error' : ''}
                  />{' '}
                  I'm not a robot <span className="mandatory">*</span>
                </label>
                {formErrors.notRobot && <div className="error-message">{formErrors.notRobot}</div>}
              </div>

              <button 
                type="submit" 
                className="submit-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>

              {submitStatus === 'success' && (
                <div className="success-message">
                  Thank you for your message! We'll get back to you soon.
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="error-message">
                  Sorry, there was an error sending your message. Please try again.
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      <div className="faq-section">
        <h2>Frequently Asked Questions</h2>
        <div className="faq-grid">
          <div className="faq-item">
            <h3>How do I reset my password?</h3>
            <p>You can reset your password from the login page by clicking on "Forgot Password" and following the instructions sent to your email.</p>
          </div>
          <div className="faq-item">
            <h3>Is my financial data secure?</h3>
            <p>Yes, we use bank-level encryption and security measures to protect your financial data. Your information is always safe with us.</p>
          </div>
          <div className="faq-item">
            <h3>Can I use My Budget Pal on multiple devices?</h3>
            <p>Yes, your account syncs across all your devices. Simply log in to access your financial data anywhere.</p>
          </div>
          <div className="faq-item">
            <h3>How often is my data backed up?</h3>
            <p>We perform daily automated backups to ensure your data is always protected and available.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactUs;
