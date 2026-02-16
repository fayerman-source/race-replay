import { deepClone, getDistanceAtTime, getTimeAtDistance } from "./utils.js";

export class CommentaryEngine {
  constructor({ runners, audioClips, runnerCheckpointTemplate, globalEventsTemplate }) {
    this.runners = runners;
    this.audioClips = audioClips;
    this.runnerCheckpointTemplate = runnerCheckpointTemplate;
    this.globalEventsTemplate = globalEventsTemplate;
    this.reset();
  }

  reset() {
    this.runnerCheckpoints = Object.fromEntries(
      Object.entries(deepClone(this.runnerCheckpointTemplate)).map(([runnerId, checkpoints]) => [
        runnerId,
        checkpoints.map((cp) => ({ ...cp, played: false })),
      ])
    );

    this.globalEvents = deepClone(this.globalEventsTemplate).map((event) => ({ ...event, played: false }));
  }

  getLeaderDistance(raceTime) {
    let maxDist = 0;
    this.runners.forEach((runner) => {
      const dist = getDistanceAtTime(runner.splits, raceTime);
      if (dist > maxDist) maxDist = dist;
    });
    return maxDist;
  }

  nextEvent({ raceTime, isAudioPlaying }) {
    if (isAudioPlaying) return null;

    const dueEvents = [];
    const leaderDist = this.getLeaderDistance(raceTime);

    // 1) Collect due GLOBAL events
    for (const event of this.globalEvents) {
      if (event.played) continue;

      const shouldTrigger =
        (event.type === "time" && raceTime >= event.trigger) ||
        (event.type === "distance" && leaderDist >= event.trigger);

      if (!shouldTrigger) continue;

      // For ordering, assign a deterministic dueTime
      const dueTime =
        event.type === "time"
          ? event.trigger
          : Math.min(...this.runners.map((runner) => getTimeAtDistance(runner.splits, event.trigger)));

      dueEvents.push({
        kind: "global",
        ref: event,
        dueTime,
        audioIdx: event.audioIdx,
      });
    }

    // 2) Collect due RUNNER checkpoint events
    for (const [runnerId, checkpoints] of Object.entries(this.runnerCheckpoints)) {
      const runner = this.runners.find((r) => String(r.id) === String(runnerId));
      if (!runner) continue;

      const currentDist = getDistanceAtTime(runner.splits, raceTime);

      for (const checkpoint of checkpoints) {
        if (checkpoint.played) continue;
        if (currentDist < checkpoint.distance) continue;

        dueEvents.push({
          kind: "checkpoint",
          ref: checkpoint,
          runnerId: Number(runnerId),
          dueTime: getTimeAtDistance(runner.splits, checkpoint.distance),
          audioIdx: checkpoint.audioIdx,
        });
      }
    }

    if (!dueEvents.length) return null;

    // Oldest-due event wins (chronological order), then lower audioIdx as tiebreaker
    dueEvents.sort((a, b) => a.dueTime - b.dueTime || a.audioIdx - b.audioIdx);
    const selected = dueEvents[0];

    selected.ref.played = true;
    const clip = this.audioClips[selected.audioIdx];

    return {
      audioIdx: selected.audioIdx,
      subjectId: clip.subjectId ?? selected.runnerId ?? null,
      text: clip.text,
    };
  }
}
