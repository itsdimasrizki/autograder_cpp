import "server-only";

import { db, unwrap } from "@/lib/db/client";
import type {
  Assignment,
  AssignmentTemplate,
  ScoringMode,
} from "@/lib/db/types";

export async function listAssignments(
  courseId: string,
): Promise<Assignment[]> {
  const { data, error } = await db()
    .from("assignments")
    .select("*")
    .eq("course_id", courseId)
    .order("meeting_number");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const { data, error } = await db()
    .from("assignments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export interface AssignmentInput {
  courseId: string;
  meetingNumber: number;
  title: string;
  description: string | null;
  templateId: string | null;
  maxScore: number;
  deadline: string | null;
  maxAttempts: number | null;
  scoringMode: ScoringMode;
}

export async function createAssignment(
  input: AssignmentInput,
): Promise<Assignment> {
  return unwrap(
    await db()
      .from("assignments")
      .insert({
        course_id: input.courseId,
        meeting_number: input.meetingNumber,
        title: input.title,
        description: input.description,
        template_id: input.templateId,
        max_score: input.maxScore,
        deadline: input.deadline,
        max_attempts: input.maxAttempts,
        scoring_mode: input.scoringMode,
        published: false,
      })
      .select("*")
      .single(),
  );
}

export async function updateAssignment(
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    template_id: string | null;
    max_score: number;
    deadline: string | null;
    max_attempts: number | null;
    scoring_mode: ScoringMode;
    published: boolean;
  }>,
): Promise<void> {
  const { error } = await db().from("assignments").update(patch).eq("id", id);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

// -----------------------------------------------------------------------------
// Template repository
// -----------------------------------------------------------------------------

export async function listTemplates(): Promise<AssignmentTemplate[]> {
  const { data, error } = await db()
    .from("assignment_templates")
    .select("*")
    .order("name");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function getTemplate(
  id: string,
): Promise<AssignmentTemplate | null> {
  const { data, error } = await db()
    .from("assignment_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export async function createTemplate(input: {
  name: string;
  owner: string;
  repo: string;
  description: string | null;
}): Promise<AssignmentTemplate> {
  const client = db();

  const existing = await client
    .from("assignment_templates")
    .select("*")
    .eq("owner", input.owner)
    .eq("repo", input.repo)
    .maybeSingle();
  if (existing.error) throw new Error(`Supabase: ${existing.error.message}`);
  if (existing.data) return existing.data;

  return unwrap(
    await client
      .from("assignment_templates")
      .insert({
        name: input.name,
        owner: input.owner,
        repo: input.repo,
        description: input.description,
      })
      .select("*")
      .single(),
  );
}
