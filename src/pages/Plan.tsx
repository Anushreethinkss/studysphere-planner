import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, Clock, CheckCircle2, ChevronRight, 
  Loader2, Target, Flame, Calendar, Brain, Sparkles
} from 'lucide-react';
import QuizModal from '@/components/QuizModal';
import ConfidenceModal from '@/components/ConfidenceModal';
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
  const [loading, setLoading] = useState(true);
  const [completingTopic, setCompletingTopic] = useState<string | null>(null);
  
  // Quiz state
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizTopic, setQuizTopic] = useState<Topic | null>(null);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [showConfidence, setShowConfidence] = useState(false);
  
  const { user } = useAuth();
  const { toast } = useToast();

  const calculateDailyTopics = useCallback((topics: Topic[], examDate: string | null, dailyHours: number) => {
    if (!examDate) {
      // Default to 3 topics per day if no exam date
      return Math.max(3, Math.floor(dailyHours * 1.5));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exam = new Date(examDate);
    exam.setHours(0, 0, 0, 0);
    
    const daysRemaining = Math.max(1, Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const pendingTopics = topics.filter(t => t.status === 'pending' || !t.status).length;
    
    return Math.max(1, Math.ceil(pendingTopics / daysRemaining));
  }, []);

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
        .select('name, exam_date, daily_study_hours, current_streak')
        .eq('user_id', user.id)
        .single();

      setProfile(profileData);

      // Fetch all topics with chapter and subject info
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

      // Sort topics by chapter order and topic order
      const sortedTopics = (topicsData as unknown as Topic[])?.sort((a, b) => {
        if (a.chapter.order_index !== b.chapter.order_index) {
          return a.chapter.order_index - b.chapter.order_index;
        }
        return a.order_index - b.order_index;
      }) || [];

      setAllTopics(sortedTopics);

      // Calculate topics per day
      const topicsPerDay = calculateDailyTopics(
        sortedTopics,
        profileData?.exam_date || null,
        profileData?.daily_study_hours || 2
      );

      // Get pending topics for today
      const pendingTopics = sortedTopics.filter(t => t.status === 'pending' || !t.status);
      const dailyTopics = pendingTopics.slice(0, topicsPerDay);
      setTodayTopics(dailyTopics);

      // Check for already completed topics today
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
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTopic = async (topic: Topic) => {
    setCompletingTopic(topic.id);
    setQuizTopic(topic);
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

      // Create study task record
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('study_tasks')
        .insert({
          user_id: user.id,
          topic_id: quizTopic.id,
          scheduled_date: today,
          duration_minutes: 30,
          task_type: 'study',
          is_completed: true,
          completed_at: new Date().toISOString(),
        });

      // Schedule revision based on status
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
        revisionDates = [
          new Date(todayDate.getTime() + 1 * 24 * 60 * 60 * 1000),
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
        .eq('user_id', user.id);

      // Update local state
      setCompletedToday(prev => new Set([...prev, quizTopic.id]));
      
      toast({
        title: getStatusMessage(status),
        description: `Revision scheduled. Keep going!`,
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
      setCompletingTopic(null);
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'strong': return 'Excellent! Topic mastered!';
      case 'needs_revision': return 'Good job! Revision scheduled.';
      case 'weak': return 'Keep practicing! Extra revision added.';
      default: return 'Progress saved!';
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

  const completedCount = todayTopics.filter(t => completedToday.has(t.id) || t.status !== 'pending').length;
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
                      <div className="flex items-center pt-1">
                        <Checkbox 
                          checked={isCompleted}
                          disabled={isCompleted}
                          className="w-6 h-6"
                        />
                      </div>
                      
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
                        <div className="flex items-center gap-2 mb-1">
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
                      
                      {!isCompleted && (
                        <Button 
                          variant="accent" 
                          size="sm"
                          onClick={() => handleCompleteTopic(topic)}
                          disabled={completingTopic === topic.id}
                        >
                          {completingTopic === topic.id ? (
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

      {/* Quiz Modal */}
      {showQuiz && quizTopic && (
        <QuizModal
          isOpen={showQuiz}
          onClose={() => {
            setShowQuiz(false);
            setCompletingTopic(null);
          }}
          topic={{
            id: quizTopic.id,
            name: quizTopic.name,
            content: quizTopic.content,
            chapter: quizTopic.chapter,
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

export default Plan;
