import type { PetFirstVoice } from '../../../shared/agent-pet.js';
import petContract from '../../../shared/agent-pet.js';

const { petFirstVoice, petLocalDate } = petContract;

const SEEN_KEY = 'office-pet-first-voice-v1';
const seen = new Set<string>();
export interface VoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Only opaque IDs live in UI session storage; never names, speech or pet files. */
export function claimPetVoice(voice: PetFirstVoice, storage: VoiceStorage | null): boolean {
  if (seen.has(voice.id) || !storage) return false;
  try {
    const value: unknown = JSON.parse(storage.getItem(SEEN_KEY) ?? '[]');
    const ids = Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : [];
    if (ids.includes(voice.id)) {
      seen.add(voice.id);
      return false;
    }
    // Persist before automatic display so reload cannot replay it. If storage is
    // unavailable, the greeting remains readable on demand in the status panel.
    storage.setItem(SEEN_KEY, JSON.stringify([...ids.slice(-31), voice.id]));
    seen.add(voice.id);
    return true;
  } catch {
    return false;
  }
}

export function currentPetVoice(
  voice: PetFirstVoice | null,
  now: Date = new Date(),
): PetFirstVoice | null {
  return petFirstVoice(voice, petLocalDate(now));
}
