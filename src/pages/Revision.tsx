import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, Clock, CheckCircle2, Loader2, 
  RefreshCw, AlertTriangle, Sparkles, Calendar
} from 'lucide-react';
import QuizModal from '@/components/QuizModal';
import ConfidenceModal from '@/components/ConfidenceModal';
import AppLayout from '@/components/AppLayout';

interface RevisionTask {
  id: string;
  scheduled_date: string;
  task_type: string;
  is_completed: boolean;
  topic: {
    id: string;
    name: string;
    content: string | null;
    status: string;
    chapter: {
      id: string;
      name: string;
      subject: {
        id: string;
        name: string;
        color: string;
      };
    };
  };
}

const Revision = () => {
  const [tasks, setTasks] = useState<RevisionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  
  // Quiz state
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizTask, setQuizTask] = useState<RevisionTask | null>(null);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [showConfidence, setShowConfidence] = useState(false);
  
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  const fetchTasks = async () => {
    if (!user) return;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('study_tasks')
        .select(`
          id,
          scheduled_date,
          task_type,
          is_completed,
          topic:topics (
            id,
            name,
            content,
            status,
            chapter:chapters (
              id,
              name,
              subject:subjects (
                id,
                name,
                color
              )
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('task_type', 'revision')
        .lte('scheduled_date', today)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      setTasks((data as unknown as RevisionTask[]) || []);
    } catch (error) {
      console.error('Error fetching revision tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'weak':
        return <Badge className="bg-destructive text-destructive-foreground">Weak</Badge>;
      case 'needs_revision':
        return <Badge className="bg-warning text-warning-foreground">Needs Revision</Badge>;
      case 'strong':
        return <Badge className="bg-success text-success-foreground">Strong</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const handleStartRevision = (task: RevisionTask) => {
    setCompletingTask(task.id);
    setQuizTask(task);
    setShowQuiz(true);
  };

  const handleQuizComplete = (score: number, quizId: string) => {
    setShowQuiz(false);
    setQuizScore(score);
    setShowConfidence(true);
  };

  const handleConfidenceSubmit = async (confidence: 'high' | 'medium' | 'low') => {
    if (!quizTask || !user || quizScore === null) return;

    try {
      // Determine new status based on score and confidence
      let status: string;
      if (quizScore >= 80 && confidence === 'high') {
        status = 'strong';
      } else if (quizScore >= 50 || confidence === 'medium') {
        status = 'needs_revision';
      } else {
        status = 'weak';
      }

      // Update topic status
      await supabase
        .from('topics')
        .update({
          status,
          confidence,
          last_quiz_score: quizScore,
        })
        .eq('id', quizTask.topic.id);

      // Mark task as completed
      await supabase
        .from('study_tasks')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq('id', quizTask.id);

      // Schedule new revisions based on updated status
      const todayDate = new Date();
      let revisionDates: Date[] = [];

      if (status === 'strong') {
        revisionDates = [
          new Date(todayDate.getTime() + 7 * 24 * 60 * 60 * 1000),
          new Date(todayDate.getTime() + 21 * 24 * 60 * 60 * 1000),
        ];
      } else if (status === 'needs_revision') {
        revisionDates = [
          new Date(todayDate.getTime() + 3 * 24 * 60 * 60 * 1000),
          new Date(todayDate.getTime() + 7 * 24 * 60 * 60 * 1000),
        ];
      } else {
        // Weak: revision tomorrow with re-quiz
        revisionDates = [
          new Date(todayDate.getTime() + 1 * 24 * 60 * 60 * 1000),
        ];
      }

      const revisionTasks = revisionDates.map(date => ({
        user_id: user.id,
        topic_id: quizTask.topic.id,
        scheduled_date: date.toISOString().split('T')[0],
        duration_minutes: 20,
        task_type: 'revision' as const,
      }));

      await supabase.from('study_tasks').insert(revisionTasks);

      toast({
        title: status === 'weak' 
          ? "Keep practicing! Re-learn scheduled for tomorrow." 
          : "Great job! Revision complete.",
        description: `Status: ${status.replace('_', ' ')}`,
      });

      fetchTasks();
    } catch (error) {
      console.error('Error completing revision:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save revision progress.',
      });
    } finally {
      setShowConfidence(false);
      setQuizTask(null);
      setQuizScore(null);
      setCompletingTask(null);
    }
  };

  const pendingTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);
  const progressPercent = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 pb-24 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              <RefreshCw className="w-6 h-6 text-accent" />
              Revision Tasks
            </h1>
            <p className="text-muted-foreground">Review topics to strengthen your knowledge</p>
          </div>
        </div>

        {/* Progress Card */}
        <Card className="shadow-card border-0 bg-gradient-to-br from-primary to-secondary text-primary-foreground">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-primary-foreground/80">Today's Revisions</p>
                <p className="text-2xl font-bold">{completedTasks.length} / {tasks.length} completed</p>
              </div>
              <Calendar className="w-10 h-10 text-primary-foreground/50" />
            </div>
            <Progress value={progressPercent} className="h-3 bg-card/20" />
          </CardContent>
        </Card>

        {/* Pending Revisions */}
        <div className="space-y-3">
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Due for Revision ({pendingTasks.length})
          </h2>

          {pendingTasks.length === 0 ? (
            <Card className="shadow-card border-0">
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
                <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                  All caught up!
                </h3>
                <p className="text-muted-foreground">
                  No revisions due today. Keep studying!
                </p>
              </CardContent>
            </Card>
          ) : (
            pendingTasks.map((task, index) => (
              <Card 
                key={task.id} 
                className="shadow-card border-0 animate-fade-up"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${task.topic.chapter.subject.color}20` }}
                    >
                      <RefreshCw 
                        className="w-6 h-6" 
                        style={{ color: task.topic.chapter.subject.color }} 
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ 
                            borderColor: task.topic.chapter.subject.color, 
                            color: task.topic.chapter.subject.color 
                          }}
                        >
                          {task.topic.chapter.subject.name}
                        </Badge>
                        {getStatusBadge(task.topic.status)}
                      </div>
                      <p className="font-semibold text-foreground">{task.topic.name}</p>
                      <p className="text-sm text-muted-foreground">{task.topic.chapter.name}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          ~20 mins
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Due: {new Date(task.scheduled_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    <Button 
                      variant="accent" 
                      size="sm"
                      onClick={() => handleStartRevision(task)}
                      disabled={completingTask === task.id}
                      className="shrink-0"
                    >
                      {completingTask === task.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-1" />
                          Start Quiz
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Completed Today */}
        {completedTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              Completed Today ({completedTasks.length})
            </h2>

            {completedTasks.map((task) => (
              <Card key={task.id} className="shadow-card border-0 opacity-60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${task.topic.chapter.subject.color}20` }}
                    >
                      <CheckCircle2 className="w-6 h-6 text-success" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground line-through">{task.topic.name}</p>
                      <p className="text-sm text-muted-foreground">{task.topic.chapter.name}</p>
                    </div>
                    
                    <Badge variant="outline" className="text-success border-success shrink-0">
                      ✓ Done
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quiz Modal */}
      {showQuiz && quizTask && (
        <QuizModal
          isOpen={showQuiz}
          onClose={() => {
            setShowQuiz(false);
            setCompletingTask(null);
          }}
          topic={{
            id: quizTask.topic.id,
            name: quizTask.topic.name,
            content: quizTask.topic.content,
            chapter: quizTask.topic.chapter,
          }}
          onComplete={handleQuizComplete}
        />
      )}

      {/* Confidence Modal */}
      {showConfidence && quizScore !== null && (
        <ConfidenceModal
          isOpen={showConfidence}
          score={quizScore}
          onSubmit={handleConfidenceSubmit}
        />
      )}
    </AppLayout>
  );
};

export default Revision;
