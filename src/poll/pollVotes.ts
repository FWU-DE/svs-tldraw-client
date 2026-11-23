// Votes of all polls on a board, kept in their own Y.Map next to the tldraw
// records: key `<shapeId>|<userId>`, value = index of the chosen option.
//
// One entry per person and poll means concurrent votes from a whole class
// merge without conflicts (a vote inside the shape record would be lost when
// two people vote at the same moment, because a record is replaced as a
// whole). The SVS user id makes it one vote per person, on any device.
import { useSyncExternalStore } from "react";
import * as Y from "yjs";

export const VOTES_MAP = "svs_poll_votes";

let votes: Y.Map<number> | null = null;
let userId = "";
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((fn) => fn());
}

export function attachPollVotes(doc: Y.Doc, currentUserId: string): () => void {
  votes = doc.getMap<number>(VOTES_MAP);
  userId = currentUserId;
  votes.observe(notify);
  notify();
  return () => {
    votes?.unobserve(notify);
    votes = null;
  };
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function castVote(shapeId: string, option: number) {
  votes?.set(`${shapeId}|${userId}`, option);
}

export function withdrawVote(shapeId: string) {
  votes?.delete(`${shapeId}|${userId}`);
}

export type PollTally = {
  counts: number[];
  total: number;
  mine: number | undefined;
};

function tally(shapeId: string, optionCount: number): PollTally {
  const counts = new Array(optionCount).fill(0);
  let mine: number | undefined;
  votes?.forEach((option, key) => {
    const [id, voter] = key.split("|");
    if (id !== shapeId || option < 0 || option >= optionCount) return;
    counts[option]++;
    if (voter === userId) mine = option;
  });
  return { counts, total: counts.reduce((a, b) => a + b, 0), mine };
}

const cache = new Map<string, { version: number; value: PollTally }>();

export function usePollTally(shapeId: string, optionCount: number): PollTally {
  return useSyncExternalStore(subscribe, () => {
    const key = `${shapeId}:${optionCount}`;
    const hit = cache.get(key);
    if (hit && hit.version === version) return hit.value;
    const value = tally(shapeId, optionCount);
    cache.set(key, { version, value });
    return value;
  });
}

export function currentUserId() {
  return userId;
}
