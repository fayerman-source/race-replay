import { deepClone, getDistanceAtTime } from "./utils.js";

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

    // 1) Global events first (time/distance based)
    const leaderDist = this.getLeaderDistance(raceTime);
    for (const event of this.globalEvents) {
      if (event.played) continue;

      const shouldTrigger =
        (event.type === "time" && raceTime >= event.trigger) ||
        (event.type === "distance" && leaderDist >= event.trigger);

      if (shouldTrigger) {
        event.played = true;
        const clip = this.audioClips[event.audioIdx];
        return {
          audioIdx: event.audioIdx,
          subjectId: clip.subjectId,
          text: clip.text,
        };
      }
    }

    // 2) Runner-specific checkpoint events
    let nextCheckpoint = null;
    let earliestDistance = Infinity;

    for (const [runnerId, checkpoints] of Object.entries(this.runnerCheckpoints)) {
      const runner = this.runners.find((r) => String(r.id) === String(runnerId));
      if (!runner) continue;

      const currentDist = getDistanceAtTime(runner.splits, raceTime);

      for (const checkpoint of checkpoints) {
        if (checkpoint.played) continue;

        if (currentDist >= checkpoint.distance && checkpoint.distance < earliestDistance) {
          earliestDistance = checkpoint.distance;
          nextCheckpoint = { runnerId, checkpoint };
        }
      }
    }

    if (nextCheckpoint) {
      nextCheckpoint.checkpoint.played = true;
      const clip = this.audioClips[nextCheckpoint.checkpoint.audioIdx];
      return {
        audioIdx: nextCheckpoint.checkpoint.audioIdx,
        subjectId: clip.subjectId ?? Number(nextCheckpoint.runnerId),
        text: clip.text,
      };
    }

    return null;
  }
}
