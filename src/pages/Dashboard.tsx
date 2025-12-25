import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, Flame, CheckCircle2, Clock, Trophy, 
  Brain, BookMarked, ChevronRight, LogOut, Calendar,
  Target, AlertTriangle, Sparkles, Loader2
} from 'lucide-react';
import QuizModal from '@/components/QuizModal';
import ConfidenceModal from '@/components/ConfidenceModal';
import BottomNav from '@/components/BottomNav';

interface Profile {
  name: string;
  current_streak: number;
  daily_study_hours: number;
}

interface Task {
  id: string;
  scheduled_date: string;
  duration_minutes: number;
  task_type: string;
  is_completed: boolean;
  topic: {
    id: string;
    name: string;
    content: string | null;
    status: string;
    chapter: {
      name: string;
      subject: {
        name: string;
        color: string;
      };
    };
  };
}

interface Stats {
  totalTopics: number;
  completedTopics: number;
  weakTopics: number;
  totalMinutes: number;
}

const Dashboard = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({ totalTopics: 0, completedTopics: 0, weakTopics: 0, totalMinutes: 0 });
  const [loading, setLoading] = useState(true);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  
  // Quiz state
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizTopic, setQuizTopic] = useState<Task['topic'] | null>(null);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [showConfidence, setShowConfidence] = useState(false);
  
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, current_streak, daily_study_hours, onboarding_completed')
        .eq('user_id', user.id)
        .single();

      if (profileData && !profileData.onboarding_completed) {
        navigate('/onboarding');
        return;
      }

      setProfile(profileData);

      // Fetch today's tasks
      const today = new Date().toISOString().split('T')[0];
      const { data: tasksData } = await supabase
        .from('study_tasks')
        .select(`
          id,
          scheduled_date,
          duration_minutes,
          task_type,
          is_completed,
          topic:topics (
            id,
            name,
            content,
            status,
            chapter:chapters (
              name,
              subject:subjects (
                name,
                color
              )
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('scheduled_date', today)
        .order('is_completed', { ascending: true });

      setTodayTasks((tasksData as unknown as Task[]) || []);

      // Fetch stats
      const { data: topicsData } = await supabase
        .from('topics')
        .select('status')
        .eq('user_id', user.id);

      const { data: completedTasks } = await supabase
        .from('study_tasks')
        .select('duration_minutes')
        .eq('user_id', user.id)
        .eq('is_completed', true);

      if (topicsData) {
        setStats({
          totalTopics: topicsData.length,
          completedTopics: topicsData.filter(t => ['completed', 'strong'].includes(t.status || '')).length,
          weakTopics: topicsData.filter(t => t.status === 'weak').length,
          totalMinutes: completedTasks?.reduce((acc, t) => acc + (t.duration_minutes || 0), 0) || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (task: Task) => {
    setCompletingTask(task.id);
    setQuizTopic(task.topic);
    setShowQuiz(true);
  };

  const handleQuizComplete = async (score: number, quizId: string) => {
    setShowQuiz(false);
    setQuizScore(score);
    setShowConfidence(true);
  };

  const handleConfidenceSubmit = async (confidence: 'high' | 'medium' | 'low') => {
    if (!quizTopic || !user || quizScore === null) return;

    try {
      // Determine status based on score and confidence
      let status: string;
      if (quizScore >= 80 && confidence === 'high') {
        status = 'strong';
      } else if (quizScore >= 50 || confidence === 'medium') {
        status = 'needs_revision';
      } else {
        status = 'weak';
      }

      // Update topic
      await supabase
        .from('topics')
        .update({
          status,
          confidence,
          last_quiz_score: quizScore,
          completed_at: new Date().toISOString(),
        })
        .eq('id', quizTopic.id);

      // Mark task as completed
      if (completingTask) {
        await supabase
          .from('study_tasks')
          .update({
            is_completed: true,
            completed_at: new Date().toISOString(),
          })
          .eq('id', completingTask);
      }

      // Schedule revision based on status
      const today = new Date();
      let revisionDates: Date[] = [];

      if (status === 'strong') {
        revisionDates = [
          new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
          new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000),
        ];
      } else if (status === 'needs_revision') {
        revisionDates = [
          new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000),
          new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
        ];
      } else {
        revisionDates = [
          new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000),
        ];
      }

      // Create revision tasks
      const revisionTasks = revisionDates.map(date => ({
        user_id: user.id,
        topic_id: quizTopic.id,
        scheduled_date: date.toISOString().split('T')[0],
        duration_minutes: 20,
        task_type: 'revision' as const,
      }));

      await supabase.from('study_tasks').insert(revisionTasks);

      // Update streak
      const { data: profileData } = await supabase
        .from('profiles')
        .select('last_study_date, current_streak')
        .eq('user_id', user.id)
        .single();

      const todayStr = today.toISOString().split('T')[0];
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
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
        .eq('user_id', user.id);

      toast({
        title: getStatusMessage(status),
        description: `Revision scheduled. Keep going! 🎉`,
      });

      fetchData();
    } catch (error) {
      console.error('Error updating progress:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update progress.',
      });
    } finally {
      setShowConfidence(false);
      setQuizTopic(null);
      setQuizScore(null);
      setCompletingTask(null);
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'strong': return '🏆 Excellent! Topic mastered!';
      case 'needs_revision': return '📚 Good job! Revision scheduled.';
      case 'weak': return '💪 Keep practicing! Extra revision added.';
      default: return 'Progress saved!';
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const completionPercent = stats.totalTopics > 0 
    ? Math.round((stats.completedTopics / stats.totalTopics) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="bg-gradient-primary text-primary-foreground p-6 pb-12 rounded-b-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-accent-foreground" />
            </div>
            <span className="font-display font-bold text-xl">StudySphere</span>
          </div>
          <Button variant="glass" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="animate-fade-up">
          <p className="text-primary-foreground/70 mb-1">Welcome back,</p>
          <h1 className="text-3xl font-display font-bold">{profile?.name || 'Student'}</h1>
        </div>

        {/* Streak Card */}
        <div className="mt-6 bg-card/10 backdrop-blur-lg rounded-2xl p-4 flex items-center gap-4 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center shadow-glow">
            <Flame className="w-8 h-8 text-accent-foreground" />
          </div>
          <div>
            <p className="text-primary-foreground/70 text-sm">Current Streak</p>
            <p className="text-3xl font-bold">{profile?.current_streak || 0} <span className="text-lg font-normal">days</span></p>
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="px-4 -mt-6">
        <div className="grid grid-cols-3 gap-3">
          <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            <CardContent className="p-4 text-center">
              <Target className="w-6 h-6 text-accent mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{completionPercent}%</p>
              <p className="text-xs text-muted-foreground">Complete</p>
            </CardContent>
          </Card>
          
          <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.3s' }}>
            <CardContent className="p-4 text-center">
              <Clock className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{Math.round(stats.totalMinutes / 60)}h</p>
              <p className="text-xs text-muted-foreground">Studied</p>
            </CardContent>
          </Card>
          
          <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.4s' }}>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{stats.weakTopics}</p>
              <p className="text-xs text-muted-foreground">Weak</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Today's Plan */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent" />
            Today's Plan
          </h2>
          <Badge variant="secondary" className="text-xs">
            {todayTasks.filter(t => !t.is_completed).length} remaining
          </Badge>
        </div>

        <div className="space-y-3">
          {todayTasks.length === 0 ? (
            <Card className="shadow-card border-0">
              <CardContent className="p-6 text-center">
                <Trophy className="w-12 h-12 text-accent mx-auto mb-3" />
                <p className="text-lg font-semibold text-foreground">All caught up!</p>
                <p className="text-sm text-muted-foreground">No tasks scheduled for today.</p>
              </CardContent>
            </Card>
          ) : (
            todayTasks.map((task, index) => (
              <Card 
                key={task.id} 
                className={`shadow-card border-0 transition-all duration-300 animate-fade-up ${
                  task.is_completed ? 'opacity-60' : ''
                }`}
                style={{ animationDelay: `${0.5 + index * 0.1}s` }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${task.topic.chapter.subject.color}20` }}
                    >
                      {task.is_completed ? (
                        <CheckCircle2 className="w-6 h-6 text-success" />
                      ) : task.task_type === 'revision' ? (
                        <Brain className="w-6 h-6" style={{ color: task.topic.chapter.subject.color }} />
                      ) : (
                        <BookMarked className="w-6 h-6" style={{ color: task.topic.chapter.subject.color }} />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ borderColor: task.topic.chapter.subject.color, color: task.topic.chapter.subject.color }}
                        >
                          {task.topic.chapter.subject.name}
                        </Badge>
                        {task.task_type === 'revision' && (
                          <Badge variant="secondary" className="text-xs">Revision</Badge>
                        )}
                      </div>
                      <p className="font-semibold text-foreground truncate">{task.topic.name}</p>
                      <p className="text-sm text-muted-foreground">{task.topic.chapter.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {task.duration_minutes} mins
                      </p>
                    </div>
                    
                    {!task.is_completed && (
                      <Button 
                        variant="accent" 
                        size="sm"
                        onClick={() => handleCompleteTask(task)}
                        disabled={completingTask === task.id}
                      >
                        {completingTask === task.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            Complete
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mt-6">
        <div className="grid grid-cols-2 gap-3">
          <Button 
            variant="outline" 
            className="h-auto py-4 flex flex-col items-center gap-2"
            onClick={() => navigate('/progress')}
          >
            <Target className="w-6 h-6 text-accent" />
            <span>Progress</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-4 flex flex-col items-center gap-2"
            onClick={() => navigate('/mistakes')}
          >
            <BookMarked className="w-6 h-6 text-destructive" />
            <span>Mistakes</span>
          </Button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Quiz Modal */}
      {showQuiz && quizTopic && (
        <QuizModal
          isOpen={showQuiz}
          onClose={() => {
            setShowQuiz(false);
            setCompletingTask(null);
          }}
          topic={quizTopic}
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
    </div>
  );
};

export default Dashboard;
