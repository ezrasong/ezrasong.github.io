import "./style.css";
import SceneCanvas from "./components/SceneCanvas.jsx";

export default function App() {
  return (
    <>
      <a className="skip-link" href="#about">
        Skip to main content
      </a>
      <SceneCanvas />

      <div className="page">
        <header className="hero">
          <p className="kicker">Portfolio 2025</p>
          <h1>
            Ezra Song
            <span>Creative developer &amp; Waterloo&nbsp;math&nbsp;student</span>
          </h1>
          <p className="lede">
            University of Waterloo Honours Mathematics student, blending coursework rigor with creative technology. I ship
            tactile UI experiments, intelligent bots, and data-driven tools that feel cinematic yet practical.
          </p>
          <div className="hero-actions">
            <a className="primary" href="mailto:e34song@uwaterloo.ca">
              Start a project
            </a>
            <a className="ghost" href="https://github.com/ezrasong" target="_blank" rel="noreferrer">
              Visit GitHub
            </a>
            <a className="ghost resume" href="./EzraSong_Resume.pdf" target="_blank" rel="noreferrer">
              Download Résumé
            </a>
            <button id="audio-toggle" className="ghost audio-toggle" type="button" aria-pressed="false">
              Enable sound
            </button>
          </div>
        </header>

        <section className="section about" id="about">
          <h2>What I’m focused on</h2>
          <p>
            Coursework keeps my math brain sharp, while internships and side projects give me room to experiment with React,
            React Native, data APIs, and automation. Below is a constantly updated snapshot of the skills and roles I’ve been
            growing.
          </p>
          <ul className="stats" id="stats-list">
            <li>
              <span>4+</span>
              Years shipping creative work
            </li>
            <li>
              <span>9</span>
              Public GitHub projects
            </li>
            <li>
              <span>3</span>
              Clubs led
            </li>
          </ul>
        </section>

        <section className="section skills" id="skills">
          <div className="section-heading">
            <h2>Technical toolkit</h2>
            <p>Languages and frameworks from the latest term’s labs, internships, and club workshops.</p>
          </div>
          <div className="services-grid" id="skills-grid" />
        </section>

        <section className="section experience" id="experience">
          <div className="section-heading">
            <h2>Experience</h2>
            <p>Recent co-ops, internships, and volunteer work building thoughtful software.</p>
          </div>
          <div className="timeline" id="experience-list" />
        </section>

        <section className="section projects" id="projects">
          <div className="section-heading">
            <h2>Selected GitHub projects</h2>
            <p>Each bubble in the background corresponds to one of these repos. Tap, drag, or click below to read more.</p>
          </div>
          <div className="project-grid" id="project-grid" />
        </section>

        <section className="section extracurricular" id="extracurricular">
          <div className="section-heading">
            <h2>Beyond class</h2>
            <p>Clubs, volunteer work, and orchestras where I practice leadership and collaboration.</p>
          </div>
          <div className="extracurricular-grid" id="extracurricular-list" />
        </section>

        <section className="section education" id="education">
          <h2>Education</h2>
          <div id="education-block">
            <p>
              <strong>University of Waterloo</strong> · Honours Mathematics · Waterloo, ON
            </p>
            <p>Expected Apr 2029</p>
          </div>
        </section>

        <section className="section contact" id="contact">
          <h2>Let’s make something remarkable</h2>
          <p>
            Available for internships, freelance collaborations, and hackathon teams. Always happy to chat about React, React
            Native, Supabase, creative coding, or anything mathy.
          </p>
          <div className="contact-links">
            <a data-link="email" href="mailto:e34song@uwaterloo.ca">
              e34song@uwaterloo.ca
            </a>
            <a data-link="phone" href="tel:+16475646754">
              +1 (647) 564-6754
            </a>
            <a data-link="linkedin" href="https://linkedin.com/e34song" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <a data-link="github" href="https://github.com/ezrasong" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </section>
      </div>

      <div id="intro-prompt" className="intro-prompt" role="dialog" aria-modal="true">
        <div className="intro-card">
          <p className="tag">Welcome</p>
          <h2>Enter the studio?</h2>
          <p>Step inside to explore the projects, drag the bubbles, and trigger the cinematic panels.</p>
          <button id="intro-enter" type="button">
            Let’s begin
          </button>
        </div>
      </div>

      <div id="bubble-panel-overlay" className="bubble-panel-overlay hidden" />
      <aside
        id="bubble-panel"
        className="bubble-panel hidden"
        aria-live="polite"
        aria-hidden="true"
        aria-labelledby="bubble-panel-title"
        aria-describedby="bubble-panel-description"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <button id="bubble-panel-close" aria-label="Close project details">
          ×
        </button>
        <p className="panel-tag">Project</p>
        <h3 id="bubble-panel-title" />
        <div className="panel-media hidden" id="bubble-panel-media">
          <img id="bubble-panel-image" alt="Project preview" loading="lazy" decoding="async" width="1200" height="900" />
        </div>
        <div className="panel-details">
          <p id="bubble-panel-description" />
          <p id="bubble-panel-meta" />
        </div>
        <div className="panel-actions">
          <a id="bubble-panel-link" className="primary" href="#" target="_blank" rel="noreferrer">
            Visit project
          </a>
          <a id="bubble-panel-secondary" className="ghost" href="#projects">
            More work
          </a>
        </div>
      </aside>
    </>
  );
}
