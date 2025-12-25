import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SaveQuizResultRequest {
  topicId: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  userId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { topicId, score, confidence, userId }: SaveQuizResultRequest = await req.json();

    console.log(`[save-quiz-result] Starting for user=${userId}, topic=${topicId}, score=${score}, confidence=${confidence}`);

    // Determine status based on score and confidence
    let status: string;
    if (score >= 80 && confidence === 'high') {
      status = 'strong';
    } else if (score >= 50 || confidence === 'medium') {
      status = 'needs_revision';
    } else {
      status = 'weak';
    }

    console.log(`[save-quiz-result] Calculated status: ${status}`);

    // Update topic status
    const { error: topicError } = await supabase
      .from('topics')
      .update({
        status,
        confidence,
        last_quiz_score: score,
        completed_at: new Date().toISOString(),
      })
      .eq('id', topicId)
      .eq('user_id', userId);

    if (topicError) {
      console.error('[save-quiz-result] Error updating topic:', topicError);
      throw topicError;
    }

    console.log(`[save-quiz-result] Topic updated successfully`);

    // Create study task record for today
    const today = new Date().toISOString().split('T')[0];
    
    // Check if study task already exists for today
    const { data: existingStudyTask } = await supabase
      .from('study_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('topic_id', topicId)
      .eq('scheduled_date', today)
      .eq('task_type', 'study')
      .maybeSingle();

    if (!existingStudyTask) {
      const { error: taskError } = await supabase
        .from('study_tasks')
        .insert({
          user_id: userId,
          topic_id: topicId,
          scheduled_date: today,
          duration_minutes: 30,
          task_type: 'study',
          is_completed: true,
          completed_at: new Date().toISOString(),
        });

      if (taskError) {
        console.error('[save-quiz-result] Error creating study task:', taskError);
      } else {
        console.log(`[save-quiz-result] Study task created for today`);
      }
    } else {
      console.log(`[save-quiz-result] Study task already exists for today, skipping`);
    }

    // Schedule revision tasks based on status
    const todayDate = new Date();
    let revisionSchedule: { daysAhead: number; requireQuiz: boolean }[] = [];

    if (status === 'strong') {
      revisionSchedule = [
        { daysAhead: 7, requireQuiz: false },
        { daysAhead: 21, requireQuiz: false },
      ];
    } else if (status === 'needs_revision') {
      revisionSchedule = [
        { daysAhead: 3, requireQuiz: false },
        { daysAhead: 7, requireQuiz: false },
      ];
    } else {
      revisionSchedule = [
        { daysAhead: 1, requireQuiz: true },
      ];
    }

    console.log(`[save-quiz-result] Scheduling ${revisionSchedule.length} revision tasks`);

    // Check for existing revision tasks to prevent duplicates
    const scheduledDates = revisionSchedule.map(r => {
      const date = new Date(todayDate.getTime() + r.daysAhead * 24 * 60 * 60 * 1000);
      return date.toISOString().split('T')[0];
    });

    const { data: existingRevisions } = await supabase
      .from('study_tasks')
      .select('scheduled_date')
      .eq('user_id', userId)
      .eq('topic_id', topicId)
      .eq('task_type', 'revision')
      .in('scheduled_date', scheduledDates);

    const existingDates = new Set(existingRevisions?.map(t => t.scheduled_date) || []);
    console.log(`[save-quiz-result] Found ${existingDates.size} existing revision tasks`);

    // Only insert tasks that don't already exist
    const newRevisionTasks = revisionSchedule
      .map(r => {
        const date = new Date(todayDate.getTime() + r.daysAhead * 24 * 60 * 60 * 1000);
        return {
          scheduledDate: date.toISOString().split('T')[0],
          requireQuiz: r.requireQuiz,
        };
      })
      .filter(r => !existingDates.has(r.scheduledDate))
      .map(r => ({
        user_id: userId,
        topic_id: topicId,
        scheduled_date: r.scheduledDate,
        duration_minutes: 20,
        task_type: 'revision',
        require_quiz: r.requireQuiz,
        is_completed: false,
      }));

    if (newRevisionTasks.length > 0) {
      const { error: revisionError } = await supabase
        .from('study_tasks')
        .insert(newRevisionTasks);

      if (revisionError) {
        console.error('[save-quiz-result] Error scheduling revisions:', revisionError);
      } else {
        console.log(`[save-quiz-result] Created ${newRevisionTasks.length} new revision tasks`);
      }
    } else {
      console.log('[save-quiz-result] All revision tasks already exist, no duplicates created');
    }

    // Update user streak
    const { data: profileData } = await supabase
      .from('profiles')
      .select('last_study_date, current_streak')
      .eq('user_id', userId)
      .single();

    const todayStr = todayDate.toISOString().split('T')[0];
    const yesterday = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let newStreak = 1;
    if (profileData?.last_study_date === yesterday) {
      newStreak = (profileData.current_streak || 0) + 1;
    } else if (profileData?.last_study_date === todayStr) {
      newStreak = profileData.current_streak || 1;
    }

    await supabase
      .from('profiles')
      .update({
        last_study_date: todayStr,
        current_streak: newStreak,
      })
      .eq('user_id', userId);

    console.log(`[save-quiz-result] Updated streak to ${newStreak}`);
    console.log(`[save-quiz-result] Completed successfully`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        status,
        revisionsScheduled: newRevisionTasks.length,
        streak: newStreak,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[save-quiz-result] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
