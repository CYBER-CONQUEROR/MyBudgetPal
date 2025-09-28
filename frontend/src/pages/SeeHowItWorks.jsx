import React from "react";
import { useNavigate } from "react-router-dom";
import "../css/seehow.css";

const SeeHowItWorks = () => {
  const navigate = useNavigate();

  const steps = [
    {
      title: "1. Sign Up & Connect",
      description: "Create your account and connect your bank accounts securely. Our bank-level encryption keeps your data safe.",
      image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=60",
      features: ["Secure bank integration", "Multi-account support", "Real-time sync"]
    },
    {
      title: "2. Set Your Salary & Goals",
      description: "Enter your monthly salary and set your financial goals. Our AI will suggest optimal budget allocations for Sri Lankan families.",
      image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=60",
      features: ["Smart salary allocation", "Goal-based budgeting", "EPF/ETF tracking"]
    },
    {
      title: "3. Track & Analyze",
      description: "Monitor your spending with interactive dashboards. Get insights on where your money goes and identify saving opportunities.",
      image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=60",
      features: ["Real-time expense tracking", "Category analytics", "Spending alerts"]
    },
    {
      title: "4. Achieve Your Dreams",
      description: "Watch your savings grow and achieve your financial goals. From emergency funds to dream vacations - we help you get there.",
      image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=1200&q=60",
      features: ["Automated savings", "Goal progress tracking", "Financial forecasting"]
    }
  ];


  return (
    <div className="see-how-page">

      {/* Steps Section */}
      <section className="steps-section">
        <div className="section">
          <div className="section-head center">
            <h2>Your Journey to Financial Freedom</h2>
            <p>Follow these simple steps to take control of your finances</p>
          </div>

          <div className="steps-container">
            {steps.map((step, index) => (
              <div key={index} className="step-card">
                <div className="step-image">
                  <img src={step.image} alt={step.title} loading="lazy" />
                </div>
                <div className="step-content">
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <ul className="step-features">
                    {step.features.map((feature, i) => (
                      <li key={i}>{feature}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* CTA Section */}
      <section className="cta-section">
        <div className="section">
          <div className="cta-content">
            <h2>Ready to Start Your Financial Journey?</h2>
            <p>Join thousands of Sri Lankan families who have transformed their financial lives with MyBudgetPal</p>
            <div className="cta-actions">
              <button 
                className="cta-btn cta-primary"
                onClick={() => navigate('/login')}
              >
                Get Started Free
              </button>
              <button 
                className="cta-btn cta-secondary"
                onClick={() => navigate('/')}
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SeeHowItWorks;
