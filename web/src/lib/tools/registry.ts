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
  ArrowUpRight,
  Waypoints,
  MessageSquare,
  Spline,
  Target,
  PencilRuler,
  Circle,
  Triangle,
  MoveHorizontal,
  Frame,
  Radius,
  Info,
  GitFork,
  Flag,
  ArrowUp,
  ArrowDown,
  type LucideIcon
} from 'lucide-react';
import { registerFibTool, FIB_TOOL } from '@/lib/overlays/fibTool';
import { registerTextNote, TEXT_NOTE } from '@/lib/overlays/textNote';
import { registerPriceTag, PRICE_TAG } from '@/lib/overlays/priceTag';
import { registerRectangle, RECTANGLE } from '@/lib/overlays/rectangle';
import { registerCrossLine, CROSS_LINE } from '@/lib/overlays/crossLine';
import { registerArrow, ARROW } from '@/lib/overlays/arrow';
import { registerCallout, CALLOUT } from '@/lib/overlays/callout';
import { registerFibExtension, FIB_EXTENSION } from '@/lib/overlays/fibExtension';
import { registerPositionDrawing, POSITION_DRAWING } from '@/lib/overlays/positionDrawing';
import { registerMeasure, MEASURE } from '@/lib/overlays/measure';
import { registerCircle, registerTriangle, CIRCLE, TRIANGLE } from '@/lib/overlays/shapes';
import { registerRanges, DATE_RANGE, PRICE_RANGE, DATE_PRICE_RANGE } from '@/lib/overlays/ranges';
import { registerLines2, TREND_ANGLE_TOOL, INFO_LINE_TOOL, PITCHFORK_TOOL } from '@/lib/overlays/lines2';
import { registerMarkers, FLAG_TOOL, ARROW_UP_TOOL, ARROW_DOWN_TOOL } from '@/lib/overlays/markers';
import { registerCurves, PATH2, PATH3, PATH4, CURVE } from '@/lib/overlays/curves';

// Declarative drawing-tool registry: the DrawingToolbar renders whatever is
// here — adding a tool = one entry (+ overlay registration if custom).
// `overlay` is the klinecharts overlay name: a built-in or a custom `fx-*`.
// `ephemeral` tools (measure) are never persisted and dismiss on deselect.

export type ToolGroup = 'Lines' | 'Channels' | 'Fib' | 'Shapes' | 'Annotations' | 'Position' | 'Measure';
export const TOOL_GROUPS: ToolGroup[] = ['Lines', 'Channels', 'Fib', 'Shapes', 'Annotations', 'Position', 'Measure'];

export interface ToolDef {
  id: string;
  label: string;
  group: ToolGroup;
  overlay: string;
  Icon: LucideIcon;
  shortcut?: string; // hotkeys.ts combo
  ephemeral?: boolean;
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
  { id: 'trendAngle', label: 'Trend angle', group: 'Lines', overlay: TREND_ANGLE_TOOL, Icon: Radius },
  { id: 'infoLine', label: 'Info line', group: 'Lines', overlay: INFO_LINE_TOOL, Icon: Info },
  { id: 'path2', label: 'Path (2-leg)', group: 'Lines', overlay: PATH2, Icon: Waypoints },
  { id: 'path', label: 'Path (3-leg)', group: 'Lines', overlay: PATH3, Icon: Waypoints },
  { id: 'path4', label: 'Path (4-leg)', group: 'Lines', overlay: PATH4, Icon: Waypoints },
  { id: 'curve', label: 'Curved line', group: 'Lines', overlay: CURVE, Icon: Spline },
  { id: 'price', label: 'Price line', group: 'Lines', overlay: 'priceLine', Icon: DollarSign },
  // Channels
  { id: 'channel', label: 'Parallel channel', group: 'Channels', overlay: 'priceChannelLine', Icon: Equal },
  { id: 'parallel', label: 'Parallel lines', group: 'Channels', overlay: 'parallelStraightLine', Icon: AlignJustify },
  { id: 'pitchfork', label: 'Pitchfork', group: 'Channels', overlay: PITCHFORK_TOOL, Icon: GitFork },
  // Fib
  { id: 'fib', label: 'Fib retracement', group: 'Fib', overlay: FIB_TOOL, Icon: Ruler, shortcut: 'alt+f' },
  { id: 'fibExtension', label: 'Fib extension (trend)', group: 'Fib', overlay: FIB_EXTENSION, Icon: Spline },
  // Shapes
  { id: 'rectangle', label: 'Rectangle', group: 'Shapes', overlay: RECTANGLE, Icon: Square, shortcut: 'alt+r' },
  { id: 'circle', label: 'Circle', group: 'Shapes', overlay: CIRCLE, Icon: Circle },
  { id: 'triangle', label: 'Triangle', group: 'Shapes', overlay: TRIANGLE, Icon: Triangle },
  { id: 'arrow', label: 'Arrow', group: 'Shapes', overlay: ARROW, Icon: ArrowUpRight },
  // Annotations
  { id: 'text', label: 'Text note', group: 'Annotations', overlay: TEXT_NOTE, Icon: Type },
  { id: 'callout', label: 'Callout', group: 'Annotations', overlay: CALLOUT, Icon: MessageSquare },
  { id: 'priceLabel', label: 'Price label', group: 'Annotations', overlay: PRICE_TAG, Icon: Tag },
  { id: 'flag', label: 'Flag mark', group: 'Annotations', overlay: FLAG_TOOL, Icon: Flag },
  { id: 'arrowUp', label: 'Arrow mark up', group: 'Annotations', overlay: ARROW_UP_TOOL, Icon: ArrowUp },
  { id: 'arrowDown', label: 'Arrow mark down', group: 'Annotations', overlay: ARROW_DOWN_TOOL, Icon: ArrowDown },
  // Position: THE long/short R:R tool — a persisted drawing; right-click →
  // "Apply to order ticket" loads its levels into the trading panel.
  { id: 'position', label: 'Long/Short position', group: 'Position', overlay: POSITION_DRAWING, Icon: Target },
  // Measure — ephemeral Shift+M + persisted range measurers
  { id: 'measure', label: 'Measure', group: 'Measure', overlay: MEASURE, Icon: PencilRuler, shortcut: 'shift+m', ephemeral: true },
  { id: 'dateRange', label: 'Date range', group: 'Measure', overlay: DATE_RANGE, Icon: MoveHorizontal },
  { id: 'priceRange', label: 'Price range', group: 'Measure', overlay: PRICE_RANGE, Icon: MoveVertical },
  { id: 'datePriceRange', label: 'Date & price range', group: 'Measure', overlay: DATE_PRICE_RANGE, Icon: Frame }
];

export const toolById = (id: string): ToolDef | undefined => TOOLS.find((t) => t.id === id);

/** Register every custom overlay the registry references (idempotent). */
export function registerToolOverlays(): void {
  registerFibTool();
  registerTextNote();
  registerPriceTag();
  registerRectangle();
  registerCrossLine();
  registerArrow();
  registerCallout();
  registerFibExtension();
  registerPositionDrawing();
  registerMeasure();
  registerCircle();
  registerTriangle();
  registerRanges();
  registerLines2();
  registerMarkers();
  registerCurves();
}
