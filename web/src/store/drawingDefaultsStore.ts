import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Per-tool style defaults: "Set as default for this tool" in the overlay
// context menu saves the overlay's current styles (and non-content extendData,
// e.g. fib levels) under its overlay name; every NEW drawing of that tool
// starts from them. Restoring saved drawings does NOT apply defaults — their
// own stored styles win.

export interface ToolDefaults {
  styles?: Record<string, unknown>;
  extendData?: Record<string, unknown>;
}

interface DrawingDefaultsState {
  defaults: Record<string, ToolDefaults>; // by overlay name — applied to every new drawing
  templates: Record<string, Record<string, ToolDefaults>>; // overlay name -> templateName -> style set
  setDefault: (name: string, d: ToolDefaults) => void;
  clearDefault: (name: string) => void;
  saveTemplate: (name: string, templateName: string, d: ToolDefaults) => void;
  deleteTemplate: (name: string, templateName: string) => void;
}

export const useDrawingDefaultsStore = create<DrawingDefaultsState>()(
  persist(
    (set) => ({
      defaults: {},
      templates: {},
      setDefault: (name, d) => set((s) => ({ defaults: { ...s.defaults, [name]: d } })),
      clearDefault: (name) =>
        set((s) => {
          const defaults = { ...s.defaults };
          delete defaults[name];
          return { defaults };
        }),
      saveTemplate: (name, templateName, d) =>
        set((s) => ({
          templates: { ...s.templates, [name]: { ...(s.templates[name] ?? {}), [templateName]: d } }
        })),
      deleteTemplate: (name, templateName) =>
        set((s) => {
          const forTool = { ...(s.templates[name] ?? {}) };
          delete forTool[templateName];
          return { templates: { ...s.templates, [name]: forTool } };
        })
    }),
    { name: 'forex-drawing-defaults' }
  )
);
