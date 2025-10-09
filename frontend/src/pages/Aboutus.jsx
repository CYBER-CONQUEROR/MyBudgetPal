import "bootstrap/dist/css/bootstrap.min.css";

export default function AboutUs() {
  return (
    <div className="bg-light" style={{ width: "100vw" }}>
      
      {/* Hero Section */}
      <section className="position-relative text-white text-center">
        <img
          src="https://images.unsplash.com/photo-1520607162513-77705c0f0d4a"
          alt="Finance Hero"
          className="img-fluid w-100"
          style={{
            height: "400px",
            objectFit: "cover",
            filter: "brightness(50%)"
          }}
        />
        <div className="position-absolute top-50 start-50 translate-middle">
          <h1 className="display-4 fw-bold">About MyBudgetPal</h1>
          <p className="lead">Smart salary management for every Sri Lankan family</p>
          <a href="#mission" className="btn btn-warning btn-lg mt-3">
            Learn More
          </a>
        </div>
      </section>

      {/* Who We Are */}
      <section className="py-5 container">
        <div className="row align-items-center g-4">
          <div className="col-md-6">
            <img
              src="https://cdn.pixabay.com/photo/2024/08/03/10/09/business-8941855_1280.jpg"
              alt="Who We Are"
              className="img-fluid rounded shadow"
            />
          </div>
          <div className="col-md-6">
            <h2 className="fw-bold text-primary">Who We Are...</h2>
            <p className="fs-5 mt-3">
              MyBudgetPal was built to solve a common challenge: salaries vanish,
              bills are forgotten, and savings never grow. We provide families
              with a simple, powerful, and secure way to manage money with confidence.
            </p>
          </div>
        </div>
      </section>

      {/* Mission, Vision, Values */}
      <section id="mission" className="py-5 bg-white">
        <div className="container text-center">
          <h2 className="fw-bold mb-5 text-primary">Our Mission, Vision & Values</h2>
          <div className="row g-4">
            {[
              {
                icon: "bi-bullseye text-primary",
                title: "Mission",
                text: "To give households financial clarity, reduce stress, and encourage savings habits."
              },
              {
                icon: "bi-eye text-warning",
                title: "Vision",
                text: "A future where every family achieves financial freedom using smart technology."
              },
              {
                icon: "bi-heart text-danger",
                title: "Values",
                text: "Trust, transparency, innovation, and a passion for empowering families."
              }
            ].map((item, idx) => (
              <div key={idx} className="col-md-4">
                <div className="card shadow border-0 h-100">
                  <div className="card-body">
                    <i className={`bi ${item.icon} fs-1`}></i>
                    <h5 className="fw-bold mt-3">{item.title}</h5>
                    <p>{item.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-5 bg-light">
        <div className="container">
          <h2 className="fw-bold text-center mb-5 text-primary">Why Choose Us?</h2>
          <div className="row g-4 text-center">
            {[
              {
                icon: "bi-cash-coin",
                title: "Smart Budgeting",
                desc: "Track income, expenses, and savings effortlessly."
              },
              {
                icon: "bi-shield-lock",
                title: "Secure Data",
                desc: "Your financial information is encrypted and protected."
              },
              {
                icon: "bi-phone",
                title: "Mobile Friendly",
                desc: "Access your budget anywhere, anytime."
              },
              {
                icon: "bi-graph-up",
                title: "AI Insights",
                desc: "Get forecasts and recommendations to plan smarter."
              }
            ].map((item, idx) => (
              <div key={idx} className="col-md-6 col-lg-3">
                <div className="card border-0 shadow h-100 hover-shadow">
                  <div className="card-body">
                    <i className={`bi ${item.icon} fs-1 text-primary`}></i>
                    <h5 className="fw-bold mt-3">{item.title}</h5>
                    <p>{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Journey */}
<section className="py-5 bg-light">
  <div className="container">
    <h2 className="fw-bold text-center text-primary mb-5">Our Journey</h2>
    <div className="row g-4">
      {[
        {
          img: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f",
          title: "The Problem",
          text: "Families struggled as salaries disappeared quickly, bills piled up, and savings goals seemed out of reach."
        },
        {
          img: "https://images.pexels.com/photos/128867/coins-currency-investment-insurance-128867.jpeg",
          title: "The Idea",
          text: "Our vision was clear: create a simple yet powerful platform to track money, manage bills, and guide smarter financial decisions."
        },
        {
          img: "https://cdn.pixabay.com/photo/2016/11/29/09/32/concept-1868728_1280.jpg",
          title: "The Future",
          text: "We are expanding MyBudgetPal with AI-driven insights, smart savings plans, and personalized financial recommendations."
        }
      ].map((step, idx) => (
        <div key={idx} className="col-md-4">
          <div className="card h-100 border-0 shadow-lg overflow-hidden position-relative">
            {/* Image */}
            <img
              src={step.img}
              className="card-img-top"
              alt={step.title}
              style={{ height: "280px", objectFit: "cover" }}
            />    

           
            <div
              className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column justify-content-center align-items-center text-center text-white px-3"
              style={{
                background: "rgba(0,0,0,0.5)",
                opacity: 1, 
                transition: "all 0.3s ease"
              }}
            >
              <h5 className="fw-bold">{step.title}</h5>
              <p className="small mb-0">{step.text}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
</section>

    </div>
  );
}
