import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Outlet } from "@/features/outlets";
import type { TeamTreeDTO } from "@/features/team";
import type { BusinessConfigurationStatus } from "@/features/onboarding/api/businessConfigurationApi";

interface AppStateSliceState {
  outletInfo: Outlet | null;
  businessConfiguration: { outletId: string; configuration: BusinessConfigurationStatus } | null;
  teamTreeData:TeamTreeDTO[] |null;
  loading: boolean;
  error: string | null;
}

const initialState: AppStateSliceState = {
  outletInfo: null,
  businessConfiguration: null,
  teamTreeData:null,
  loading: false,
  error: null,
};

const appStateSlice = createSlice({
  name: "appState",
  initialState,
  reducers: {
    setOutletInfo(state, action: PayloadAction<Outlet>) {
      if (state.outletInfo?.id !== action.payload.id) state.businessConfiguration = null;
      state.outletInfo = action.payload;
    },
    clearOutletInfo(state) {
      state.outletInfo = null;
      state.businessConfiguration = null;
    },
    setBusinessConfiguration(state, action: PayloadAction<{ outletId: string; configuration: BusinessConfigurationStatus }>) {
      if (state.outletInfo?.id === action.payload.outletId) state.businessConfiguration = action.payload;
    },
    setTeamTreeData(state, action: PayloadAction<TeamTreeDTO[]>) {
      state.teamTreeData = action.payload;
    },
    clearteamTreeData(state) {
      state.teamTreeData = null;
    },
  }
});

export const { setOutletInfo, clearOutletInfo, setBusinessConfiguration, setTeamTreeData,clearteamTreeData } = appStateSlice.actions;
export default appStateSlice.reducer;
