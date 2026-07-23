import type { ProjectData } from '../types';

/**
 * The five project buildings. Everything a visitor reads about a project
 * comes from this file — edit here, never in the world-building code.
 * Images with a `src` load real artwork (GitHub OpenGraph cards); entries
 * without one get a generated accent-colored art card.
 */
export const PROJECTS: ProjectData[] = [
  {
    id: 'course-planner',
    title: 'UW Course Planner',
    koreanTitle: '시간표 작업실',
    shortDescription: 'Interactive course planning for Waterloo students.',
    longDescription:
      'An interactive course-planning tool for University of Waterloo students: drag-and-drop term organization, real-time filtering across the course catalogue, Supabase OAuth for sign-in, persistent schedules, and full dark mode.',
    role: 'Solo project: design, frontend, and Supabase backend.',
    technologies: ['React', 'TypeScript', 'Supabase'],
    year: '2025',
    challenge:
      'Keeping drag-and-drop term planning instant while every change syncs to Supabase, with optimistic updates reconciled on the round trip.',
    outcome:
      'A planner with sign-in, persistent schedules, and real-time filtering that survives a full degree map without slowing down.',
    images: [
      {
        alt: 'UW Course Planner repository card',
        src: 'https://opengraph.githubassets.com/1/ezrasong/UW-Course-Planner',
      },
    ],
    repositoryUrl: 'https://github.com/ezrasong/UW-Course-Planner',
    buildingType: 'creative-studio',
    district: 'hongdae',
    position: { x: -43, z: -22 },
    rotation: 0,
    facing: 'east',
    accent: '#6fb1ff',
    size: { width: 10, depth: 9, floors: 3 },
  },
  {
    id: 'voxel-seoul',
    title: 'Mini Seoul',
    koreanTitle: '미니 서울',
    shortDescription: 'The 3D portfolio you are standing in right now.',
    longDescription:
      'This site: a playable miniature Seoul where a poro explores districts and buildings open portfolio content. The city, buildings, signs, and ground are all generated in code, using merged voxel geometry, canvas-painted textures, and a physics-driven character controller.',
    role: 'Everything: world design, engine architecture, and UI.',
    technologies: ['Three.js', 'TypeScript', 'cannon-es', 'Vite', 'GSAP'],
    year: '2026',
    challenge:
      'Keeping an entire city smooth: at most two draw calls per structure, instanced props, one painted ground canvas, and a single dynamic physics body.',
    outcome: 'The thing you are playing right now.',
    images: [
      {
        alt: 'ezrasong.github.io repository card',
        src: 'https://opengraph.githubassets.com/1/ezrasong/ezrasong.github.io',
      },
    ],
    liveUrl: 'https://ezrasong.github.io',
    repositoryUrl: 'https://github.com/ezrasong/ezrasong.github.io',
    buildingType: 'glass-store',
    district: 'gangnam',
    position: { x: 19, z: 68 },
    rotation: 0,
    facing: 'north',
    accent: '#bfe3ff',
    size: { width: 9, depth: 9, floors: 2 },
  },
  {
    id: 'lowcord',
    title: 'Lowcord',
    koreanTitle: '채팅 연구소',
    shortDescription: 'A lightweight, keyboard-driven realtime chat client.',
    longDescription:
      'A Discord-style chat client focused on speed: real-time messaging, channels, and presence indicators over WebSockets, wrapped in a minimal low-latency UI built for keyboard-driven navigation.',
    role: 'Solo project: protocol, server, and client.',
    technologies: ['TypeScript', 'Node.js', 'WebSockets'],
    year: '2025',
    challenge:
      'Fanning out messages and presence changes to every connected client without letting the UI thread hitch, using small frames, patch-style updates, and aggressive batching.',
    outcome:
      'A chat client where everything, from switching channels to sending and searching, happens from the keyboard with no perceptible latency.',
    images: [
      {
        alt: 'Lowcord repository card',
        src: 'https://opengraph.githubassets.com/1/ezrasong/lowcord',
      },
    ],
    repositoryUrl: 'https://github.com/ezrasong/lowcord',
    buildingType: 'tech-lab',
    district: 'gangnam',
    position: { x: 44, z: 68 },
    rotation: 0,
    facing: 'west',
    accent: '#c6b5ff',
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
    images: [{ alt: 'LeReplacer swapping faces on a live page in real time' }],
    buildingType: 'arcade',
    district: 'hongdae',
    position: { x: -43, z: -6 },
    rotation: 0,
    facing: 'east',
    accent: '#ff5d8f',
    size: { width: 10, depth: 8, floors: 2 },
  },
  {
    id: 'discord-bot',
    title: 'Discord Bot',
    koreanTitle: '봇 서버실',
    shortDescription: 'A multi-purpose Discord bot built for 24/7 uptime.',
    longDescription:
      'A multi-purpose Discord bot supporting moderation, custom commands, and server utilities, with persistent configuration storage and defensive error handling so one misbehaving command never takes the whole bot down.',
    role: 'Solo project: commands, persistence, and hosting.',
    technologies: ['Python', 'discord.py'],
    year: '2024',
    challenge:
      'Staying online around the clock: isolating command failures, persisting per-server config, and recovering cleanly from gateway disconnects.',
    outcome:
      'A bot that moderates and serves utilities continuously without hand-holding.',
    images: [
      {
        alt: 'Discord Bot repository card',
        src: 'https://opengraph.githubassets.com/1/ezrasong/Discord-Bot',
      },
    ],
    repositoryUrl: 'https://github.com/ezrasong/Discord-Bot',
    buildingType: 'server-facility',
    district: 'gangnam',
    position: { x: 44, z: 90 },
    rotation: 0,
    facing: 'north',
    accent: '#7dff8a',
    size: { width: 9, depth: 8, floors: 2 },
  },
];
