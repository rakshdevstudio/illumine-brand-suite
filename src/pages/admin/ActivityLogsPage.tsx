import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";

const ActivityLogsPage = () => {
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["activity-logs", actionFilter, entityFilter, fromDate, toDate],
    queryFn: async () => {
      let query = supabase
        .from("activity_logs")
        .select("id, action_type, entity_type, entity_id, description, field_changed, old_value, new_value, performed_by, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (actionFilter !== "all") query = query.eq("action_type", actionFilter);
      if (entityFilter !== "all") query = query.eq("entity_type", entityFilter);
      if (fromDate) query = query.gte("created_at", new Date(`${fromDate}T00:00:00`).toISOString());
      if (toDate) query = query.lte("created_at", new Date(`${toDate}T23:59:59`).toISOString());

      const { data, error } = await query;
      if (error) throw error;

      const userIds = Array.from(new Set((data ?? []).map((l) => l.performed_by).filter(Boolean)));
      if (userIds.length === 0) return (data ?? []).map((log) => ({ ...log, admin_name: "System" }));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds as string[]);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Admin"]));
      return (data ?? []).map((log) => ({
        ...log,
        admin_name: log.performed_by ? profileMap.get(log.performed_by) ?? "Admin" : "System",
      }));
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
                    {new Date(log.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="text-sm">{log.admin_name}</TableCell>
                  <TableCell className="text-sm font-medium">{log.action_type}</TableCell>
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
