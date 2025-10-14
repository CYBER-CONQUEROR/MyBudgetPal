import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/home.css";

const easeOutQuad = (t) => t * (2 - t);

const AnimatedNumber = ({ value, prefix = "", suffix = "", duration = 1600 }) => {
  const [n, setN] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    let raf;
    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const p = Math.min(1, (ts - startRef.current) / duration);
      setN(Math.round(value * easeOutQuad(p)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span>{prefix}{n.toLocaleString()}{suffix}</span>;
};

const Home = () => {
  const navigate = useNavigate();
  const [activeBtn, setActiveBtn] = useState(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [vidIdx, setVidIdx] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const videoRef1 = useRef(null);
  const videoRef2 = useRef(null);

  // Two-video playlist (budget -> family -> loop)
  const videoPlaylist = useMemo(
    () => [
      {
        src: "/budget.mp4",
        poster:
          "https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&w=1600&q=40",
        type: "video/mp4",
      },
      {
        src: "/family.mp4",
        poster:
          "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1600&q=40",
        type: "video/mp4",
      },
    ],
    []
  );

  // Ensure autoplay on Safari/iOS & others
  const ensurePlay = (videoRef) => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.muted = true;
      v.setAttribute("muted", "");
      v.setAttribute("playsinline", "");
      const p = v.play();
      if (p?.catch) {
        p.catch(() =>
          setTimeout(() => v.play().catch(() => {}), 150)
        );
      }
    } catch {}
  };

  // Smooth transition between videos
  const transitionToNextVideo = useCallback(() => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    const nextIdx = (vidIdx + 1) % videoPlaylist.length;
    const currentVideo = vidIdx % 2 === 0 ? videoRef1 : videoRef2;
    const nextVideo = nextIdx % 2 === 0 ? videoRef1 : videoRef2;
    
    // Start loading next video
    if (nextVideo.current) {
      nextVideo.current.src = videoPlaylist[nextIdx].src;
      nextVideo.current.load();
      
      nextVideo.current.oncanplaythrough = () => {
        // Start crossfade transition
        nextVideo.current.style.opacity = '0';
        nextVideo.current.style.zIndex = '2';
        currentVideo.current.style.zIndex = '1';
        
        // Add transition class for smoother animation
        nextVideo.current.classList.add('transitioning');
        currentVideo.current.classList.add('transitioning');
        
        // Fade in next video
        nextVideo.current.style.opacity = '1';
        
        // Start playing next video
        ensurePlay(nextVideo);
        
        // Fade out current video after a delay
        setTimeout(() => {
          currentVideo.current.style.opacity = '0';
          
          // Complete transition
          setTimeout(() => {
            setVidIdx(nextIdx);
            setIsTransitioning(false);
            
            // Reset styles and remove transition classes
            currentVideo.current.style.opacity = '1';
            currentVideo.current.style.transition = 'none';
            nextVideo.current.style.transition = 'none';
            currentVideo.current.classList.remove('transitioning');
            nextVideo.current.classList.remove('transitioning');
          }, 1500);
        }, 300);
      };
    }
  }, [isTransitioning, vidIdx, videoPlaylist]);

  useEffect(() => {
    // Initialize first video
    ensurePlay(vidIdx % 2 === 0 ? videoRef1 : videoRef2);
    
    // Preload the second video for smoother transitions
    const nextVideo = vidIdx % 2 === 0 ? videoRef2 : videoRef1;
    if (nextVideo.current) {
      nextVideo.current.src = videoPlaylist[1].src;
      nextVideo.current.preload = 'auto';
    }
  }, [vidIdx, videoPlaylist]);

  // Set up video end handlers and preload next video
  useEffect(() => {
    const currentVideo = vidIdx % 2 === 0 ? videoRef1 : videoRef2;
    const nextVideo = vidIdx % 2 === 0 ? videoRef2 : videoRef1;
    const nextIdx = (vidIdx + 1) % videoPlaylist.length;
    
    if (currentVideo.current) {
      currentVideo.current.onended = transitionToNextVideo;
    }
    
    // Preload next video for smoother transitions
    if (nextVideo.current && !isTransitioning) {
      nextVideo.current.src = videoPlaylist[nextIdx].src;
      nextVideo.current.preload = 'auto';
    }
  }, [vidIdx, isTransitioning, videoPlaylist, transitionToNextVideo]);

  // Scroll reveal
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.15 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const features = useMemo(
    () => [
      {
        title: "Smart Salary Allocation",
        description:
          "Split income to essentials, savings, and lifestyle with auto-recommendations tuned for Sri Lankan costs.",
        image:
          "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=60",
      },
      {
        title: "Expense Analytics Dashboard",
        description:
          "Interactive charts for categories, trends, and burn-rate. Click a segment to filter instantly.",
        image:
          "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=60",
      },
      {
        title: "Automated Savings Goals",
        description:
          "Create targets (Emergency, Vehicle, Trip). Auto-allocate monthly and track progress visually.",
        image:
          "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=1200&q=60",
      },
      {
        title: "Bill & Commitment Alerts",
        description:
          "Never miss due dates for loans, credit cards, utilities. Get reminders on WhatsApp or email.",
        image:
          "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1200&q=60",
      },
      {
        title: "Bank-Level Security",
        description:
          "Data encrypted at rest and in transit. Role-based access for family transparency & control.",
        image:
          "https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1200&q=60",
      },
      {
        title: "Predictive Planning",
        description:
          "AI forecasts next month's spend & shortfalls from your history to prevent overshoots.",
        image:
          "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=60",
      },
    ],
    []
  );

  const journey = useMemo(
    () => [
      {
        title: "Payday",
        desc: "Salary safely deposited and instantly allocated into smart budgets.",
        img: "https://images.unsplash.com/photo-1521791055366-0d553872125f?auto=format&fit=crop&w=1400&q=60",
      },
      {
        title: "Essentials Covered",
        desc: "Bills, rent, and loans handled automatically — no more missed payments.",
        img: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1400&q=60",
      },
      {
        title: "Savings Growing",
        desc: "Part of your income moves into savings goals and emergency funds.",
        img: "https://images.unsplash.com/photo-1589758438368-0ad531db3366?auto=format&fit=crop&w=1400&q=60",
      },
      {
        title: "Dreams Achieved",
        desc: "Vacations, education, or a new home — plan confidently for milestones.",
        img: "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?auto=format&fit=crop&w=1400&q=60",
      },
    ],
    []
  );

  const testimonials = useMemo(
    () => [
      {
        name: "Pradeep Silva",
        role: "Software Engineer, Colombo",
        rating: 5,
        text: "MyBudgetPal changed how our family manages money. We saved Rs. 150,000 for our home down payment in just 8 months!",
        avatar:
          "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80",
      },
      {
        name: "Nimesha Fernando",
        role: "Teacher, Kandy",
        rating: 5,
        text: "The EPF tracking and festival budgeting features are exactly what Sri Lankan families need. Highly recommended!",
        avatar:
          "https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?auto=format&fit=crop&w=150&q=80",
      },
      {
        name: "Rohan Perera",
        role: "Bank Manager, Galle",
        rating: 5,
        text: "Professional-grade security with family-friendly features. Perfect for managing multiple accounts and goals.",
        avatar:
          "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
      },
    ],
    []
  );

  const benefits = useMemo(
    () => [
      { icon: "📊", title: "Data-Driven Insights", description: "Make informed financial decisions with detailed analytics and spending patterns." },
      { icon: "⚡", title: "Instant Notifications", description: "Real-time alerts for bill due dates, low balances, and spending limits." },
      { icon: "🎯", title: "Goal Achievement", description: "Set and track multiple financial goals with automated savings allocation." },
      { icon: "🏠", title: "Family Collaboration", description: "Shared budgets and transparent family financial planning made easy." },
    ],
    []
  );

  const isFamilyActive = videoPlaylist[vidIdx]?.src?.includes("family");

  return (
    <div className="home">
      {/* HERO */}
      <section className="hero" aria-label="Hero: Smart Salary Management">
        <div className="hero-media" aria-hidden="true">
          {/* Dual video elements for smooth crossfade transitions */}
          <video
            ref={videoRef1}
            className={`hero-video ${isVideoLoaded ? "loaded" : ""} ${isFamilyActive ? "dim" : ""}`}
            autoPlay
            playsInline
            muted
            preload="auto"
            onLoadedData={() => {
              setIsVideoLoaded(true);
              if (vidIdx === 0) ensurePlay(videoRef1);
            }}
            poster={videoPlaylist[0].poster}
            style={{
              opacity: vidIdx === 0 ? 1 : 0,
              zIndex: vidIdx === 0 ? 2 : 1
            }}
          >
            <source src={videoPlaylist[0].src} type={videoPlaylist[0].type} />
          </video>
          
          <video
            ref={videoRef2}
            className={`hero-video ${isVideoLoaded ? "loaded" : ""} ${isFamilyActive ? "dim" : ""}`}
            autoPlay
            playsInline
            muted
            preload="auto"
            onLoadedData={() => {
              setIsVideoLoaded(true);
              if (vidIdx === 1) ensurePlay(videoRef2);
            }}
            poster={videoPlaylist[1].poster}
            style={{
              opacity: vidIdx === 1 ? 1 : 0,
              zIndex: vidIdx === 1 ? 2 : 1
            }}
          >
            <source src={videoPlaylist[1].src} type={videoPlaylist[1].type} />
          </video>
          
          <div className="hero-overlay" />
        </div>

        <div className="hero-inner section">
          <h3 className="welcome-text reveal">Welcome to MyBudgetPal</h3>
          <h1 className="hero-title reveal">
            Smart Salary Management for <span className="grad">Sri Lankan Families</span>
          </h1>
          <p className="hero-sub reveal">
            Make every rupee work: intelligent budgeting, predictive insights,
            and family-friendly collaboration—built for Sri Lanka.
          </p>
          <div className="hero-ctas reveal">
            <button
              className={`cta-btn ${activeBtn === "salary" ? "cta-primary" : "cta-secondary"}`}
              onClick={() => {
                setActiveBtn("salary");
                navigate("/login");
              }}
              type="button"
            >
              Start Managing Your Salary
            </button>
            <button
              className={`cta-btn ${activeBtn === "works" ? "cta-primary" : "cta-secondary"}`}
              onClick={() => {
                setActiveBtn("works");
                navigate("/seehow");
              }}
              type="button"
            >
              See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="stats" aria-label="Platform stats">
        <div className="section">
          <div className="stats-grid">
            <div className="stat reveal">
              <div className="stat-number">
                <AnimatedNumber value={12} suffix="K+" />
              </div>
              <div className="stat-label">Happy Families</div>
            </div>
            <div className="stat reveal">
              <div className="stat-number">
                <AnimatedNumber prefix="Rs. " value={180} suffix="M+" />
              </div>
              <div className="stat-label">Salary Managed</div>
            </div>
            <div className="stat reveal">
              <div className="stat-number">
                <AnimatedNumber value={97} suffix="%" />
              </div>
              <div className="stat-label">Satisfaction</div>
            </div>
            <div className="stat reveal">
              <div className="stat-number">
                <AnimatedNumber value={24} suffix="/7" />
              </div>
              <div className="stat-label">Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES — BEFORE benefits */}
      <section id="features" className="features" aria-label="Features">
        <div className="section">
          <div className="section-head reveal">
            <h2>Powerful Salary Management Features</h2>
            <p>
              Everything you need to plan, spend wisely, and hit your savings
              goals—without the spreadsheets.
            </p>
          </div>

          <div className="cards">
            {features.map((f, i) => (
              <article className="card reveal" key={i}>
                <div className="card-media">
                  <img src={f.image} alt={f.title} loading="lazy" />
                </div>
                <div className="card-body">
                  <h3>{f.title}</h3>
                  <p>{f.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFITS — AFTER features */}
      <section className="benefits" aria-label="Key Benefits">
        <div className="section">
          <div className="section-head reveal">
            <h2>Why Choose MyBudgetPal?</h2>
            <p>
              Experience the difference with smart financial management designed
              for modern Sri Lankan families
            </p>
          </div>

          <div className="benefits-grid">
            {benefits.map((benefit, i) => (
              <div className="benefit-card reveal" key={i}>
                <span className="benefit-icon">{benefit.icon}</span>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JOURNEY */}
      <section id="journey" className="journey" aria-label="Your salary journey">
        <div className="section">
          <div className="section-head center reveal">
            <h2>Your Salary Journey</h2>
            <p>
              See how MyBudgetPal transforms every rupee — from payday to
              savings and dreams.
            </p>
          </div>

          <div className="journey-track">
            {journey.map((step, i) => (
              <div key={i} className="journey-card reveal">
                <img src={step.img} alt={step.title} className="journey-img" />
                <div className="journey-overlay" />
                <div className="journey-text">
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials" aria-label="Customer Testimonials">
        <div className="section">
          <div className="section-head center reveal">
            <h2>What Our Users Say</h2>
            <p>
              Join thousands of satisfied families who have transformed their
              financial lives
            </p>
          </div>

          <div className="testimonials-grid">
            {testimonials.map((testimonial, i) => (
              <div className="testimonial-card reveal" key={i}>
                <div className="testimonial-header">
                  <img
  src={testimonial.avatar}
  alt={testimonial.name}
  className="testimonial-avatar"
  loading="lazy"
  decoding="async"
  onError={(e) => {
    // stop infinite loops if fallback also fails
    e.currentTarget.onerror = null;
    // use a deterministic placeholder based on the name
    e.currentTarget.src = `https://i.pravatar.cc/120?u=${encodeURIComponent(
      testimonial.name
    )}`;
  }}
/>

                  <div className="testimonial-info">
                    <h4>{testimonial.name}</h4>
                    <p>{testimonial.role}</p>
                    <div className="testimonial-rating">
                      {[...Array(testimonial.rating)].map((_, j) => (
                        <span key={j} className="star">★</span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="testimonial-text">{testimonial.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section className="about" aria-label="Built for Sri Lankan salary earners">
        <div className="section about-grid">
          <div className="about-text reveal">
            <h2>Built for Sri Lankan Salary Earners</h2>
            <p>
              From EPF/ETF tracking to festival budgeting and family
              collaboration, every detail is localized for your needs.
            </p>
            <ul className="ticks">
              <li>EPF & ETF Contribution Tracking</li>
              <li>Festival &amp; Cultural Budget Planning</li>
              <li>Local Bank Integration &amp; Support</li>
              <li>Multi-language Interface (Sinhala/Tamil/English)</li>
              <li>Sri Lankan Tax Calculation Tools</li>
              <li>Family Collaboration Features</li>
            </ul>
          </div>
          <div className="about-media reveal">
            <img
              src="https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1200&q=60"
              alt="Family planning finances"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="cta" aria-label="Final call to action">
        <div className="section cta-inner">
          <h2 className="cta-title reveal">Ready to Take Control?</h2>
          <p className="cta-text reveal">
            Join thousands of Sri Lankan families who have transformed their
            financial future with <strong>MyBudgetPal</strong>
          </p>
          <div className="cta-actions reveal">
            <button 
              className="cta-btn cta-primary"
              onClick={() => navigate("/login")}
            >
              Get Started Free
            </button>
            <button 
              className="cta-btn cta-secondary"
              onClick={() => navigate("/contactus")}
            >
              Schedule Demo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
