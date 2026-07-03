import {
  TrendingUp,
  MoveUpRight,
  Slash,
  Minus,
  MoveRight,
  MoveVertical,
  Crosshair,
  DollarSign,
  Equal,
  AlignJustify,
  Ruler,
  Square,
  Type,
  Tag,
  type LucideIcon
} from 'lucide-react';
import { registerFibTool, FIB_TOOL } from '@/lib/overlays/fibTool';
import { registerTextNote, TEXT_NOTE } from '@/lib/overlays/textNote';
import { registerPriceTag, PRICE_TAG } from '@/lib/overlays/priceTag';
import { registerRectangle, RECTANGLE } from '@/lib/overlays/rectangle';
import { registerCrossLine, CROSS_LINE } from '@/lib/overlays/crossLine';

// Declarative drawing-tool registry: the DrawingToolbar renders whatever is
// here — adding a tool = one entry (+ overlay registration if custom).
// `overlay` is the klinecharts overlay name: a built-in or a custom `fx-*`.

export type ToolGroup = 'Lines' | 'Channels' | 'Fib' | 'Shapes' | 'Annotations';
export const TOOL_GROUPS: ToolGroup[] = ['Lines', 'Channels', 'Fib', 'Shapes', 'Annotations'];

export interface ToolDef {
  id: string;
  label: string;
  group: ToolGroup;
  overlay: string;
  Icon: LucideIcon;
  shortcut?: string; // hotkeys.ts combo
}

export const TOOLS: ToolDef[] = [
  // Lines
  { id: 'trend', label: 'Trend line', group: 'Lines', overlay: 'segment', Icon: TrendingUp, shortcut: 'alt+t' },
  { id: 'ray', label: 'Ray', group: 'Lines', overlay: 'rayLine', Icon: MoveUpRight },
  { id: 'extended', label: 'Extended line', group: 'Lines', overlay: 'straightLine', Icon: Slash },
  { id: 'horizontal', label: 'Horizontal line', group: 'Lines', overlay: 'horizontalStraightLine', Icon: Minus, shortcut: 'alt+h' },
  { id: 'horizontalRay', label: 'Horizontal ray', group: 'Lines', overlay: 'horizontalRayLine', Icon: MoveRight },
  { id: 'vertical', label: 'Vertical line', group: 'Lines', overlay: 'verticalStraightLine', Icon: MoveVertical, shortcut: 'alt+v' },
  { id: 'cross', label: 'Cross line', group: 'Lines', overlay: CROSS_LINE, Icon: Crosshair },
  { id: 'price', label: 'Price line', group: 'Lines', overlay: 'priceLine', Icon: DollarSign },
  // Channels
  { id: 'channel', label: 'Parallel channel', group: 'Channels', overlay: 'priceChannelLine', Icon: Equal },
  { id: 'parallel', label: 'Parallel lines', group: 'Channels', overlay: 'parallelStraightLine', Icon: AlignJustify },
  // Fib
  { id: 'fib', label: 'Fib retracement', group: 'Fib', overlay: FIB_TOOL, Icon: Ruler, shortcut: 'alt+f' },
  // Shapes
  { id: 'rectangle', label: 'Rectangle', group: 'Shapes', overlay: RECTANGLE, Icon: Square, shortcut: 'alt+r' },
  // Annotations
  { id: 'text', label: 'Text note', group: 'Annotations', overlay: TEXT_NOTE, Icon: Type },
  { id: 'priceLabel', label: 'Price label', group: 'Annotations', overlay: PRICE_TAG, Icon: Tag }
];

export const toolById = (id: string): ToolDef | undefined => TOOLS.find((t) => t.id === id);

/** Register every custom overlay the registry references (idempotent). */
export function registerToolOverlays(): void {
  registerFibTool();
  registerTextNote();
  registerPriceTag();
  registerRectangle();
  registerCrossLine();
}
