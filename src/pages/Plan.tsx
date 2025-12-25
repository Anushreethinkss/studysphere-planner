import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, Clock, CheckCircle2, 
  Loader2, Target, Flame, Calendar, Brain, Sparkles, RefreshCw
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';

interface Topic {
  id: string;
  name: string;
  content: string | null;
  status: string;
  order_index: number;
  chapter: {
    id: string;
    name: string;
    order_index: number;
    subject: {
      id: string;
      name: string;
      color: string;
    };
  };
}

interface Profile {
  name: string;
  exam_date: string | null;
  daily_study_hours: number;
  current_streak: number;
}

const Plan = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [todayTopics, setTodayTopics] = useState<Topic[]>([]);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());
  const [revisionsDueCount, setRevisionsDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const calculateDailyTopics = useCallback((topics: Topic[], examDate: string | null, dailyHours: number) => {
    const pendingTopics = topics.filter(t => t.status === 'pending' || !t.status).length;
    
    if (!examDate || pendingTopics === 0) {
      // Default based on study hours: more hours = more topics
      return Math.max(2, Math.min(pendingTopics, Math.floor(dailyHours * 1.5)));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exam = new Date(examDate);
    exam.setHours(0, 0, 0, 0);
    
    const daysRemaining = Math.max(1, Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const calculatedTopics = Math.ceil(pendingTopics / daysRemaining);
    
    // Ensure minimum of 2 topics per day for engagement, max based on study hours
    const minTopics = 2;
    const maxTopics = Math.max(minTopics, Math.floor(dailyHours * 2));
    
    return Math.max(minTopics, Math.min(maxTopics, calculatedTopics, pendingTopics));
  }, []);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, exam_date, daily_study_hours, current_streak')
        .eq('user_id', user.id)
        .single();

      setProfile(profileData);

      const { data: topicsData } = await supabase
        .from('topics')
        .select(`
          id,
          name,
          content,
          status,
          order_index,
          chapter:chapters (
            id,
            name,
            order_index,
            subject:subjects (
              id,
              name,
              color
            )
          )
        `)
        .eq('user_id', user.id)
        .order('order_index', { ascending: true });

      const sortedTopics = (topicsData as unknown as Topic[])?.sort((a, b) => {
        if (a.chapter.order_index !== b.chapter.order_index) {
          return a.chapter.order_index - b.chapter.order_index;
        }
        return a.order_index - b.order_index;
      }) || [];

      setAllTopics(sortedTopics);

      const topicsPerDay = calculateDailyTopics(
        sortedTopics,
        profileData?.exam_date || null,
        profileData?.daily_study_hours || 2
      );

      const pendingTopics = sortedTopics.filter(t => t.status === 'pending' || !t.status);
      const dailyTopics = pendingTopics.slice(0, topicsPerDay);
      setTodayTopics(dailyTopics);

      const today = new Date().toISOString().split('T')[0];
      const { data: completedTasks } = await supabase
        .from('study_tasks')
        .select('topic_id')
        .eq('user_id', user.id)
        .eq('scheduled_date', today)
        .eq('is_completed', true);

      if (completedTasks) {
        setCompletedToday(new Set(completedTasks.map(t => t.topic_id)));
      }

      // Fetch revisions due today
      const { data: revisionTasks } = await supabase
        .from('study_tasks')
        .select('id')
        .eq('user_id', user.id)
        .eq('task_type', 'revision')
        .lte('scheduled_date', today)
        .eq('is_completed', false);

      setRevisionsDueCount(revisionTasks?.length || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTopic = (topicId: string) => {
    navigate(`/quiz/${topicId}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'strong':
        return <Badge className="bg-success text-white shrink-0">Strong</Badge>;
      case 'needs_revision':
        return <Badge className="bg-warning text-white shrink-0">Needs Revision</Badge>;
      case 'weak':
        return <Badge className="bg-destructive text-white shrink-0">Weak</Badge>;
      default:
        return null;
    }
  };

  const pullNextTopic = () => {
    const pendingTopics = allTopics.filter(
      t => (t.status === 'pending' || !t.status) && !todayTopics.find(tt => tt.id === t.id)
    );
    
    if (pendingTopics.length > 0) {
      setTodayTopics([...todayTopics, pendingTopics[0]]);
      toast({
        title: 'Topic added!',
        description: 'A new topic has been added to today\'s list.',
      });
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

  const completedCount = todayTopics.filter(t => completedToday.has(t.id) || (t.status && t.status !== 'pending')).length;
  const progressPercent = todayTopics.length > 0 ? (completedCount / todayTopics.length) * 100 : 0;
  
  const totalTopics = allTopics.length;
  const completedTopics = allTopics.filter(t => t.status && t.status !== 'pending').length;
  const overallProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const daysUntilExam = profile?.exam_date 
    ? Math.ceil((new Date(profile.exam_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 pb-24 space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="shadow-card border-0">
            <CardContent className="p-4 text-center">
              <Flame className="w-6 h-6 text-accent mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{profile?.current_streak || 0}</p>
              <p className="text-xs text-muted-foreground">Day Streak</p>
            </CardContent>
          </Card>
          
          <Card className="shadow-card border-0">
            <CardContent className="p-4 text-center">
              <Target className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{overallProgress}%</p>
              <p className="text-xs text-muted-foreground">Complete</p>
            </CardContent>
          </Card>
          
          {daysUntilExam && (
            <Card className="shadow-card border-0">
              <CardContent className="p-4 text-center">
                <Calendar className="w-6 h-6 text-destructive mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{daysUntilExam}</p>
                <p className="text-xs text-muted-foreground">Days Left</p>
              </CardContent>
            </Card>
          )}
          
          <Card className="shadow-card border-0">
            <CardContent className="p-4 text-center">
              <BookOpen className="w-6 h-6 text-success mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{completedTopics}/{totalTopics}</p>
              <p className="text-xs text-muted-foreground">Topics Done</p>
            </CardContent>
          </Card>
        </div>

        {/* Today's Study Card */}
        <Card className="shadow-card border-0 bg-gradient-to-br from-primary to-secondary text-primary-foreground">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-primary-foreground">
              <Sparkles className="w-5 h-5" />
              Today's Study Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <p className="text-primary-foreground/80">
                {completedCount} of {todayTopics.length} topics completed
              </p>
              <Badge variant="secondary" className="bg-card/20 text-primary-foreground">
                {todayTopics.length} topics
              </Badge>
            </div>
            <Progress value={progressPercent} className="h-3 bg-card/20" />
          </CardContent>
        </Card>

        {/* Revisions Due Banner */}
        {revisionsDueCount > 0 && (
          <Card 
            className="shadow-card border-0 bg-gradient-to-r from-warning/20 to-accent/20 cursor-pointer hover:shadow-lg transition-all"
            onClick={() => navigate('/revision')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {revisionsDueCount} revision{revisionsDueCount > 1 ? 's' : ''} due today
                    </p>
                    <p className="text-sm text-muted-foreground">Tap to view and complete</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-warning border-warning">
                  Review Now →
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Topic List */}
        <div className="space-y-3">
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent" />
            Topics for Today
          </h2>

          {todayTopics.length === 0 ? (
            <Card className="shadow-card border-0">
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
                <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                  All caught up!
                </h3>
                <p className="text-muted-foreground mb-4">
                  You've completed all your topics. Great job!
                </p>
                <Button variant="accent" onClick={pullNextTopic}>
                  <Brain className="w-4 h-4 mr-2" />
                  Study Ahead
                </Button>
              </CardContent>
            </Card>
          ) : (
            todayTopics.map((topic, index) => {
              const isCompleted = completedToday.has(topic.id) || (topic.status && topic.status !== 'pending');
              const estimatedMinutes = Math.round((profile?.daily_study_hours || 2) * 60 / todayTopics.length);

              return (
                <Card 
                  key={topic.id} 
                  className={`shadow-card border-0 transition-all duration-300 animate-fade-up ${
                    isCompleted ? 'opacity-60' : ''
                  }`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${topic.chapter.subject.color}20` }}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-6 h-6 text-success" />
                        ) : (
                          <BookOpen 
                            className="w-6 h-6" 
                            style={{ color: topic.chapter.subject.color }} 
                          />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className="text-xs"
                            style={{ 
                              borderColor: topic.chapter.subject.color, 
                              color: topic.chapter.subject.color 
                            }}
                          >
                            {topic.chapter.subject.name}
                          </Badge>
                          {isCompleted && getStatusBadge(topic.status)}
                        </div>
                        <p className={`font-semibold text-foreground ${isCompleted ? 'line-through' : ''}`}>
                          {topic.name}
                        </p>
                        <p className="text-sm text-muted-foreground">{topic.chapter.name}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            ~{estimatedMinutes} mins
                          </span>
                        </div>
                      </div>
                      
                      {!isCompleted ? (
                        <Button 
                          variant="accent" 
                          size="sm"
                          onClick={() => handleCompleteTopic(topic.id)}
                          className="shrink-0"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Mark Complete
                        </Button>
                      ) : (
                        <Badge variant="outline" className="text-success border-success shrink-0">
                          ✓ Done
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Study Ahead Button */}
          {todayTopics.length > 0 && completedCount === todayTopics.length && (
            <div className="text-center pt-4">
              <Button variant="outline" onClick={pullNextTopic}>
                <Brain className="w-4 h-4 mr-2" />
                Study Ahead - Add Next Topic
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Plan;
