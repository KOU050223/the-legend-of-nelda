import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useOraStatusStore } from '@/store/ora-status-store';

import { OraStatusHud } from './OraStatusHud';

beforeEach(() => {
  useOraStatusStore.getState().reset();
});

describe('OraStatusHud', () => {
  it('Ora入力が非アクティブなら何も描画しない', () => {
    const { container } = render(<OraStatusHud />);

    expect(container).toBeEmptyDOMElement();
  });

  it('未完了のCalibration項目だけを画面案内として表示する', () => {
    useOraStatusStore.getState().setActive(true);
    useOraStatusStore.getState().setCalibration({
      handComplete: false,
      voiceComplete: true,
      progress: 0.5,
    });

    render(<OraStatusHud />);

    expect(screen.getByText('両手を画面下寄りの自然な位置に構えてください')).toBeInTheDocument();
    expect(screen.queryByText('「オラ！」と一度声に出してください')).not.toBeInTheDocument();
    expect(screen.getByText('AIR JOYSTICK')).toBeInTheDocument();
  });

  it('Ora入力エラーを画面上に表示する', () => {
    useOraStatusStore.getState().setActive(true);
    useOraStatusStore.getState().setStatus({
      phase: 'error',
      speechRecognition: 'unavailable',
      reason: 'unsupported',
    });

    render(<OraStatusHud />);

    expect(
      screen.getByText('オラ入力を開始できません。カメラ・マイクの状態を確認してください。'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        '音声認識に対応していないため「オラ」ATTACKは使えません（手の動きでの移動・ORA_ACTIONは引き続き使えます）',
      ),
    ).not.toBeInTheDocument();
  });

  it('SpeechRecognition非対応でも、他のオラ入力が使えることを画面上に表示する', () => {
    useOraStatusStore.getState().setActive(true);
    useOraStatusStore.getState().setStatus({
      phase: 'active',
      speechRecognition: 'unavailable',
      reason: 'unsupported',
    });

    render(<OraStatusHud />);

    expect(
      screen.getByText(
        '音声認識に対応していないため「オラ」ATTACKは使えません（手の動きでの移動・ORA_ACTIONは引き続き使えます）',
      ),
    ).toBeInTheDocument();
  });

  it('SpeechRecognitionの致命的エラーでも、他のオラ入力が使えることを画面上に表示する', () => {
    useOraStatusStore.getState().setActive(true);
    useOraStatusStore.getState().setStatus({
      phase: 'active',
      speechRecognition: 'error',
      reason: 'error',
      errorMessage: 'not-allowed',
    });

    render(<OraStatusHud />);

    expect(
      screen.getByText(
        '音声認識でエラーが発生したため「オラ」ATTACKは使えません（手の動きでの移動・ORA_ACTIONは引き続き使えます）',
      ),
    ).toBeInTheDocument();
  });
});
