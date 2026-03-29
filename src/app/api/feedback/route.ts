import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const feedbackSchema = z.object({
  category: z.enum(["bug", "feature", "improvement", "other"]),
  message: z.string().min(1, "Message is required").max(2000, "Message too long"),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json();
  const parsed = feedbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("user_feedback").insert({
    user_id: user.id,
    category: parsed.data.category,
    message: parsed.data.message,
  });

  if (error) {
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
