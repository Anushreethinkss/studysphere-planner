import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, BookOpen, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import AppLayout from '@/components/AppLayout';

interface Topic {
  id: string;
  name: string;
  status: string | null;
  last_quiz_score: number | null;
}

interface Chapter {
  id: string;
  name: string;
  order_index: number;
  topics: Topic[];
}

interface Subject {
  id: string;
  name: string;
  color: string;
  chapters: Chapter[];
}

const Syllabus = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchSyllabus();
    }
  }, [user]);

  const fetchSyllabus = async () => {
    if (!user) return;

    try {
      // Fetch subjects
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('id, name, color')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (!subjectsData) {
        setLoading(false);
        return;
      }

      // Fetch chapters and topics for each subject
      const subjectsWithChapters = await Promise.all(
        subjectsData.map(async (subject) => {
          const { data: chaptersData } = await supabase
            .from('chapters')
            .select('id, name, order_index')
            .eq('subject_id', subject.id)
            .order('order_index', { ascending: true });

          const chaptersWithTopics = await Promise.all(
            (chaptersData || []).map(async (chapter) => {
              const { data: topicsData } = await supabase
                .from('topics')
                .select('id, name, status, last_quiz_score')
                .eq('chapter_id', chapter.id)
                .order('order_index', { ascending: true });

              return {
                ...chapter,
                topics: topicsData || [],
              };
            })
          );

          return {
            ...subject,
            chapters: chaptersWithTopics,
          };
        })
      );

      setSubjects(subjectsWithChapters);
    } catch (error) {
      console.error('Error fetching syllabus:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'strong':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'needs_revision':
        return <Clock className="w-4 h-4 text-warning" />;
      case 'weak':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'strong':
        return <Badge className="bg-success/20 text-success text-xs">Mastered</Badge>;
      case 'needs_revision':
        return <Badge className="bg-warning/20 text-warning text-xs">Review</Badge>;
      case 'weak':
        return <Badge className="bg-destructive/20 text-destructive text-xs">Weak</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Pending</Badge>;
    }
  };

  const calculateProgress = (topics: Topic[]) => {
    if (topics.length === 0) return 0;
    const completed = topics.filter(t => t.status && t.status !== 'pending').length;
    return Math.round((completed / topics.length) * 100);
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

  const totalTopics = subjects.reduce((acc, s) => acc + s.chapters.reduce((a, c) => a + c.topics.length, 0), 0);
  const completedTopics = subjects.reduce(
    (acc, s) => acc + s.chapters.reduce(
      (a, c) => a + c.topics.filter(t => t.status && t.status !== 'pending').length, 0
    ), 0
  );

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-accent" />
            Your Syllabus
          </h1>
          <p className="text-muted-foreground mt-1">
            {completedTopics} of {totalTopics} topics completed
          </p>
        </div>

        {/* Subjects */}
        {subjects.length === 0 ? (
          <Card className="shadow-card border-0">
            <CardContent className="p-8 text-center">
              <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                No syllabus found
              </h3>
              <p className="text-muted-foreground">
                Complete the onboarding to add your syllabus.
              </p>
            </CardContent>
          </Card>
        ) : (
          subjects.map((subject) => {
            const subjectProgress = calculateProgress(
              subject.chapters.flatMap(c => c.topics)
            );

            return (
              <Card key={subject.id} className="shadow-card border-0 overflow-hidden">
                <CardHeader className="pb-2" style={{ backgroundColor: `${subject.color}10` }}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${subject.color}20` }}
                      >
                        <BookOpen className="w-5 h-5" style={{ color: subject.color }} />
                      </div>
                      <span style={{ color: subject.color }}>{subject.name}</span>
                    </CardTitle>
                    <Badge 
                      variant="outline" 
                      style={{ borderColor: subject.color, color: subject.color }}
                    >
                      {subjectProgress}% complete
                    </Badge>
                  </div>
                  <Progress 
                    value={subjectProgress} 
                    className="h-2 mt-3"
                    style={{ backgroundColor: `${subject.color}20` }}
                  />
                </CardHeader>
                <CardContent className="p-0">
                  <Accordion type="multiple" className="w-full">
                    {subject.chapters.map((chapter, chapterIdx) => {
                      const chapterProgress = calculateProgress(chapter.topics);
                      
                      return (
                        <AccordionItem 
                          key={chapter.id} 
                          value={chapter.id}
                          className="border-b last:border-0"
                        >
                          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                            <div className="flex items-center gap-3 flex-1">
                              <span className="text-sm font-medium text-muted-foreground w-8">
                                {chapterIdx + 1}.
                              </span>
                              <span className="font-medium text-foreground flex-1 text-left">
                                {chapter.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {chapter.topics.filter(t => t.status && t.status !== 'pending').length}/{chapter.topics.length}
                                </span>
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div 
                                    className="h-full rounded-full transition-all"
                                    style={{ 
                                      width: `${chapterProgress}%`,
                                      backgroundColor: subject.color 
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="px-4 pb-3 space-y-2">
                              {chapter.topics.map((topic, topicIdx) => (
                                <div 
                                  key={topic.id}
                                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                >
                                  {getStatusIcon(topic.status)}
                                  <span className="text-sm text-muted-foreground w-6">
                                    {topicIdx + 1}.
                                  </span>
                                  <span className="flex-1 text-foreground text-sm">
                                    {topic.name}
                                  </span>
                                  {getStatusBadge(topic.status)}
                                  {topic.last_quiz_score !== null && (
                                    <span className="text-xs text-muted-foreground">
                                      {topic.last_quiz_score}%
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </AppLayout>
  );
};

export default Syllabus;
