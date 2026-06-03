import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  activeModule: string;
  searchOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveModule: (module: string) => void;
  setSearchOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  activeModule: 'dashboard',
  searchOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveModule: (module) => set({ activeModule: module }),
  setSearchOpen: (open) => set({ searchOpen: open }),
}));
