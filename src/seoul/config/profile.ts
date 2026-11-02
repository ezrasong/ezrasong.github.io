import resume from '../../content/resume.json';

/** Résumé facts are generated from the PDF at build time for both sites. */
export const PROFILE = {
  name: resume.name,
  koreanName: '송에즈라',
  title: 'Software Engineer',
  koreanTitle: '소프트웨어 엔지니어',
  location: 'Waterloo · Toronto, Canada',
  links: resume.links,
  about: {
    paragraphs: [
      resume.intro,
      resume.status.paragraph,
      'This little Seoul is a love letter to the city. Explore it, bump into things, and go knock on some doors.',
    ],
  },
  skills: { groups: resume.skills },
  experience: resume.experience.map((job) => ({ ...job, summary: job.bullets.join(' ') })),
  education: resume.education,
  resumeProjects: resume.projects,
  awards: resume.awards,
};
