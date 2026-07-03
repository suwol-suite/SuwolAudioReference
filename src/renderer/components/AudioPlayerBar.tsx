import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AssetListItem } from "../../shared/library-types";
import { calculateLoudnessMatchGain } from "../audio-playback";
import { useI18n } from "../i18n/useI18n";

export type PlayerCommandType =
  | "play"
  | "previewPlay"
  | "toggle"
  | "stop"
  | "toggleLoop"
  | "setPointA"
  | "setPointB";

export interface PlayerCommand {
  key: number;
  type: PlayerCommandType;
  assetId?: string;
}

export interface PlayerSnapshot {
  assetId: string | null;
  currentTimeMs: number;
  durationMs: number;
  playing: boolean;
  loop: boolean;
  pointA: number | null;
  pointB: number | null;
}

interface AudioPlayerBarProps {
  asset: AssetListItem | null;
  command: PlayerCommand | null;
  loudnessMatch: boolean;
  loudnessReferenceAsset: AssetListItem | null;
  stopPreviousOnSelectionChange: boolean;
  onPlaybackStateChange: (snapshot: PlayerSnapshot) => void;
  onAssetRefresh: () => Promise<void>;
}

export function AudioPlayerBar({
  asset,
  command,
  loudnessMatch,
  loudnessReferenceAsset,
  stopPreviousOnSelectionChange,
  onPlaybackStateChange,
  onAssetRefresh,
}: AudioPlayerBarProps): JSX.Element {
  const { t, format } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordedPlayKeys = useRef<Set<string>>(new Set());
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [loop, setLoop] = useState(false);
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);

  const gain = useMemo(
    () => calculateLoudnessMatchGain(asset, loudnessReferenceAsset, loudnessMatch),
    [asset, loudnessMatch, loudnessReferenceAsset],
  );

  useEffect(() => {
    let canceled = false;
    const commandWantsPlay =
      command !== null && command.assetId === asset?.id && (command.type === "play" || command.type === "previewPlay");

    async function load(): Promise<void> {
      if (stopPreviousOnSelectionChange) {
        audioRef.current?.pause();
      }
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setPlaybackUrl(null);
      setPointA(null);
      setPointB(null);
      if (!asset?.playable) {
        return;
      }

      const url = await window.suwolAudio.audio.getPlaybackUrl(asset.id);
      if (canceled) {
        return;
      }
      setPlaybackUrl(url);
      if (url && commandWantsPlay) {
        requestAnimationFrame(() => {
          void play();
        });
      }
    }

    void load();
    return () => {
      canceled = true;
    };
  }, [asset?.id, asset?.playable]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volume * gain.gainLinear));
      audioRef.current.loop = loop && pointA === null && pointB === null;
    }
  }, [gain.gainLinear, loop, pointA, pointB, volume]);

  useEffect(() => {
    onPlaybackStateChange({
      assetId: asset?.id ?? null,
      currentTimeMs: currentTime * 1000,
      durationMs: duration * 1000,
      playing,
      loop,
      pointA: pointA === null ? null : pointA * 1000,
      pointB: pointB === null ? null : pointB * 1000,
    });
  }, [asset?.id, currentTime, duration, loop, onPlaybackStateChange, playing, pointA, pointB]);

  useEffect(() => {
    if (!command || (command.assetId && command.assetId !== asset?.id)) {
      return;
    }

    if (command.type === "play" || command.type === "previewPlay") {
      void play();
    }
    if (command.type === "toggle") {
      void togglePlay();
    }
    if (command.type === "stop") {
      stop();
    }
    if (command.type === "toggleLoop") {
      setLoop((value) => !value);
    }
    if (command.type === "setPointA") {
      setPointA(currentTime);
      setLoop(true);
    }
    if (command.type === "setPointB") {
      setPointB(currentTime);
      setLoop(true);
    }
  }, [command?.key]);

  async function play(): Promise<void> {
    if (!audioRef.current || !audioRef.current.src) {
      return;
    }
    await audioRef.current.play();
    setPlaying(true);
  }

  async function togglePlay(): Promise<void> {
    if (!audioRef.current || !audioRef.current.src) {
      return;
    }
    if (audioRef.current.paused) {
      await play();
    } else {
      audioRef.current.pause();
      setPlaying(false);
    }
  }

  function stop(): void {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    setPlaying(false);
  }

  function onTimeUpdate(): void {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (loop && pointA !== null && pointB !== null && audio.currentTime >= pointB) {
      audio.currentTime = pointA;
    }
    setCurrentTime(audio.currentTime);
  }

  async function recordPlaybackStart(): Promise<void> {
    if (!asset) {
      return;
    }
    const key = `${asset.id}:${Math.floor(Date.now() / 2000)}`;
    if (recordedPlayKeys.current.has(key)) {
      return;
    }
    recordedPlayKeys.current.add(key);
    await window.suwolAudio.playback.recordPlayed(asset.id);
    await onAssetRefresh();
  }

  async function markSupported(supported: boolean): Promise<void> {
    if (!asset) {
      return;
    }
    await window.suwolAudio.playback.updateSupportState(asset.id, {
      supported,
      errorCode: supported ? null : "HTML_AUDIO_ERROR",
    });
    await onAssetRefresh();
  }

  return (
    <footer className="audio-player-bar">
      <audio
        ref={audioRef}
        src={playbackUrl ?? undefined}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          void markSupported(true);
        }}
        onTimeUpdate={onTimeUpdate}
        onPause={() => setPlaying(false)}
        onPlay={() => {
          setPlaying(true);
          void recordPlaybackStart();
        }}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          void markSupported(false);
        }}
      />
      <div className="player-title">
        <strong>{asset ? asset.title || asset.fileName : t("player.none")}</strong>
        <span>{asset && !asset.playable ? t("player.unsupported") : playbackUrl ? t("player.ready") : t("player.waiting")}</span>
      </div>
      <button
        className="icon-button"
        type="button"
        onClick={togglePlay}
        disabled={!playbackUrl}
        title={`${playing ? t("player.pause") : t("player.play")} (Space)`}
        aria-label={playing ? t("player.pause") : t("player.play")}
      >
        {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
      </button>
      <button className="icon-button" type="button" onClick={stop} disabled={!playbackUrl} title={`${t("player.stop")} (Esc)`} aria-label={t("player.stop")}>
        <Square size={15} aria-hidden="true" />
      </button>
      <span className="time-label">{format.duration(currentTime * 1000)}</span>
      <input
        className="seek-slider"
        aria-label={t("player.position")}
        type="range"
        min={0}
        max={Math.max(duration, 0.01)}
        step={0.01}
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (audioRef.current) {
            audioRef.current.currentTime = next;
          }
          setCurrentTime(next);
        }}
        disabled={!playbackUrl}
      />
      <span className="time-label">{format.duration(duration * 1000)}</span>
      <input
        className="volume-slider"
        aria-label={t("player.volume")}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
      />
      <button className={loop ? "icon-button is-on" : "icon-button"} type="button" onClick={() => setLoop(!loop)} title={`${t("player.loop")} (L)`} aria-label={t("player.loop")}>
        <RotateCcw size={16} aria-hidden="true" />
      </button>
      <button className="secondary-button compact" type="button" onClick={() => setPointA(currentTime)} disabled={!playbackUrl} title={`${t("player.pointA")} (A)`}>
        A
      </button>
      <button className="secondary-button compact" type="button" onClick={() => setPointB(currentTime)} disabled={!playbackUrl} title={`${t("player.pointB")} (B)`}>
        B
      </button>
      <button
        className="secondary-button compact"
        type="button"
        onClick={() => {
          setPointA(null);
          setPointB(null);
        }}
      >
        {t("player.clearAB")}
      </button>
      {loudnessMatch ? (
        <span className="gain-label" title={gain.limitedByPeak ? t("compare.gainLimited") : t("compare.loudnessMatch")}>
          {gain.gainDb >= 0 ? "+" : ""}
          {gain.gainDb.toFixed(1)} dB
        </span>
      ) : null}
    </footer>
  );
}
