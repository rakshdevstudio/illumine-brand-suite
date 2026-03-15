import { supabase } from "@/integrations/supabase/client";

type ActivityLogInput = {
  actionType: string;
  entityType: string;
  entityId: string;
  description: string;
  performedBy?: string | null;
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
};

export const logActivity = async ({
  actionType,
  entityType,
  entityId,
  description,
  performedBy,
  fieldChanged,
  oldValue,
  newValue,
}: ActivityLogInput) => {
  const { error } = await supabase.from("activity_logs").insert({
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    description,
    performed_by: performedBy ?? undefined,
    field_changed: fieldChanged ?? undefined,
    old_value: oldValue ?? undefined,
    new_value: newValue ?? undefined,
  });

  if (error) {
    console.error("Failed to log activity:", error);
  }
};
