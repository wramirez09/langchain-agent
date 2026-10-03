import {
  Activity,
  BookOpen,
  ClipboardList,
  FileBarChart,
  FileText,
  MapPin,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon + colour per PA request field. The form (PriorAuthFormPanel) labels
 * its inputs with these and the chat's "Your Request" card (UserRequestFields)
 * labels the same fields with them, so the two stay visually paired.
 */
export const FIELD_ICONS = {
  guidelines: { Icon: FileText, color: "#2563EB" },
  state: { Icon: MapPin, color: "#059669" },
  treatment: { Icon: Stethoscope, color: "#7C3AED" },
  cpt: { Icon: FileBarChart, color: "#4F46E5" },
  diagnosis: { Icon: Activity, color: "#F97316" },
  history: { Icon: ClipboardList, color: "#F43F5E" },
  relevantHistory: { Icon: BookOpen, color: "#0EA5E9" },
} satisfies Record<string, { Icon: LucideIcon; color: string }>;

export type FieldIconKey = keyof typeof FIELD_ICONS;
