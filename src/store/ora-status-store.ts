import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type {
  OraCalibrationState,
  OraHandTrackingFrame,
  OraProductionInputStatus,
  OraVoiceCandidateInfo,
} from '@/input/ora/ora-production-input';

export interface OraStatusState {
  active: boolean;
  calibration: OraCalibrationState | null;
  status: OraProductionInputStatus | null;
  voiceCandidate: OraVoiceCandidateInfo | null;
  handTrackingFrame: OraHandTrackingFrame | null;
  setActive: (active: boolean) => void;
  setCalibration: (calibration: OraCalibrationState | null) => void;
  setStatus: (status: OraProductionInputStatus | null) => void;
  setVoiceCandidate: (voiceCandidate: OraVoiceCandidateInfo | null) => void;
  setHandTrackingFrame: (handTrackingFrame: OraHandTrackingFrame | null) => void;
  reset: () => void;
}

const initialState = {
  active: false,
  calibration: null,
  status: null,
  voiceCandidate: null,
  handTrackingFrame: null,
} as const;

export const useOraStatusStore = create<OraStatusState>()(
  subscribeWithSelector((set) => ({
    ...initialState,
    setActive: (active) => set({ active }),
    setCalibration: (calibration) => set({ calibration }),
    setStatus: (status) => set({ status }),
    setVoiceCandidate: (voiceCandidate) => set({ voiceCandidate }),
    setHandTrackingFrame: (handTrackingFrame) => set({ handTrackingFrame }),
    reset: () => set(initialState),
  })),
);
