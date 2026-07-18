/**
 * All personal portfolio content in one place.
 * Replace the placeholder strings marked with TODO before publishing.
 */
export const PROFILE = {
  name: 'Ezra Song',
  koreanName: '송에즈라',
  title: 'Frontend Engineer & Creative Developer',
  koreanTitle: '프론트엔드 엔지니어',
  location: 'Waterloo · Toronto, Canada',

  links: {
    github: 'https://github.com/ezrasong',
    linkedin: 'https://linkedin.com/in/e34song',
    email: 'e34song@uwaterloo.ca',
    resume: 'Ezra_Song_Resume.pdf',
  },

  about: {
    paragraphs: [
      'I study mathematics at the University of Waterloo and build software that people actually use — course planners, chat clients, and research tooling.',
      'Right now I build frontend for research tools at Unmodal Research. Before that I shipped React Native prototypes, ran QA pipelines, and built production React UI.',
      'This little Seoul is a love letter to the city — explore it, bump into things, and go knock on some doors.',
    ],
  },

  skills: {
    groups: [
      {
        title: 'Languages',
        items: ['TypeScript', 'JavaScript', 'Python', 'Java', 'C++', 'C#', 'SQL', 'Racket'],
      },
      {
        title: 'Frameworks',
        items: ['React', 'React Native', 'Three.js', 'Node.js', 'Express', 'Supabase', 'Firebase'],
      },
      {
        title: 'Tools',
        items: ['Git', 'Docker', 'GitHub Actions', 'Linux', 'Vite', 'REST APIs'],
      },
    ],
  },

  experience: [
    {
      role: 'Frontend Engineer',
      company: 'Unmodal Research Inc.',
      range: 'Jan 2026 — present',
      summary:
        'Building frontend features and reusable UI components for internal and client-facing research tools.',
    },
    {
      role: 'Web Developer',
      company: 'DoBetter.love',
      range: 'Sep — Nov 2025',
      summary:
        'Structured QA workflows for mobile app features: UI/UX consistency, edge-case validation, regression verification.',
    },
    {
      role: 'Mobile App Developer',
      company: 'AIXFF',
      range: 'Jul — Aug 2025',
      summary:
        'Storefront prototype in React Native and Expo with modular API service layers and Context-based state.',
    },
    {
      role: 'Junior Software Engineer',
      company: 'North P&D',
      range: 'Feb — Nov 2023',
      summary:
        'React UI components, responsiveness and accessibility improvements, cross-browser QA.',
    },
  ],

  education: {
    school: 'University of Waterloo',
    program: 'BMath, Honours Mathematics',
    range: '2025 — 2029',
  },
} as const;
