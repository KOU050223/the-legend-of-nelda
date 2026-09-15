import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

import { MotionPreviewModel } from '@/rendering/character/MotionPreviewModel';
import {
  MOTION_CONDITIONS,
  MOTION_MODELS,
  MOTION_MODEL_IDS,
  type MotionCondition,
  type MotionModelId,
} from '@/rendering/character/motion-manifest';
import { initialDraft, nextUnusedCondition, saveDraft } from './motion-draft';
import { isValidClipName, isValidFbxName, uploadMotion } from './motion-upload';
import styles from './MotionDebugPage.module.css';

/** 条件の日本語表示。ゲーム側の状態名との対応は docs/motion-manifest.md。 */
const CONDITION_LABELS: Readonly<Record<MotionCondition, string>> = {
  attacking: '攻撃中',
  fallingAsleep: '寝落ちかけ',
  asleep: '就寝',
};

/**
 * `?debug=motion` で開く、モーション確認と割り当ての画面。
 *
 * これまでボス専用だった `?debug=hori` を、マニフェストに載る全モデルへ
 * 広げたもの。ゲーム本体の状態には触れない。
 *
 * ここでできることは2つ。GLBに入っているクリップを選んで見た目を確かめる
 * ことと、「どの状態でどのクリップを再生するか」を組み立てることの2つ。
 * 後者はブラウザからリポジトリへは書けないので、JSONを吐いて
 * `assets/motion-manifest.json` へ貼り戻す。
 */
export function MotionDebugPage(): React.JSX.Element {
  const [modelId, setModelId] = useState<MotionModelId>(MOTION_MODEL_IDS[0] ?? 'hori-daisuke');
  const model = MOTION_MODELS[modelId];

  const [clip, setClip] = useState<string>(model.defaultClip);
  const [playToken, setPlayToken] = useState(0);
  const [draft, setDraft] = useState(initialDraft);
  const [status, setStatus] = useState<string | null>(null);

  /** 取り込むFBXと、付けるクリップ名。 */
  const [file, setFile] = useState<File | null>(null);
  const [newClip, setNewClip] = useState('');
  const [newLoop, setNewLoop] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState<string | null>(null);

  const clipNames = Object.keys(model.clips);
  /** ビルドの口が無いモデルは取り込めない。走らせるスクリプトが無い。 */
  const canUpload = model.rig === 'mixamo';
  const rules = draft[modelId];
  const loops = model.clips[clip]?.loop ?? true;

  /** ループしないクリップは `key` を変えて作り直すことで頭から再生し直す。 */
  const replay = (): void => setPlayToken((value) => value + 1);

  const selectModel = (next: MotionModelId): void => {
    setModelId(next);
    setClip(MOTION_MODELS[next].defaultClip);
    replay();
  };

  const selectClip = (next: string): void => {
    setClip(next);
    replay();
  };

  const updateRules = (next: readonly { when: MotionCondition; clip: string }[]): void => {
    setDraft({ ...draft, [modelId]: next });
    setStatus(null);
  };

  /**
   * 条件を選び直す。`select` の値は `string` で来るので、マニフェストが
   * 知っている条件かをここで確かめてから入れる。
   */
  const changeCondition = (index: number, value: string): void => {
    const when = MOTION_CONDITIONS.find((condition) => condition === value);
    if (when === undefined) return;

    updateRules(rules.map((item, i) => (i === index ? { ...item, when } : item)));
  };

  const addRule = (): void => {
    const when = nextUnusedCondition(rules);
    if (when === null) return;
    updateRules([...rules, { when, clip: model.defaultClip }]);
  };

  /**
   * FBXを取り込んでGLBを作り直す。
   *
   * 失敗したときは Blender の出力をそのまま画面へ出す。ボーン名が合わない
   * (With Skin で落とした等) 場合、Blender が食い違ったボーン名を並べて
   * 教えてくれるので、それが一番の手がかりになる。
   */
  const build = async (): Promise<void> => {
    if (file === null) return;

    setBuilding(true);
    setBuildLog(null);
    setStatus(null);

    const result = await uploadMotion(modelId, newClip.trim(), newLoop, file);
    setBuilding(false);
    setBuildLog(result.log === '' ? null : result.log);

    if (result.ok) {
      setStatus(`クリップ ${result.clip} を取り込みました。ページを再読み込みすると選べます。`);
      setFile(null);
      setNewClip('');
    } else {
      setStatus(`取り込めませんでした: ${result.message}`);
    }
  };

  const save = async (): Promise<void> => {
    setStatus('保存中...');

    const error = await saveDraft(draft);
    setStatus(
      error === null
        ? 'assets/motion-manifest.json へ保存しました。差分を確認してコミットしてください。'
        : `保存できませんでした: ${error}`,
    );
  };

  return (
    <main className={styles.page}>
      <Canvas
        shadows
        aria-label={`${model.label}の3Dプレビュー`}
        camera={{ position: [0, 1.7, 4.5], fov: 45 }}
      >
        <color attach="background" args={['#14121f']} />

        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 4]} intensity={1.6} castShadow />

        <Suspense fallback={null}>
          <MotionPreviewModel key={`${modelId}-${playToken}`} model={model} clip={clip} />
        </Suspense>

        <OrbitControls target={[0, 1, 0]} />
      </Canvas>

      <section className={styles.panel} aria-labelledby="motion-debug-title">
        <p className={styles.eyebrow}>Motion / Debug</p>
        <h1 id="motion-debug-title">モーション確認と割り当て</h1>
        <p>
          モデルとクリップを切り替えて確認できます。ドラッグで視点を回し、 ホイールで拡大できます。
        </p>

        <fieldset className={styles.section} aria-label="モデル選択">
          <legend>モデル</legend>
          <div className={styles.motions}>
            {MOTION_MODEL_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={styles.motion}
                aria-pressed={id === modelId}
                onClick={() => selectModel(id)}
              >
                {MOTION_MODELS[id].label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.section} aria-label="クリップ選択">
          <legend>クリップ</legend>
          <div className={styles.motions}>
            {clipNames.map((name) => (
              <button
                key={name}
                type="button"
                className={styles.motion}
                aria-pressed={name === clip}
                onClick={() => selectClip(name)}
              >
                {model.clips[name]?.label ?? name}
              </button>
            ))}
          </div>
          <button type="button" className={styles.replay} onClick={replay}>
            {loops ? '最初から再生' : 'もう一度再生'}
          </button>
        </fieldset>

        <fieldset className={styles.section} aria-label="状態への割り当て">
          <legend>状態への割り当て</legend>

          {model.rig === 'custom' && (
            <p className={styles.note}>
              このモデルは独自リグ（mixamorigボーンを持たない）のため、
              共有モーションFBXを追加できません。クリップを増やすには Blender
              でのリグ作業が必要です。
            </p>
          )}

          <ul className={styles.rules}>
            {rules.map((rule, index) => (
              <li key={rule.when} className={styles.rule}>
                <select
                  aria-label="条件"
                  value={rule.when}
                  onChange={(event) => changeCondition(index, event.target.value)}
                >
                  {MOTION_CONDITIONS.map((condition) => (
                    <option
                      key={condition}
                      value={condition}
                      // 同じ条件を2行置くと、上の行しか当たらず下は死ぬ。
                      // 自分の行の値は残しつつ、他の行が使っている条件は選べなくする。
                      disabled={condition !== rule.when && rules.some((r) => r.when === condition)}
                    >
                      {CONDITION_LABELS[condition]}
                    </option>
                  ))}
                </select>

                <span className={styles.arrow}>→</span>

                <select
                  aria-label="クリップ"
                  value={rule.clip}
                  onChange={(event) =>
                    updateRules(
                      rules.map((item, i) =>
                        i === index ? { ...item, clip: event.target.value } : item,
                      ),
                    )
                  }
                >
                  {clipNames.map((name) => (
                    <option key={name} value={name}>
                      {model.clips[name]?.label ?? name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`${CONDITION_LABELS[rule.when]}の行を削除`}
                  onClick={() => updateRules(rules.filter((_, i) => i !== index))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <p className={styles.note}>
            上から順に、最初に当てはまった行のクリップを再生します。 どれにも当てはまらなければ「
            {model.clips[model.defaultClip]?.label ?? model.defaultClip}
            」に戻ります。
          </p>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={addRule}
              disabled={nextUnusedCondition(rules) === null}
            >
              行を追加
            </button>
            <button type="button" className={styles.replay} onClick={() => void save()}>
              保存
            </button>
          </div>

          {status !== null && <output className={styles.status}>{status}</output>}
        </fieldset>

        {canUpload && (
          <fieldset className={styles.section} aria-label="モーションの取り込み">
            <legend>モーションを追加</legend>

            <p className={styles.note}>
              Mixamo から <strong>Without Skin</strong> で落としたFBXを選ぶと、
              置き場所への配置・マニフェストへの登録・Blenderでのビルドまで通します。
              ビルドを挟むので数十秒かかります。
            </p>

            <input
              type="file"
              accept=".fbx"
              aria-label="モーションFBX"
              className={styles.file}
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                // クリップ名は拡張子を落としたファイル名を初期値にする。
                if (chosen !== null && newClip === '') {
                  setNewClip(
                    chosen.name
                      .replace(/\.fbx$/i, '')
                      .toLowerCase()
                      .replaceAll(' ', '-'),
                  );
                }
              }}
            />

            <label className={styles.field}>
              クリップ名
              <input
                type="text"
                value={newClip}
                onChange={(event) => setNewClip(event.target.value)}
                placeholder="walk"
              />
            </label>

            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={newLoop}
                onChange={(event) => setNewLoop(event.target.checked)}
              />
              ループ再生する（歩行などは on、登場演出などは off）
            </label>

            <button
              type="button"
              className={styles.replay}
              disabled={
                building || file === null || !isValidClipName(newClip) || newClip in model.clips
              }
              onClick={() => void build()}
            >
              {building ? 'ビルド中...' : '取り込んでビルド'}
            </button>

            {file !== null && !isValidFbxName(file.name) && (
              <p className={styles.note}>.fbx のファイルを選んでください。</p>
            )}
            {newClip in model.clips && (
              <p className={styles.note}>クリップ名「{newClip}」はすでにあります。</p>
            )}

            {buildLog !== null && (
              <pre className={styles.log} aria-label="ビルドの出力">
                {buildLog}
              </pre>
            )}
          </fieldset>
        )}
      </section>
    </main>
  );
}
