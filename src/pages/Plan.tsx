import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, Clock, CheckCircle2, 
  Loader2, Target, Flame, Calendar, Brain, Sparkles, RefreshCw, Zap, BarChart3
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';

interface Topic {
  id: string;
  name: string;
  content: string | null;
  status: string;
  confidence: string | null;
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

interface SubjectDistribution {
  subjectId: string;
  subjectName: string;
  color: string;
  weight: number;
  topicCount: number;
  topics: Topic[];
}

const AVERAGE_TOPIC_MINUTES = 30;

const getSubjectWeight = (topics: Topic[]): number => {
  // Calculate average confidence for a subject's topics
  const confidenceLevels = topics.map(t => t.confidence).filter(Boolean);
  if (confidenceLevels.length === 0) return 1.0; // Default: medium weight
  
  const strongCount = confidenceLevels.filter(c => c === 'strong').length;
  const weakCount = confidenceLevels.filter(c => c === 'weak').length;
  const mediumCount = confidenceLevels.length - strongCount - weakCount;
  
  // Weighted average: strong=0.8, medium=1.0, weak=1.5
  const totalWeight = (strongCount * 0.8) + (mediumCount * 1.0) + (weakCount * 1.5);
  return totalWeight / confidenceLevels.length;
};

const Plan = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [todayTopics, setTodayTopics] = useState<Topic[]>([]);
  const [subjectDistribution, setSubjectDistribution] = useState<SubjectDistribution[]>([]);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());
  const [revisionsDueCount, setRevisionsDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const calculateDynamicDistribution = useCallback((
    topics: Topic[],
    dailyHours: number
  ): { distribution: SubjectDistribution[]; totalTopics: Topic[] } => {
    // Calculate total topics user can study today
    const totalAvailableMinutes = dailyHours * 60;
    const maxTopicsToday = Math.floor(totalAvailableMinutes / AVERAGE_TOPIC_MINUTES);
    
    // Get pending topics only
    const pendingTopics = topics.filter(t => t.status === 'pending' || !t.status);
    
    if (pendingTopics.length === 0) {
      return { distribution: [], totalTopics: [] };
    }

    // Group pending topics by subject
    const subjectGroups = new Map<string, { topics: Topic[]; name: string; color: string }>();
    pendingTopics.forEach(topic => {
      const subjectId = topic.chapter.subject.id;
      if (!subjectGroups.has(subjectId)) {
        subjectGroups.set(subjectId, {
          topics: [],
          name: topic.chapter.subject.name,
          color: topic.chapter.subject.color
        });
      }
      subjectGroups.get(subjectId)!.topics.push(topic);
    });

    // Calculate weights for each subject
    const subjectWeights: { subjectId: string; name: string; color: string; weight: number; topics: Topic[] }[] = [];
    let totalWeight = 0;

    subjectGroups.forEach((group, subjectId) => {
      const weight = getSubjectWeight(group.topics);
      totalWeight += weight;
      subjectWeights.push({
        subjectId,
        name: group.name,
        color: group.color,
        weight,
        topics: group.topics
      });
    });

    // Distribute topics proportionally based on weights
    let topicsToAllocate = Math.min(maxTopicsToday, pendingTopics.length);
    const distribution: SubjectDistribution[] = [];
    const allocatedTopics: Topic[] = [];

    // First pass: allocate based on weight ratio, ensuring at least 1 per subject
    subjectWeights.forEach(sw => {
      const shareRatio = sw.weight / totalWeight;
      let topicCount = Math.max(1, Math.round(topicsToAllocate * shareRatio));
      
      // Don't allocate more than available topics for this subject
      topicCount = Math.min(topicCount, sw.topics.length);
      
      const selectedTopics = sw.topics.slice(0, topicCount);
      allocatedTopics.push(...selectedTopics);
      
      distribution.push({
        subjectId: sw.subjectId,
        subjectName: sw.name,
        color: sw.color,
        weight: sw.weight,
        topicCount,
        topics: selectedTopics
      });
    });

    // Adjust if we over-allocated
    while (allocatedTopics.length > topicsToAllocate && distribution.length > 0) {
      // Find subject with most topics and reduce by 1
      const maxDist = distribution.reduce((a, b) => a.topicCount > b.topicCount ? a : b);
      if (maxDist.topicCount > 1) {
        maxDist.topicCount--;
        maxDist.topics = maxDist.topics.slice(0, maxDist.topicCount);
        allocatedTopics.pop();
      } else {
        break;
      }
    }

    // Sort distribution by topic count (highest first)
    distribution.sort((a, b) => b.topicCount - a.topicCount);

    // Flatten topics for the final list
    const finalTopics = distribution.flatMap(d => d.topics);

    return { distribution, totalTopics: finalTopics };
  }, []);

  // Refetch data when returning to this page (e.g., after quiz completion)
  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchData();
    }
  }, [user, location.key, location.state]);

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
          confidence,
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

      const today = new Date().toISOString().split('T')[0];
      
      // Get topics completed today (from study_tasks)
      const { data: todayTasks } = await supabase
        .from('study_tasks')
        .select('topic_id, is_completed')
        .eq('user_id', user.id)
        .eq('scheduled_date', today)
        .eq('task_type', 'study');

      const completedTodayIds = new Set(
        todayTasks?.filter(t => t.is_completed).map(t => t.topic_id) || []
      );
      const todayTaskTopicIds = new Set(todayTasks?.map(t => t.topic_id) || []);
      
      setCompletedToday(completedTodayIds);

      // Get topics that were completed today
      const todayCompletedTopics = sortedTopics.filter(t => {
        if (t.status && t.status !== 'pending') {
          return todayTaskTopicIds.has(t.id);
        }
        return false;
      });

      // Use the dynamic distribution algorithm
      const { distribution, totalTopics: pendingDailyTopics } = calculateDynamicDistribution(
        sortedTopics,
        profileData?.daily_study_hours || 2
      );
      
      setSubjectDistribution(distribution);
      
      // Combine: pending topics first, then completed topics at the bottom
      const dailyTopics = [...pendingDailyTopics, ...todayCompletedTopics];
      setTodayTopics(dailyTopics);

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

        {/* Today's Stats Summary */}
        {subjectDistribution.length > 0 && (
          <Card className="shadow-card border-0">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-accent" />
                <p className="font-semibold text-foreground">
                  Today you can finish {todayTopics.length} topics
                  <span className="text-muted-foreground font-normal">
                    {' '}(~{Math.round((todayTopics.length * AVERAGE_TOPIC_MINUTES) / 60 * 10) / 10} hours)
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Distribution by subject:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {subjectDistribution.map(sd => (
                  <Badge 
                    key={sd.subjectId}
                    variant="outline"
                    className="text-sm px-3 py-1"
                    style={{ borderColor: sd.color, color: sd.color }}
                  >
                    {sd.subjectName} ({sd.topicCount})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
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
              // Topic is completed only if it has a non-pending status (strong, weak, needs_revision)
              const isCompleted = topic.status === 'strong' || topic.status === 'weak' || topic.status === 'needs_revision';
              const estimatedMinutes = Math.round((profile?.daily_study_hours || 2) * 60 / todayTopics.length);

              return (
                <Card 
                  key={topic.id} 
                  className={`shadow-card border-0 transition-all duration-300 animate-fade-up ${
                    isCompleted ? 'bg-muted/50 border border-success/20' : ''
                  }`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div 
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                          isCompleted ? 'bg-success/20' : ''
                        }`}
                        style={{ backgroundColor: isCompleted ? undefined : `${topic.chapter.subject.color}20` }}
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
                            className={`text-xs ${isCompleted ? 'opacity-60' : ''}`}
                            style={{ 
                              borderColor: topic.chapter.subject.color, 
                              color: topic.chapter.subject.color 
                            }}
                          >
                            {topic.chapter.subject.name}
                          </Badge>
                          {isCompleted && getStatusBadge(topic.status)}
                        </div>
                        <p className={`font-semibold ${isCompleted ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {topic.name}
                        </p>
                        <p className={`text-sm ${isCompleted ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                          {topic.chapter.name}
                        </p>
                        {!isCompleted && (
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              ~{estimatedMinutes} mins
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {isCompleted ? (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge className="bg-success/10 text-success border-success/30">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Completed
                          </Badge>
                        </div>
                      ) : (
                        <Button 
                          variant="accent" 
                          size="sm"
                          onClick={() => handleCompleteTopic(topic.id)}
                          className="shrink-0 rounded-xl"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Mark Complete
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Study Ahead Button */}
          {todayTopics.length > 0 && (
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
