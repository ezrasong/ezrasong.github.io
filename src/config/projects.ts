import type { ProjectData } from '../types';

/**
 * The five project buildings. Everything a visitor reads about a project
 * comes from this file — edit here, never in the world-building code.
 *
 * TODO: replace placeholder copy, URLs, and image alt text with real projects.
 */
export const PROJECTS: ProjectData[] = [
  {
    id: 'parser-workspace',
    title: 'Docurium',
    koreanTitle: '문서 작업실',
    shortDescription: 'A parser-powered document workspace in the browser.',
    longDescription:
      'A document workspace that parses structured formats into an editable, navigable tree. Live preview, semantic search, and a plugin surface for custom node renderers. (Placeholder project — replace with your real one.)',
    role: 'Design, architecture, and frontend implementation.',
    technologies: ['TypeScript', 'React', 'CodeMirror', 'Web Workers'],
    year: '2025',
    challenge:
      'Keeping the parse tree responsive on large documents — solved with incremental parsing in a worker and windowed rendering.',
    outcome:
      'Sub-100ms edit-to-preview latency on 10MB documents in the placeholder benchmark.',
    images: [
      { alt: 'Docurium workspace with a parsed document tree beside the editor' },
      { alt: 'Docurium semantic search results panel' },
    ],
    liveUrl: 'https://example.com',
    repositoryUrl: 'https://github.com/ezrasong',
    buildingType: 'creative-studio',
    district: 'hongdae',
    position: { x: -36, z: -12 },
    rotation: 0,
    facing: 'east',
    accent: '#ffd447',
    size: { width: 10, depth: 9, floors: 3 },
  },
  {
    id: 'swift-ipad',
    title: 'Hangang Notes',
    koreanTitle: '한강 노트',
    shortDescription: 'A SwiftUI iPad app for handwritten study notes.',
    longDescription:
      'An iPad-first note-taking app built with SwiftUI and PencilKit: infinite canvas, smart shape snapping, and iCloud sync. (Placeholder project — replace with your real one.)',
    role: 'Solo developer — product, UI, and App Store release.',
    technologies: ['Swift', 'SwiftUI', 'PencilKit', 'CloudKit'],
    year: '2025',
    challenge:
      'Latency between pencil input and ink rendering — resolved with a Metal-backed canvas layer and predicted touches.',
    outcome: 'Placeholder: 4.8★ average across early TestFlight cohort.',
    images: [
      { alt: 'Hangang Notes canvas with handwritten calculus notes on iPad' },
      { alt: 'Hangang Notes shape-snapping demonstration' },
    ],
    liveUrl: 'https://example.com',
    repositoryUrl: 'https://github.com/ezrasong',
    buildingType: 'glass-store',
    district: 'gangnam',
    position: { x: 34, z: 10 },
    rotation: 0,
    facing: 'west',
    accent: '#bfe3ff',
    size: { width: 9, depth: 9, floors: 2 },
  },
  {
    id: 'ai-dev',
    title: 'Pair Lab',
    koreanTitle: 'AI 연구소',
    shortDescription: 'An AI-assisted development environment experiment.',
    longDescription:
      'A research prototype exploring how an agentic AI pair-programmer should present diffs, tests, and confidence. Built around a local model orchestrator with a reviewable action log. (Placeholder project — replace with your real one.)',
    role: 'Research engineering and interaction design.',
    technologies: ['TypeScript', 'Node.js', 'LLM APIs', 'WebSockets'],
    year: '2026',
    challenge:
      'Designing trust: every AI action is staged, diffed, and reversible before it touches the working tree.',
    outcome:
      'Placeholder: internal study showed reviewers accepted 72% of staged changes unmodified.',
    images: [
      { alt: 'Pair Lab review queue showing staged AI-proposed changes' },
      { alt: 'Pair Lab confidence and test-result panel' },
    ],
    repositoryUrl: 'https://github.com/ezrasong',
    buildingType: 'tech-lab',
    district: 'gangnam',
    position: { x: 36, z: -12 },
    rotation: 0,
    facing: 'west',
    accent: '#4ce0d2',
    size: { width: 10, depth: 10, floors: 4 },
  },
  {
    id: 'hackathon',
    title: 'LeReplacer',
    koreanTitle: '오락실',
    shortDescription: 'Award-winning hackathon browser extension.',
    longDescription:
      'A browser extension that detects faces in any page or video and swaps them with a custom image in real time. Won Best Pitch at Go On Hacks 2025 at the University of Waterloo.',
    role: 'Built the real-time detection pipeline and the pitch.',
    technologies: ['JavaScript', 'TensorFlow.js', 'Canvas API', 'Chrome Extensions'],
    year: '2025',
    challenge:
      'Running face detection at 30fps inside a content script without janking the host page.',
    outcome: 'Best Pitch award; demoed live on stage without a single dropped frame.',
    images: [
      { alt: 'LeReplacer swapping faces on a news site in real time' },
      { alt: 'Go On Hacks demo stage screenshot' },
    ],
    repositoryUrl: 'https://github.com/ezrasong',
    buildingType: 'arcade',
    district: 'hongdae',
    position: { x: -36, z: 10 },
    rotation: 0,
    facing: 'east',
    accent: '#ff5d8f',
    size: { width: 10, depth: 8, floors: 2 },
  },
  {
    id: 'homeserver',
    title: 'Rack & Seoul',
    koreanTitle: '서버실',
    shortDescription: 'Personal infrastructure: a self-hosted everything box.',
    longDescription:
      'A home-server build running containerized services — media, backups, CI runners, a Minecraft server, and this portfolio’s staging environment — with monitoring and automated failover to the cloud. (Placeholder project — replace with your real one.)',
    role: 'Everything from hardware to Grafana dashboards.',
    technologies: ['Docker', 'Linux', 'Nginx', 'GitHub Actions', 'Grafana'],
    year: '2024',
    challenge:
      'Surviving power cuts and ISP address churn with zero-touch recovery.',
    outcome: 'Placeholder: 99.7% uptime over the last year of self-hosting.',
    images: [
      { alt: 'Home server rack with labeled cables and status LEDs' },
      { alt: 'Grafana dashboard showing service uptime' },
    ],
    repositoryUrl: 'https://github.com/ezrasong',
    buildingType: 'server-facility',
    district: 'gangnam',
    position: { x: 52, z: -18 },
    rotation: 0,
    facing: 'west',
    accent: '#7dff8a',
    size: { width: 9, depth: 8, floors: 2 },
  },
];
