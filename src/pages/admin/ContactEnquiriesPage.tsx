import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CONTACT_DETAILS } from "@/lib/contact";

type ContactMessageRow = Database["public"]["Tables"]["contact_messages"]["Row"];

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatRelativeTime = (value: string) => {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};

const ContactEnquiriesPage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedMessage, setSelectedMessage] = useState<ContactMessageRow | null>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["admin-contact-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data satisfies ContactMessageRow[];
    },
  });

  const enquiryTypes = useMemo(() => {
    const values = new Set((messages ?? []).map((message) => message.type).filter(Boolean));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();

    return (messages ?? []).filter((message) => {
      const matchesType = typeFilter === "all" || message.type === typeFilter;
      if (!matchesType) return false;

      if (!needle) return true;

      const haystack = [
        message.name,
        message.phone,
        message.email,
        message.type,
        message.message,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [messages, searchQuery, typeFilter]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="mb-2 text-xl font-light uppercase tracking-[0.1em]">Contact Enquiries</h1>
        <p className="text-sm text-muted-foreground">
          Review enquiries sent from the website contact page and contact modal.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row">
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search name, phone, email, or message"
          className="h-10 lg:max-w-md"
        />

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-10 w-full lg:w-64">
            <SelectValue placeholder="All enquiry types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All enquiry types</SelectItem>
            {enquiryTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wider">Received</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Name</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Contact</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Enquiry Type</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Message</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Loading enquiries...
                </TableCell>
              </TableRow>
            ) : filteredMessages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No contact enquiries found.
                </TableCell>
              </TableRow>
            ) : (
              filteredMessages.map((message) => (
                <TableRow key={message.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    <div className="space-y-1">
                      <p>{formatDateTime(message.created_at)}</p>
                      <p className="text-xs">{formatRelativeTime(message.created_at)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{message.name}</TableCell>
                  <TableCell className="text-sm">
                    <div className="space-y-1">
                      <p>{message.phone}</p>
                      <p className="text-xs text-muted-foreground">{message.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{message.type}</TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    <p className="line-clamp-2">{message.message}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedMessage(message)}
                      className="text-xs uppercase tracking-[0.14em]"
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="max-w-3xl">
          {selectedMessage ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-light uppercase tracking-[0.1em]">
                  Contact Enquiry
                </DialogTitle>
                <DialogDescription>
                  Received on {formatDateTime(selectedMessage.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 md:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-5">
                  <div className="rounded-xl border bg-secondary/20 p-4">
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Message</p>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                      {selectedMessage.message}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <a href={`tel:${selectedMessage.phone}`} className="inline-flex">
                      <Button type="button" className="rounded-full">
                        <Phone className="h-4 w-4" />
                        Call
                      </Button>
                    </a>
                    <a href={`mailto:${selectedMessage.email}`} className="inline-flex">
                      <Button type="button" variant="outline" className="rounded-full">
                        <Mail className="h-4 w-4" />
                        Email
                      </Button>
                    </a>
                    <a
                      href={`https://wa.me/${selectedMessage.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex"
                    >
                      <Button type="button" variant="outline" className="rounded-full">
                        <MessageCircle className="h-4 w-4" />
                        WhatsApp
                      </Button>
                    </a>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border bg-white p-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Name</p>
                    <p className="mt-1 text-sm">{selectedMessage.name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Phone</p>
                    <p className="mt-1 text-sm">{selectedMessage.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Email</p>
                    <p className="mt-1 text-sm">{selectedMessage.email}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Enquiry Type</p>
                    <p className="mt-1 text-sm">{selectedMessage.type}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Source</p>
                    <p className="mt-1 text-sm">Website contact form / modal</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Business Hours</p>
                    <p className="mt-1 text-sm">{CONTACT_DETAILS.timing}</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactEnquiriesPage;
