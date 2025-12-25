import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import AppLayout from '@/components/AppLayout';
import { 
  Target, Clock, Trophy, Brain, BookMarked, 
  TrendingUp, CheckCircle, AlertTriangle, XCircle,
  Loader2
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

interface SubjectProgress {
  name: string;
  color: string;
  total: number;
  completed: number;
  strong: number;
  needsRevision: number;
  weak: number;
}

interface CalendarDay {
  date: string;
  status: 'strong' | 'needs_revision' | 'weak' | 'none';
  count: number;
}

const Progress = () => {
  const [subjects, setSubjects] = useState<SubjectProgress[]>([]);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [totalStats, setTotalStats] = useState({
    totalTopics: 0,
    completedTopics: 0,
    totalMinutes: 0,
    avgScore: 0,
  });
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchProgress();
    }
  }, [user]);

  const fetchProgress = async () => {
    if (!user) return;

    try {
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select(`id, name, color, chapters (topics (status))`)
        .eq('user_id', user.id);

      if (subjectsData) {
        const subjectProgress: SubjectProgress[] = subjectsData.map(subject => {
          const allTopics = subject.chapters.flatMap(c => c.topics);
          return {
            name: subject.name,
            color: subject.color || '#18206F',
            total: allTopics.length,
            completed: allTopics.filter(t => ['completed', 'strong', 'needs_revision', 'weak'].includes(t.status || '')).length,
            strong: allTopics.filter(t => t.status === 'strong').length,
            needsRevision: allTopics.filter(t => t.status === 'needs_revision').length,
            weak: allTopics.filter(t => t.status === 'weak').length,
          };
        });
        setSubjects(subjectProgress);

        const totalTopics = subjectProgress.reduce((acc, s) => acc + s.total, 0);
        const completedTopics = subjectProgress.reduce((acc, s) => acc + s.completed, 0);
        
        const { data: tasksData } = await supabase
          .from('study_tasks')
          .select('duration_minutes')
          .eq('user_id', user.id)
          .eq('is_completed', true);

        const totalMinutes = tasksData?.reduce((acc, t) => acc + (t.duration_minutes || 0), 0) || 0;

        const { data: quizzesData } = await supabase
          .from('quizzes')
          .select('score')
          .eq('user_id', user.id)
          .not('score', 'is', null);

        const avgScore = quizzesData && quizzesData.length > 0
          ? Math.round(quizzesData.reduce((acc, q) => acc + (q.score || 0), 0) / quizzesData.length)
          : 0;

        setTotalStats({ totalTopics, completedTopics, totalMinutes, avgScore });
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
    } finally {
      setLoading(false);
    }
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

  const completionPercent = totalStats.totalTopics > 0
    ? Math.round((totalStats.completedTopics / totalStats.totalTopics) * 100)
    : 0;

  const pieData = subjects.map(s => ({ name: s.name, value: s.completed, color: s.color })).filter(d => d.value > 0);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-accent" />
          Progress Dashboard
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="shadow-card border-0">
            <CardContent className="p-4 text-center">
              <Target className="w-6 h-6 text-accent mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{completionPercent}%</p>
              <p className="text-xs text-muted-foreground">Overall</p>
            </CardContent>
          </Card>
          <Card className="shadow-card border-0">
            <CardContent className="p-4 text-center">
              <Clock className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{Math.round(totalStats.totalMinutes / 60)}h</p>
              <p className="text-xs text-muted-foreground">Study Time</p>
            </CardContent>
          </Card>
          <Card className="shadow-card border-0">
            <CardContent className="p-4 text-center">
              <Trophy className="w-6 h-6 text-warning mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{totalStats.avgScore}%</p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </CardContent>
          </Card>
          <Card className="shadow-card border-0">
            <CardContent className="p-4 text-center">
              <Brain className="w-6 h-6 text-success mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{totalStats.completedTopics}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card border-0">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-accent" />
              Subject Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subjects.map((subject) => {
              const percent = subject.total > 0 ? Math.round((subject.completed / subject.total) * 100) : 0;
              return (
                <div key={subject.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subject.color }} />
                      <span className="font-medium text-foreground">{subject.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{percent}%</span>
                  </div>
                  <ProgressBar value={percent} className="h-2" />
                  <div className="flex gap-2 flex-wrap">
                    {subject.strong > 0 && (
                      <Badge className="text-xs bg-success/10 text-success">
                        <CheckCircle className="w-3 h-3 mr-1" />{subject.strong} strong
                      </Badge>
                    )}
                    {subject.needsRevision > 0 && (
                      <Badge className="text-xs bg-warning/10 text-warning">
                        <AlertTriangle className="w-3 h-3 mr-1" />{subject.needsRevision} revision
                      </Badge>
                    )}
                    {subject.weak > 0 && (
                      <Badge className="text-xs bg-destructive/10 text-destructive">
                        <XCircle className="w-3 h-3 mr-1" />{subject.weak} weak
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {pieData.length > 0 && (
          <Card className="shadow-card border-0">
            <CardHeader><CardTitle className="font-display">Study Distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                    </Pie>
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Progress;
