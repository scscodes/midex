import type { ParsedPhase } from './types';

export function safeParseJSON<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) ?? fallback;
  } catch {
    return fallback;
  }
}

export function parsePhases(phasesData: string | ParsedPhase[] | null | undefined): ParsedPhase[] {
  if (!phasesData) return [];
  if (Array.isArray(phasesData)) return phasesData; // Already parsed
  return safeParseJSON<ParsedPhase[]>(phasesData, []);
}

export function parseTags(tagsData: string | string[] | null | undefined): string[] {
  if (!tagsData) return [];
  if (Array.isArray(tagsData)) return tagsData; // Already parsed
  return safeParseJSON<string[]>(tagsData, []);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatDurationMs(ms: number | null): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
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
    case 'simple':
    case 'low':
      return 'bg-green-500/20 text-green-400';
    case 'moderate':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'high':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
}

export function getComplexityLabel(complexity: string | null | undefined): string {
  if (!complexity) return 'not set';
  return complexity.toLowerCase();
}

export function getStateColor(state: string): string {
  switch (state) {
    case 'running': return 'bg-blue-500/20 text-blue-400';
    case 'completed': return 'bg-green-500/20 text-green-400';
    case 'failed': return 'bg-red-500/20 text-red-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}
