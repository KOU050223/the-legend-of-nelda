"""assets/motion-manifest.json をビルドスクリプトから読むための薄いヘルパ。

モーション定義はマニフェスト1本に集約してある。ここを読むことで、Blender側の
`MOTIONS` とReact側のクリップ一覧が別々に育ってズレることを防ぐ。
モーションを増やすときに触るのはマニフェストだけでよい。
"""

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MANIFEST = REPO / 'assets' / 'motion-manifest.json'


def load_model(model_id: str) -> dict:
    """マニフェストから1モデル分の定義を取り出す。"""
    models = json.loads(MANIFEST.read_text(encoding='utf-8'))['models']
    if model_id not in models:
        raise KeyError(f'{model_id!r} not in {MANIFEST.name} (have: {sorted(models)})')

    model = models[model_id]
    if model.get('build') is None:
        raise RuntimeError(f'{model_id!r} has no build section; it is not built by a script')

    # マニフェストのクリップ一覧と、ビルドで実際に作るクリップが食い違うと、
    # GLBに無いクリップをReact側が名前で引きに行って静止する。ここで弾く。
    produced = {model['build']['baseClip'], *model['build']['sources'].values()}
    declared = set(model['clips'])
    if produced != declared:
        raise RuntimeError(
            f'{model_id!r}: build produces {sorted(produced)}'
            f' but clips declares {sorted(declared)}'
        )

    return model
