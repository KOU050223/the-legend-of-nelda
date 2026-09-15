import {
  isSelectable,
  LOCAL_PLAYER_IDS,
  LOCAL_PLAYER_LABELS,
  useLocalPlayerStore,
} from '@/store/local-player-store';

import styles from './PlayerSwitch.module.css';

/**
 * 操作キャラを切り替えるパネル。(Issue #106)
 *
 * 一人でのデバッグ時に、Pay大輔だけが見られる情報やオラ大輔の専用アクションを
 * 確認するための入口。戦闘は作り直さずに切り替える (再マウントするとボスHPも
 * 眠気も巻き戻り、確認したかった場面まで戻れない)。
 *
 * 切り替えるのは「キーボードとカメラがどの1人へ繋がるか」だけで、入力方式は
 * 切り替えない。オラ大輔のARマーカーやPay大輔のマイクへ連動させると別物に
 * なるので、ここでは常にキーボードが選択中のキャラを動かす。
 */
export function PlayerSwitch(): React.JSX.Element {
  const localPlayerId = useLocalPlayerStore((state) => state.localPlayerId);
  const setLocalPlayerId = useLocalPlayerStore((state) => state.setLocalPlayerId);
  const statuses = useLocalPlayerStore((state) => state.statuses);

  return (
    <section className={styles.panel} aria-label="操作キャラ切り替え">
      <h2 className={styles.title}>Player</h2>

      {LOCAL_PLAYER_IDS.map((id) => {
        // 寝ているキャラへ切り替えても操作が効かず、壊れたように見える。
        // 選べないことを先に出す。
        const selectable = isSelectable(statuses, id);

        return (
          <label key={id} className={styles.row}>
            <input
              type="radio"
              name="local-player"
              value={id}
              checked={localPlayerId === id}
              disabled={!selectable}
              onChange={() => setLocalPlayerId(id)}
            />
            <span className={styles.label}>{LOCAL_PLAYER_LABELS[id]}</span>
            {!selectable && <span className={styles.note}>操作不可</span>}
          </label>
        );
      })}
    </section>
  );
}
