import type { ParsedPhase } from './types';

export function safeParseJSON<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) ?? fallback;
  } catch {
    return fallback;
  }
}

export function parsePhases(phasesJson: string | null | undefined): ParsedPhase[] {
  return safeParseJSON<ParsedPhase[]>(phasesJson, []);
}

export function parseTags(tagsJson: string | null | undefined): string[] {
  return safeParseJSON<string[]>(tagsJson, []);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function getComplexityColor(complexity: string | null | undefined): string {
  switch (complexity?.toLowerCase()) {
    case 'low': return 'bg-green-500/20 text-green-400';
    case 'moderate': return 'bg-yellow-500/20 text-yellow-400';
    case 'high': return 'bg-red-500/20 text-red-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

export function getStateColor(state: string): string {
  switch (state) {
    case 'running': return 'bg-blue-500/20 text-blue-400';
    case 'completed': return 'bg-green-500/20 text-green-400';
    case 'failed': return 'bg-red-500/20 text-red-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}
