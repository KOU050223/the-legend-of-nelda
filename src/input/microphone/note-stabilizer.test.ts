import { describe, expect, it } from 'vitest';

import { midiToHz } from './note-classifier';
import { createNoteStabilizer, isAcceptableFrame } from './note-stabilizer';
import type { NoteEvent, PitchFrame, PitchInputConfig } from './types';
import { DEFAULT_PITCH_INPUT_CONFIG } from './types';

const CONFIG: PitchInputConfig = { ...DEFAULT_PITCH_INPUT_CONFIG, stableFrames: 3 };

/** 音名から、閾値を確実に満たすフレームを作る。 */
function frameOf(
  midi: number,
  timestampMs: number,
  overrides: Partial<PitchFrame> = {},
): PitchFrame {
  return {
    frequencyHz: midiToHz(midi),
    clarity: 0.98,
    rms: 0.2,
    timestampMs,
    ...overrides,
  };
}

const C5 = 72;
const E5 = 76;
const CS5 = 73;

/**
 * フレーム列を投入して、発生したイベントだけ集める。
 * null はフィルタで棄却されたフレーム / 無音を表す。
 */
function feed(
  stabilizer: ReturnType<typeof createNoteStabilizer>,
  frames: readonly (PitchFrame | null)[],
  startMs = 0,
  stepMs = 33,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  frames.forEach((frame, index) => {
    const event = stabilizer.update(frame, startMs + index * stepMs);
    if (event !== null) events.push(event);
  });
  return events;
}

describe('createNoteStabilizer', () => {
  it('同じ音が必要フレーム数続いたら鳴り始めたと判定する', () => {
    const stabilizer = createNoteStabilizer(CONFIG);

    const events = feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33), frameOf(C5, 66)]);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('note-on');
    expect(events[0]?.note.name).toBe('C');
    expect(events[0]?.note.octave).toBe(5);
  });

  it('必要フレーム数に満たないうちは鳴り始めたと判定しない', () => {
    const stabilizer = createNoteStabilizer(CONFIG);

    expect(feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33)])).toEqual([]);
    expect(stabilizer.getStableNote()).toBeNull();
  });

  it('確定後に同じ音が続いても重ねて通知しない', () => {
    const stabilizer = createNoteStabilizer(CONFIG);

    const events = feed(stabilizer, [
      frameOf(C5, 0),
      frameOf(C5, 33),
      frameOf(C5, 66),
      frameOf(C5, 99),
      frameOf(C5, 132),
    ]);

    expect(events).toHaveLength(1);
  });

  it('1フレームだけ隣の音へ揺れても切り替わらない', () => {
    const stabilizer = createNoteStabilizer(CONFIG);
    feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33), frameOf(C5, 66)]);

    // 吹いている途中のビブラートで C# が1フレーム混ざる状況。
    const events = feed(stabilizer, [frameOf(CS5, 99), frameOf(C5, 132), frameOf(C5, 165)], 99);

    expect(events).toEqual([]);
    expect(stabilizer.getStableNote()?.name).toBe('C');
  });

  it('別の音が安定したら持ち替えたと判定する', () => {
    const stabilizer = createNoteStabilizer(CONFIG);
    feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33), frameOf(C5, 66)]);

    const events = feed(stabilizer, [frameOf(E5, 99), frameOf(E5, 132), frameOf(E5, 165)], 99);

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.type).toBe('note-change');
    if (event?.type !== 'note-change') return;
    expect(event.previous.name).toBe('C');
    expect(event.note.name).toBe('E');
  });

  it('短いピッチ欠落では鳴り終わったと判定しない', () => {
    const stabilizer = createNoteStabilizer({ ...CONFIG, noteOffDelayMs: 120 });
    feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33), frameOf(C5, 66)]);

    // 息継ぎ程度の欠落。猶予（120ms）より短い。
    const events = [stabilizer.update(null, 99), stabilizer.update(null, 132)];

    expect(events.filter((event) => event !== null)).toEqual([]);
    expect(stabilizer.getStableNote()?.name).toBe('C');
  });

  it('無音が猶予を超えたら鳴り終わったと判定する', () => {
    const stabilizer = createNoteStabilizer({ ...CONFIG, noteOffDelayMs: 120 });
    feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33), frameOf(C5, 66)]);

    expect(stabilizer.update(null, 100)).toBeNull();
    const event = stabilizer.update(null, 200);

    expect(event?.type).toBe('note-off');
    expect(event?.note.name).toBe('C');
    expect(stabilizer.getStableNote()).toBeNull();
  });

  it('鳴り終わったと判定するのは一度だけ', () => {
    const stabilizer = createNoteStabilizer({ ...CONFIG, noteOffDelayMs: 120 });
    feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33), frameOf(C5, 66)]);
    stabilizer.update(null, 500);

    expect(stabilizer.update(null, 1000)).toBeNull();
  });

  it('一度も鳴っていなければ無音でも何も通知しない', () => {
    const stabilizer = createNoteStabilizer(CONFIG);

    expect(feed(stabilizer, [null, null, null])).toEqual([]);
  });

  it('鳴り終わったあと吹き直せば再び鳴り始めたと判定する', () => {
    const stabilizer = createNoteStabilizer({ ...CONFIG, noteOffDelayMs: 120 });
    feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33), frameOf(C5, 66)]);
    stabilizer.update(null, 500);

    const events = feed(stabilizer, [frameOf(C5, 600), frameOf(C5, 633), frameOf(C5, 666)], 600);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('note-on');
  });

  // 基盤はオクターブを保持し、どのオクターブを同じ音として扱うかはゲーム側が決める。
  // ここで C5 と C6 を同一視すると、その選択肢を潰してしまう。(Issue #43)
  it('オクターブ違いは別の音として持ち替えを通知する', () => {
    const stabilizer = createNoteStabilizer(CONFIG);
    feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33), frameOf(C5, 66)]);

    const C6 = C5 + 12;
    const events = feed(stabilizer, [frameOf(C6, 99), frameOf(C6, 132), frameOf(C6, 165)], 99);

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.type).toBe('note-change');
    if (event?.type !== 'note-change') return;
    expect(event.previous.octave).toBe(5);
    expect(event.note.octave).toBe(6);
    expect(event.note.name).toBe('C');
  });

  it('リセット後は前の音を引きずらない', () => {
    const stabilizer = createNoteStabilizer(CONFIG);
    feed(stabilizer, [frameOf(C5, 0), frameOf(C5, 33), frameOf(C5, 66)]);

    stabilizer.reset();

    expect(stabilizer.getStableNote()).toBeNull();
    expect(stabilizer.update(null, 1000)).toBeNull();
  });

  it('揺れている間は候補が積み上がらず確定しない', () => {
    const stabilizer = createNoteStabilizer(CONFIG);

    // C と C# が交互に出る状態。どちらも3連続しない。
    const events = feed(stabilizer, [
      frameOf(C5, 0),
      frameOf(CS5, 33),
      frameOf(C5, 66),
      frameOf(CS5, 99),
    ]);

    expect(events).toEqual([]);
  });
});

describe('isAcceptableFrame', () => {
  it('閾値をすべて満たすフレームは採用する', () => {
    expect(isAcceptableFrame(frameOf(C5, 0), CONFIG)).toBe(true);
  });

  it('音量が小さすぎるフレームは無音として扱う', () => {
    expect(isAcceptableFrame(frameOf(C5, 0, { rms: 0.001 }), CONFIG)).toBe(false);
  });

  it('ピッチがはっきりしないフレームは採用しない', () => {
    expect(isAcceptableFrame(frameOf(C5, 0, { clarity: 0.5 }), CONFIG)).toBe(false);
  });

  it('想定した音域の外は採用しない', () => {
    expect(isAcceptableFrame(frameOf(C5, 0, { frequencyHz: 100 }), CONFIG)).toBe(false);
    expect(isAcceptableFrame(frameOf(C5, 0, { frequencyHz: 5000 }), CONFIG)).toBe(false);
  });
});
