import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, Clock, CheckCircle2, Loader2, 
  RefreshCw, AlertTriangle, Sparkles, Calendar, Play
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';

interface RevisionTask {
  id: string;
  scheduled_date: string;
  task_type: string;
  is_completed: boolean;
  require_quiz: boolean | null;
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

interface GroupedTasks {
  [subjectName: string]: {
    color: string;
    tasks: RevisionTask[];
  };
}

const Revision = () => {
  const [tasks, setTasks] = useState<RevisionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

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
          require_quiz,
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
        .eq('is_completed', false)
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
    // If require_quiz is true, redirect to quiz page
    if (task.require_quiz) {
      navigate(`/quiz/${task.topic.id}`);
    } else {
      // For non-quiz revisions, also go to quiz for spaced repetition
      navigate(`/quiz/${task.topic.id}`);
    }
  };

  const handleMarkComplete = async (task: RevisionTask) => {
    if (!user) return;
    
    setCompletingTask(task.id);
    
    try {
      // Mark task as completed
      const { error } = await supabase
        .from('study_tasks')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq('id', task.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Revision completed!',
        description: `${task.topic.name} marked as done.`,
      });

      // Remove from local state
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (error) {
      console.error('Error completing revision:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to complete revision.',
      });
    } finally {
      setCompletingTask(null);
    }
  };

  // Group tasks by subject
  const groupTasksBySubject = (taskList: RevisionTask[]): GroupedTasks => {
    return taskList.reduce((acc, task) => {
      const subjectName = task.topic.chapter.subject.name;
      if (!acc[subjectName]) {
        acc[subjectName] = {
          color: task.topic.chapter.subject.color,
          tasks: [],
        };
      }
      acc[subjectName].tasks.push(task);
      return acc;
    }, {} as GroupedTasks);
  };

  // Separate tasks due today vs overdue
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(t => t.scheduled_date === today);
  const overdueTasks = tasks.filter(t => t.scheduled_date < today);
  
  const groupedTodayTasks = groupTasksBySubject(todayTasks);
  const groupedOverdueTasks = groupTasksBySubject(overdueTasks);
  
  const totalPending = tasks.length;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const renderTaskCard = (task: RevisionTask, index: number) => (
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
              {getStatusBadge(task.topic.status)}
              {task.require_quiz && (
                <Badge variant="outline" className="text-xs border-accent text-accent">
                  Quiz Required
                </Badge>
              )}
            </div>
            <p className="font-semibold text-foreground">{task.topic.name}</p>
            <p className="text-sm text-muted-foreground">{task.topic.chapter.name}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                ~20 mins
              </span>
            </div>
          </div>
          
          <div className="flex flex-col gap-2 shrink-0">
            <Button 
              variant="accent" 
              size="sm"
              onClick={() => handleStartRevision(task)}
              disabled={completingTask === task.id}
            >
              {completingTask === task.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : task.require_quiz ? (
                <>
                  <Play className="w-4 h-4 mr-1" />
                  Start Quiz
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1" />
                  Start Revision
                </>
              )}
            </Button>
            {!task.require_quiz && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleMarkComplete(task)}
                disabled={completingTask === task.id}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Mark Complete
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderGroupedTasks = (grouped: GroupedTasks) => (
    Object.entries(grouped).map(([subjectName, { color, tasks: subjectTasks }]) => (
      <div key={subjectName} className="space-y-3">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3 className="font-semibold text-foreground">{subjectName}</h3>
          <Badge variant="outline" className="text-xs">
            {subjectTasks.length} topic{subjectTasks.length > 1 ? 's' : ''}
          </Badge>
        </div>
        {subjectTasks.map((task, index) => renderTaskCard(task, index))}
      </div>
    ))
  );

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

        {/* Summary Card */}
        <Card className="shadow-card border-0 bg-gradient-to-br from-primary to-secondary text-primary-foreground">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-primary-foreground/80">Pending Revisions</p>
                <p className="text-2xl font-bold">{totalPending} topic{totalPending !== 1 ? 's' : ''}</p>
              </div>
              <Calendar className="w-10 h-10 text-primary-foreground/50" />
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-primary-foreground/80">
                Today: {todayTasks.length}
              </span>
              {overdueTasks.length > 0 && (
                <span className="text-primary-foreground/80">
                  Overdue: {overdueTasks.length}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* No Tasks State */}
        {totalPending === 0 && (
          <Card className="shadow-card border-0">
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                All caught up!
              </h3>
              <p className="text-muted-foreground">
                No revisions due. Keep studying to build your knowledge!
              </p>
            </CardContent>
          </Card>
        )}

        {/* Overdue Tasks */}
        {overdueTasks.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Overdue ({overdueTasks.length})
            </h2>
            {renderGroupedTasks(groupedOverdueTasks)}
          </div>
        )}

        {/* Today's Tasks */}
        {todayTasks.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-5 h-5 text-warning" />
              Due Today ({todayTasks.length})
            </h2>
            {renderGroupedTasks(groupedTodayTasks)}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Revision;
