export type RobotState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type RobotTheme = 'cyan' | 'purple' | 'amber' | 'emerald';

export interface ChatMessageImage {
  dataUrl: string;
  mimeType: string;
  name?: string;
  size?: number;
  base64?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  domain?: string;
  image?: ChatMessageImage;
}

export interface DomainCategory {
  id: string;
  label: string;
  iconName: string;
  description: string;
  color: string;
  sampleQuestions: string[];
}
