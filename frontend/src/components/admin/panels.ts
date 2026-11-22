import { Activity, Archive, BookOpen, Coins, FileClock, HeartPulse, LifeBuoy, ScrollText, ShieldAlert, Users } from "lucide-react";
import type { AdminPermission } from "@ebook/shared";

export type Panel =
  | "overview"
  | "status"
  | "users"
  | "books"
  | "jobs"
  | "payments"
  | "incidents"
  | "support"
  | "roles"
  | "backups"
  | "audit";

export const PANELS: { id: Panel; label: string; icon: typeof Activity; permission?: AdminPermission }[] = [
  { id: "overview", label: "Overview", icon: Activity, permission: "ops.read" },
  { id: "status", label: "Status", icon: HeartPulse, permission: "ops.read" },
  { id: "users", label: "Customers", icon: Users, permission: "ops.read" },
  { id: "books", label: "Books", icon: BookOpen, permission: "ops.read" },
  { id: "jobs", label: "Jobs", icon: FileClock, permission: "ops.read" },
  { id: "payments", label: "Payments", icon: Coins, permission: "billing.read" },
  { id: "incidents", label: "Incidents and alerts", icon: ShieldAlert, permission: "ops.read" },
  { id: "support", label: "Support", icon: LifeBuoy, permission: "support.reply" },
  { id: "roles", label: "Roles", icon: Users, permission: "roles.manage" },
  { id: "backups", label: "Backups", icon: Archive, permission: "backup.manage" },
  { id: "audit", label: "Audit trail", icon: ScrollText, permission: "audit.read" },
];
