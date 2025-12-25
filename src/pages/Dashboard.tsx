import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import AppLayout from '@/components/AppLayout';
import { 
  BookOpen, Flame, CheckCircle2, Clock, 
  Brain, BookMarked, ChevronRight, Calendar,
  Target, AlertCircle, Loader2, ArrowRight,
  Zap
} from 'lucide-react';

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
    chapter: {
      name: string;
      subject: {
        name: string;
        color: string;
      };
    };
  };
}

const Dashboard = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [revisionsDue, setRevisionsDue] = useState(0);
  const [mistakesCount, setMistakesCount] = useState(0);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { user } = useAuth();
  const navigate = useNavigate();

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
        .maybeSingle();

      if (profileData && !profileData.onboarding_completed) {
        navigate('/onboarding');
        return;
      }

      setProfile(profileData);

      const today = new Date().toISOString().split('T')[0];

      // Fetch today's tasks
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

      const tasks = (tasksData as unknown as Task[]) || [];
      setTodayTasks(tasks);

      // Count revision tasks due today
      const revisions = tasks.filter(t => t.task_type === 'revision' && !t.is_completed);
      setRevisionsDue(revisions.length);

      // Fetch unfixed mistakes count
      const { count: mistakesTotal } = await supabase
        .from('mistakes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('reviewed', false);

      setMistakesCount(mistakesTotal || 0);

      // Fetch upcoming tasks (next 3 from future dates)
      const { data: upcomingData } = await supabase
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
        .gt('scheduled_date', today)
        .eq('is_completed', false)
        .order('scheduled_date', { ascending: true })
        .limit(3);

      setUpcomingTasks((upcomingData as unknown as Task[]) || []);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateStr === tomorrow.toISOString().split('T')[0]) {
      return 'Tomorrow';
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const completedToday = todayTasks.filter(t => t.is_completed).length;
  const totalToday = todayTasks.length;
  const progressPercent = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="animate-fade-up">
          <p className="text-muted-foreground">Welcome back,</p>
          <h1 className="text-2xl font-display font-bold text-foreground">
            {profile?.name || 'Student'} 👋
          </h1>
        </div>

        {/* Study Streak Card */}
        <Card className="shadow-card border-0 bg-gradient-primary text-primary-foreground overflow-hidden animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-glow">
                <Flame className="w-9 h-9 text-accent-foreground" />
              </div>
              <div>
                <p className="text-primary-foreground/70 text-sm">Study Streak</p>
                <p className="text-4xl font-bold">
                  {profile?.current_streak || 0}
                  <span className="text-lg font-normal ml-1">days</span>
                </p>
                <p className="text-xs text-primary-foreground/60 mt-1">
                  Complete at least one topic or revision daily to keep it going!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Progress Card */}
        <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-foreground">Daily Progress</h3>
                <p className="text-sm text-muted-foreground">
                  {completedToday} of {totalToday} topics completed
                </p>
              </div>
              <span className="text-2xl font-bold text-primary">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
            {totalToday === 0 && (
              <p className="text-sm text-muted-foreground mt-3 text-center">
                No topics scheduled for today. <button className="text-primary underline" onClick={() => navigate('/plan')}>Go to Plan</button>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Two Column Cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Revision Due */}
          <Card 
            className="shadow-card border-0 cursor-pointer hover:shadow-lg transition-shadow animate-fade-up" 
            style={{ animationDelay: '0.3s' }}
            onClick={() => navigate('/revision')}
          >
            <CardContent className="p-4">
              <div className="w-11 h-11 rounded-xl bg-secondary/50 flex items-center justify-center mb-3">
                <Brain className="w-6 h-6 text-secondary-foreground" />
              </div>
              <p className="text-3xl font-bold text-foreground">{revisionsDue}</p>
              <p className="text-sm text-muted-foreground">Revisions Due</p>
              <Button variant="link" className="p-0 h-auto mt-2 text-primary">
                Go to Revision <ChevronRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Mistakes to Fix */}
          <Card 
            className="shadow-card border-0 cursor-pointer hover:shadow-lg transition-shadow animate-fade-up" 
            style={{ animationDelay: '0.4s' }}
            onClick={() => navigate('/mistakes')}
          >
            <CardContent className="p-4">
              <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <p className="text-3xl font-bold text-foreground">{mistakesCount}</p>
              <p className="text-sm text-muted-foreground">Mistakes to Fix</p>
              <Button variant="link" className="p-0 h-auto mt-2 text-primary">
                Review Mistakes <ChevronRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Tasks */}
        <div className="animate-fade-up" style={{ animationDelay: '0.5s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-5 h-5 text-accent" />
              Upcoming
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/calendar')}>
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {upcomingTasks.length === 0 ? (
            <Card className="shadow-card border-0">
              <CardContent className="p-6 text-center">
                <Zap className="w-10 h-10 text-accent mx-auto mb-3" />
                <p className="text-muted-foreground">No upcoming tasks scheduled</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {upcomingTasks.map((task, index) => (
                <Card 
                  key={task.id} 
                  className="shadow-card border-0 animate-fade-up"
                  style={{ animationDelay: `${0.6 + index * 0.1}s` }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${task.topic.chapter.subject.color}20` }}
                      >
                        {task.task_type === 'revision' ? (
                          <Brain className="w-5 h-5" style={{ color: task.topic.chapter.subject.color }} />
                        ) : (
                          <BookMarked className="w-5 h-5" style={{ color: task.topic.chapter.subject.color }} />
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
                        <p className="font-medium text-foreground truncate">{task.topic.name}</p>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-foreground">{formatDate(task.scheduled_date)}</p>
                        <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3" />
                          {task.duration_minutes} min
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Quick Action */}
        <Button 
          className="w-full py-6 text-lg font-semibold animate-fade-up" 
          style={{ animationDelay: '0.8s' }}
          onClick={() => navigate('/plan')}
        >
          <BookOpen className="w-5 h-5 mr-2" />
          Start Studying
        </Button>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
