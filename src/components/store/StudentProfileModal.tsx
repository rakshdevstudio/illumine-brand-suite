import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStudentProfile, StudentProfile } from "@/lib/student-profile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const genders = [
  { value: "boys", label: "Boys", db: "Male" },
  { value: "girls", label: "Girls", db: "Female" },
  { value: "unisex", label: "Unisex", db: "Unisex" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProfileSet?: (profile: StudentProfile) => void;
}

const StudentProfileModal = ({ open, onOpenChange, onProfileSet }: Props) => {
  const setProfile = useStudentProfile((s) => s.setProfile);

  const [schoolId, setSchoolId] = useState("");
  const [classId, setClassId] = useState("");
  const [gender, setGender] = useState("");

  // Reset dependent fields
  useEffect(() => setClassId(""), [schoolId]);

  const { data: schools } = useQuery({
    queryKey: ["schools-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("*")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["classes-for-school", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const canSubmit = schoolId && classId && gender;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const school = schools?.find((s) => s.id === schoolId);
    const cls = classes?.find((c) => c.id === classId);
    const g = genders.find((x) => x.value === gender);
    if (!school || !cls || !g) return;

    const profile: StudentProfile = {
      schoolId: school.id,
      schoolName: school.name,
      schoolSlug: school.slug,
      classId: cls.id,
      className: cls.name,
      classSlug: cls.slug,
      gender: g.value as StudentProfile["gender"],
      genderLabel: g.label,
    };

    setProfile(profile);
    onProfileSet?.(profile);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border bg-background p-8">
        <DialogHeader className="text-center space-y-3">
          <DialogTitle className="text-lg font-light tracking-[0.1em] uppercase">
            Student Profile
          </DialogTitle>
          <DialogDescription className="text-xs tracking-wide text-muted-foreground">
            Select your student's school, class, and gender to see relevant uniforms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-6">
          {/* School */}
          <div className="space-y-2">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">School</label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger className="border-border">
                <SelectValue placeholder="Select school" />
              </SelectTrigger>
              <SelectContent>
                {schools?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Class */}
          <div className="space-y-2">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Class</label>
            <Select value={classId} onValueChange={setClassId} disabled={!schoolId}>
              <SelectTrigger className="border-border">
                <SelectValue placeholder={schoolId ? "Select class" : "Select school first"} />
              </SelectTrigger>
              <SelectContent>
                {classes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Gender */}
          <div className="space-y-2">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Gender</label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="border-border">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {genders.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-11 text-xs tracking-[0.2em] uppercase mt-2"
          >
            Continue Shopping
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StudentProfileModal;
