import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useResolvedSchoolScope } from "@/lib/portal-dashboard";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const SchoolAnnouncementsPage = () => {
  const { user, isSchoolUser, hasAccess, loading, signOut } = useAuth();
  const { data: scope, isLoading: scopeLoading } = useResolvedSchoolScope(user);
  const schoolId = scope?.schoolId ?? null;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", announcementType: "general", channelPortal: true, channelEmail: false, channelWhatsapp: false });

  const { data: announcements = [], isLoading: listLoading } = useQuery({
    queryKey: ["school-announcements", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("school_announcements").select("*").eq("school_id", schoolId).order("published_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createAnnouncement = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("School scope missing");
      if (!form.title.trim() || !form.message.trim()) throw new Error("Title and message are required");
      const { error } = await (supabase as any).from("school_announcements").insert({
        school_id: schoolId,
        title: form.title.trim(),
        message: form.message.trim(),
        announcement_type: form.announcementType,
        channel_portal: form.channelPortal,
        channel_email: form.channelEmail,
        channel_whatsapp: form.channelWhatsapp,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Announcement published.");
      setOpen(false);
      setForm({ title: "", message: "", announcementType: "general", channelPortal: true, channelEmail: false, channelWhatsapp: false });
      await queryClient.invalidateQueries({ queryKey: ["school-announcements", schoolId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to publish announcement."),
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading...</p></div>;
  if (!user || !hasAccess || !isSchoolUser) return <Navigate to="/school/login" replace />;

  return (
    <PortalShell title="Announcements" subtitle={user.email ?? "Parent communication"} onSignOut={signOut} scopeLabel={scope?.school?.name ?? (scopeLoading ? "Resolving school" : "School not assigned")}>
      <Card className={portalPanelClassName}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">School Notices</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="rounded-full"><Plus className="mr-2 h-4 w-4" />Create Notice</Button></DialogTrigger>
            <DialogContent className="rounded-[24px]">
              <DialogHeader><DialogTitle>Create Announcement</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Type</Label><Select value={form.announcementType} onValueChange={(v) => setForm((p) => ({ ...p, announcementType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="deadline">Uniform deadline reminder</SelectItem><SelectItem value="measurement">Size measurement day</SelectItem><SelectItem value="sports">Sports uniform update</SelectItem><SelectItem value="offer">Discount / offer message</SelectItem><SelectItem value="general">General notice</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Message</Label><Textarea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} /></div>
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.channelPortal} onCheckedChange={(v) => setForm((p) => ({ ...p, channelPortal: !!v }))} />Portal</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.channelEmail} onCheckedChange={(v) => setForm((p) => ({ ...p, channelEmail: !!v }))} />Email Ready</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.channelWhatsapp} onCheckedChange={(v) => setForm((p) => ({ ...p, channelWhatsapp: !!v }))} />WhatsApp Ready</label>
                </div>
                <Button onClick={() => createAnnouncement.mutate()} disabled={createAnnouncement.isPending}>Publish</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Channels</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {listLoading ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Loading announcements...</TableCell></TableRow> : null}
              {announcements.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell>{row.announcement_type}</TableCell>
                  <TableCell>{[row.channel_portal ? "Portal" : null, row.channel_email ? "Email" : null, row.channel_whatsapp ? "WhatsApp" : null].filter(Boolean).join(", ") || "-"}</TableCell>
                  <TableCell>{new Date(row.published_at).toLocaleDateString("en-IN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PortalShell>
  );
};

export default SchoolAnnouncementsPage;
