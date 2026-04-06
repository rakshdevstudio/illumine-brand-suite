import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";

type ActivityLogRow = {
  id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  field_changed?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  performed_by?: string | null;
  created_at: string;
  admin_name?: string;
  admin_email?: string | null;
};

export const fetchActivityLogs = async (): Promise<ActivityLogRow[]> => {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const userIds = Array.from(new Set((data ?? []).map((l) => l.performed_by).filter(Boolean)));
  if (userIds.length === 0) {
    return (data ?? []).map((log) => ({
      ...log,
      admin_name: "System",
      admin_email: null,
    }));
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds as string[]);

  if (profilesError) throw profilesError;

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      {
        name: profile.full_name || profile.email || "Admin",
        email: profile.email || null,
      },
    ])
  );

  return (data ?? []).map((log) => ({
    ...log,
    admin_name: log.performed_by ? profileMap.get(log.performed_by)?.name ?? "Admin" : "System",
    admin_email: log.performed_by ? profileMap.get(log.performed_by)?.email ?? null : null,
  }));
};

const formatRelativeTime = (value: string) => {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};

const badgeClassForAction = (value: string) => {
  const action = value.toUpperCase();
  if (action.includes("DELETE")) return "bg-red-50 text-red-700 border-red-200";
  if (action.includes("ARCHIVE")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (action.includes("RESTORE")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (action.includes("CREATE")) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-secondary text-foreground border-border";
};

const ActivityLogsPage = () => {
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["activity-logs", actionFilter, entityFilter, fromDate, toDate],
    queryFn: async () => {
      const allLogs = await fetchActivityLogs();
      return allLogs
        .filter((log) => (actionFilter === "all" ? true : log.action_type === actionFilter))
        .filter((log) => (entityFilter === "all" ? true : log.entity_type === entityFilter))
        .filter((log) => (fromDate ? new Date(log.created_at) >= new Date(`${fromDate}T00:00:00`) : true))
        .filter((log) => (toDate ? new Date(log.created_at) <= new Date(`${toDate}T23:59:59`) : true))
        .slice(0, 50);
    },
  });

  const actionTypes = useMemo(() => {
    const values = new Set((logs ?? []).map((l: any) => l.action_type));
    return Array.from(values).sort();
  }, [logs]);

  const entityTypes = useMemo(() => {
    const values = new Set((logs ?? []).map((l: any) => l.entity_type));
    return Array.from(values).sort();
  }, [logs]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase mb-2">Activity Logs</h1>
        <p className="text-sm text-muted-foreground">Audit history for important admin actions across the platform.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full lg:w-56 h-10 text-xs">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionTypes.map((value) => (
              <SelectItem key={value} value={value}>{value}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-full lg:w-56 h-10 text-xs">
            <SelectValue placeholder="All entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {entityTypes.map((value) => (
              <SelectItem key={value} value={value}>{value}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 lg:w-44 text-xs" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 lg:w-44 text-xs" />
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase">Timestamp</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Admin User</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Action</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Entity Type</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : !logs || logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No activity logs found</TableCell>
              </TableRow>
            ) : (
              logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    <div className="space-y-1">
                      <p>
                        {new Date(log.created_at).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-xs">{formatRelativeTime(log.created_at)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="space-y-1">
                      <p>{log.admin_name}</p>
                      <p className="text-xs text-muted-foreground">{log.admin_email ?? "system"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] tracking-[0.14em] uppercase ${badgeClassForAction(log.action_type)}`}>
                      {log.action_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground uppercase">{log.entity_type}</TableCell>
                  <TableCell className="text-sm">
                    <div className="space-y-1">
                      <p>{log.description}</p>
                      {log.field_changed && log.old_value !== null && log.new_value !== null && (
                        <div className="text-xs flex items-center gap-2 flex-wrap">
                          <span className="uppercase tracking-wide text-muted-foreground">{log.field_changed}</span>
                          <span className="text-muted-foreground">{log.old_value}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-green-600 font-medium">{log.new_value}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ActivityLogsPage;
