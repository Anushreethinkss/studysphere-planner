import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { BookOpen, Sparkles, Target, Brain, ChevronRight, Loader2 } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  const features = [
    {
      icon: Target,
      title: 'Smart Study Plans',
      description: 'AI generates personalized study schedules based on your syllabus and goals.',
    },
    {
      icon: Brain,
      title: 'Adaptive Quizzes',
      description: 'AI-powered quizzes that test your understanding and identify weak areas.',
    },
    {
      icon: Sparkles,
      title: 'Intelligent Revision',
      description: 'Spaced repetition system ensures you never forget what you learn.',
    },
  ];

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-primary" />
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-32 h-32 rounded-full bg-accent animate-float" />
          <div className="absolute top-40 right-20 w-20 h-20 rounded-full bg-accent/50 animate-float" style={{ animationDelay: '1s' }} />
          <div className="absolute bottom-20 left-1/3 w-16 h-16 rounded-full bg-accent/30 animate-float" style={{ animationDelay: '2s' }} />
        </div>
        
        <div className="relative px-6 py-16 pb-32 text-center">
          {/* Logo */}
          <div className="inline-flex items-center gap-3 mb-8 animate-fade-up">
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-glow">
              <BookOpen className="w-9 h-9 text-accent-foreground" />
            </div>
            <span className="text-4xl font-display font-bold text-primary-foreground">StudySphere</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-display font-bold text-primary-foreground mb-4 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            Study Smarter,<br />Not Harder
          </h1>
          
          <p className="text-lg text-primary-foreground/80 max-w-md mx-auto mb-8 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            Your AI-powered study companion that adapts to your learning style and helps you master any subject.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up" style={{ animationDelay: '0.3s' }}>
            <Button 
              variant="accent" 
              size="xl"
              onClick={() => navigate('/auth')}
              className="shadow-glow"
            >
              Get Started Free
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="px-6 -mt-20 pb-16">
        <div className="max-w-lg mx-auto space-y-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div 
                key={index}
                className="bg-card rounded-2xl p-6 shadow-card animate-fade-up"
                style={{ animationDelay: `${0.4 + index * 0.1}s` }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-foreground text-lg mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div className="max-w-lg mx-auto mt-12 grid grid-cols-3 gap-4 text-center">
          <div className="animate-fade-up" style={{ animationDelay: '0.7s' }}>
            <p className="text-3xl font-display font-bold text-primary">10K+</p>
            <p className="text-sm text-muted-foreground">Students</p>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '0.8s' }}>
            <p className="text-3xl font-display font-bold text-accent">95%</p>
            <p className="text-sm text-muted-foreground">Success Rate</p>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '0.9s' }}>
            <p className="text-3xl font-display font-bold text-primary">1M+</p>
            <p className="text-sm text-muted-foreground">Topics Covered</p>
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-lg mx-auto mt-12 text-center animate-fade-up" style={{ animationDelay: '1s' }}>
          <p className="text-muted-foreground mb-4">
            Join thousands of students achieving their academic goals
          </p>
          <Button 
            variant="hero" 
            onClick={() => navigate('/auth')}
          >
            Start Your Journey
            <Sparkles className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
