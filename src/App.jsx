import { useEffect, useState } from "react";
import "./style.css";
import SceneCanvas from "./components/SceneCanvas.jsx";
import siteDataLocal from "./site-data.json";

const dataUrl = new URL("./site-data.json", import.meta.url).href;

export default function App() {
  const [siteData, setSiteData] = useState(siteDataLocal);
  const [panelProject, setPanelProject] = useState(null);
  const showProjectPanel = (project) => {
    if (!project) return;
    setPanelProject(project);
    document.body.classList.add("panel-open");
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${dataUrl}?cache=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json) {
          setSiteData(json);
        }
      } catch (error) {
        console.warn("Site data fetch failed; using bundled data", error);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onShow = (event) => {
      if (event?.detail) {
        showProjectPanel(event.detail);
      }
    };
    const onHide = () => {
      setPanelProject(null);
      document.body.classList.remove("panel-open");
    };
    window.addEventListener("panel:show", onShow);
    window.addEventListener("panel:hide", onHide);
    return () => {
      window.removeEventListener("panel:show", onShow);
      window.removeEventListener("panel:hide", onHide);
      document.body.classList.remove("panel-open");
    };
  }, []);

  const {
    profileLinks = {},
    stats = [],
    skills = [],
    experiences = [],
    featuredProjects = [],
    extracurriculars = [],
    education = {},
  } = siteData || {};

  return (
    <>
      <a className="skip-link" href="#about">
        Skip to main content
      </a>
      <SceneCanvas />

      <div className="page">
        <header className="hero">
          <p className="kicker">Student portfolio</p>
          <h1>
            Ezra Song
            <span>Waterloo math student who likes building things</span>
          </h1>
          <p className="lede">
            Honours Math at the University of Waterloo. I build web apps, Discord bots, and desktop
            tools in my spare time. Mostly to learn, sometimes because a class assignment sent me
            off on a tangent.
          </p>
          <div className="hero-actions">
            <a className="primary" href="mailto:e34song@uwaterloo.ca">
              Say hi
            </a>
            <a
              className="ghost"
              href="https://github.com/ezrasong"
              target="_blank"
              rel="noreferrer"
            >
              Visit GitHub
            </a>
            <a
              className="ghost resume"
              href="/Ezra_Song_Resume.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Download Résumé
            </a>
            <button
              id="audio-toggle"
              className="ghost audio-toggle"
              type="button"
              aria-pressed="false"
            >
              Enable sound
            </button>
          </div>
        </header>

        <section className="section about" id="about">
          <h2>What I’m up to</h2>
          <p>
            Right now I’m splitting time between classes, co-op hunting, and side projects. Some of
            this started as an assignment I got too curious about; the rest is just weekend
            tinkering that stuck around.
          </p>
          <ul className="stats" id="stats-list">
            {(stats || []).map((stat) => (
              <li key={stat.label}>
                <span>{stat.value}</span>
                {stat.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="section skills" id="skills">
          <div className="section-heading">
            <h2>Stuff I use</h2>
            <p>Picked up across coursework, side projects, and a couple of internships.</p>
          </div>
          <div className="services-grid" id="skills-grid">
            {(skills || []).map((skill) => (
              <article className="service-card" key={skill.title}>
                <div className="service-icon">{skill.icon || "✷"}</div>
                <h3>{skill.title}</h3>
                <ul>
                  {(skill.items || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="section experience" id="experience">
          <div className="section-heading">
            <h2>Experience</h2>
            <p>Where I’ve worked so far and what I built while I was there.</p>
          </div>
          <div className="timeline" id="experience-list">
            {(experiences || []).map((exp) => (
              <article className="timeline-card" key={`${exp.company}-${exp.role}-${exp.range}`}>
                <header>
                  <h3>
                    {exp.role} · {exp.company}
                  </h3>
                  <div className="timeline-meta">
                    {exp.range || ""}
                    {exp.location ? ` • ${exp.location}` : ""}
                  </div>
                </header>
                {exp.summary ? <p>{exp.summary}</p> : null}
                {exp.highlights?.length ? (
                  <ul>
                    {exp.highlights.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="section projects" id="projects">
          <div className="section-heading">
            <h2>Things I’ve built</h2>
            <p>
              The floating bubbles in the background are these projects too. Drag them around if
              you feel like it.
            </p>
          </div>
          <div className="project-grid" id="project-grid">
            {(featuredProjects || []).map((project) => (
              <article
                className="project-card"
                key={project.title}
                tabIndex={0}
                onClick={() => showProjectPanel(project)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    showProjectPanel(project);
                  }
                }}
              >
                {project.image ? (
                  <div className="project-thumb">
                    <img
                      src={project.image}
                      alt={`${project.title} preview`}
                      loading="lazy"
                      decoding="async"
                      width="1200"
                      height="600"
                    />
                  </div>
                ) : null}
                <p className="tag">GitHub</p>
                <h3>{project.title}</h3>
                <p>{project.description}</p>
                {project.stack?.length ? (
                  <div className="project-tags">
                    {project.stack.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
                <footer>
                  <a className="text-link" href={project.link} target="_blank" rel="noreferrer">
                    View repo ↗
                  </a>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="section extracurricular" id="extracurricular">
          <div className="section-heading">
            <h2>Outside class</h2>
            <p>Hackathons, clubs, and the occasional weekend project that turned into a win.</p>
          </div>
          <div className="extracurricular-grid" id="extracurricular-list">
            {(extracurriculars || []).map((item) => (
              <article className="extracurricular-card" key={item.title}>
                <h3>{item.title}</h3>
                <p className="meta">
                  {item.org || ""}
                  {item.range ? ` • ${item.range}` : ""}
                </p>
                <p>{item.description || ""}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section education" id="education">
          <h2>Education</h2>
          <div id="education-block">
            <p>
              <strong>{education.school || "University of Waterloo"}</strong>
              {education.program ? ` · ${education.program}` : ""}
              {education.location ? ` · ${education.location}` : ""}
            </p>
            <p>{education.graduation || "Expected Apr 2029"}</p>
          </div>
        </section>

        <section className="section contact" id="contact">
          <h2>Let’s talk</h2>
          <p>
            Currently on the frontend team at Unmodal Research. Happy to chat about React, React
            Native, Supabase, creative coding, or anything math-adjacent.
          </p>
          <div className="contact-links">
            <a
              className="text-link"
              data-link="email"
              href={`mailto:${profileLinks.email || "e34song@uwaterloo.ca"}`}
            >
              {profileLinks.email || "e34song@uwaterloo.ca"}
            </a>
            <a
              className="text-link"
              data-link="phone"
              href={`tel:${(profileLinks.phone || "+1 (647) 564-6754").replace(/[^+\d]/g, "")}`}
            >
              {profileLinks.phone || "+1 (647) 564-6754"}
            </a>
            <a
              className="text-link"
              data-link="linkedin"
              href={profileLinks.linkedin || "https://linkedin.com/in/e34song"}
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
            <a
              className="text-link"
              data-link="github"
              href={profileLinks.github || "https://github.com/ezrasong"}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </section>
      </div>

      <div id="intro-prompt" className="intro-prompt" role="dialog" aria-modal="true">
        <div className="intro-card">
          <p className="tag">Quick tour</p>
          <h2>How to use this site</h2>
          <ul className="intro-steps">
            <li>Scroll for the usual portfolio bits: about, skills, experience, projects.</li>
            <li>The floating bubbles in the background are each a project. Click one to read about it.</li>
            <li>You can drag the bubbles around if you want to mess with them.</li>
            <li>Hit the audio toggle in the hero for a bit of ambience.</li>
          </ul>
          <button id="intro-enter" type="button">
            Got it
          </button>
        </div>
      </div>

      <ProjectPanel project={panelProject} onClose={() => setPanelProject(null)} />
    </>
  );
}

function ProjectPanel({ project, onClose }) {
  const isOpen = Boolean(project);
  const handleClose = () => {
    onClose();
    window.dispatchEvent(new CustomEvent("panel:hide"));
  };
  useEffect(() => {
    const onEsc = (event) => {
      if (event.key === "Escape") handleClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", onEsc);
    }
    return () => window.removeEventListener("keydown", onEsc);
  }, [isOpen]);

  return (
    <>
      <div
        id="bubble-panel-overlay"
        className={`bubble-panel-overlay ${isOpen ? "" : "hidden"}`}
        onClick={handleClose}
      />
      <aside
        id="bubble-panel"
        className={`bubble-panel ${isOpen ? "" : "hidden"}`}
        aria-live="polite"
        aria-hidden={isOpen ? "false" : "true"}
        aria-labelledby="bubble-panel-title"
        aria-describedby="bubble-panel-description"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <button id="bubble-panel-close" aria-label="Close project details" onClick={handleClose}>
          ×
        </button>
        <p className="panel-tag">Project</p>
        <h3 id="bubble-panel-title">{project?.title || ""}</h3>
        <div className={`panel-media ${project?.image ? "" : "hidden"}`} id="bubble-panel-media">
          {project?.image ? (
            <img
              id="bubble-panel-image"
              alt={`${project.title} preview`}
              src={project.image}
              loading="lazy"
              decoding="async"
              width="1200"
              height="600"
            />
          ) : null}
        </div>
        <div className="panel-details">
          <p id="bubble-panel-description">{project?.description || ""}</p>
          <p id="bubble-panel-meta">{project?.stack?.join(" · ") || ""}</p>
        </div>
        <div className="panel-actions">
          <a
            id="bubble-panel-link"
            className="primary"
            href={project?.link || "#"}
            target="_blank"
            rel="noreferrer"
          >
            Visit project
          </a>
          <a
            id="bubble-panel-secondary"
            className="ghost"
            href="#projects"
            onClick={() => {
              handleClose();
            }}
          >
            More work
          </a>
        </div>
      </aside>
    </>
  );
}
